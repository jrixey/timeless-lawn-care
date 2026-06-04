import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth/config";
import { getSessionScope } from "@/lib/auth/scope";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionScope();
  if (session) redirect("/dashboard");
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/dashboard",
      });
    } catch (err) {
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err; // re-throw Next.js redirect control-flow
    }
  }

  return (
    <div className="center-page">
      <div className="card login-card">
        <div className="brand">
          Bea<span>con</span>
        </div>
        <div className="brand-sub">Lead capture &amp; AI receptionist</div>
        <form action={login}>
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required />
          <label htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required />
          {error ? <div className="error">Invalid email or password.</div> : null}
          <div style={{ marginTop: 16 }}>
            <button className="btn" type="submit" style={{ width: "100%" }}>
              Sign in
            </button>
          </div>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>
          Demo logins are printed by <code>npm run db:seed</code>.
        </p>
      </div>
    </div>
  );
}
