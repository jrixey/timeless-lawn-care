import { redirect } from "next/navigation";
import { getSessionScope } from "@/lib/auth/scope";

export default async function Home() {
  const session = await getSessionScope();
  redirect(session ? "/dashboard" : "/login");
}
