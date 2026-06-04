import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
// Force resolution of the JWT module so the augmentation below applies.
import type {} from "next-auth/jwt";
import { z } from "zod";
import { env } from "@/lib/env";
import type { Role } from "@/lib/domain/types";
import { UNSAFE_findUserByEmail } from "./lookup.js";
import { verifyPassword } from "./password.js";

// Augment the session/JWT with our tenant claims.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      agencyId: string;
      clientId: string | null;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    agencyId: string;
    clientId: string | null;
    role: Role;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    agencyId: string;
    clientId: string | null;
    role: Role;
  }
}

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.authSecret,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await UNSAFE_findUserByEmail(parsed.data.email);
        if (!user) return null;
        const ok = await verifyPassword(parsed.data.password, user.password_hash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          agencyId: user.agency_id,
          clientId: user.client_id,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.agencyId = user.agencyId;
        token.clientId = user.clientId;
        token.role = user.role;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.sub ?? "";
      session.user.agencyId = token.agencyId;
      session.user.clientId = token.clientId;
      session.user.role = token.role;
      return session;
    },
  },
});
