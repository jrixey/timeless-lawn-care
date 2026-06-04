import { redirect } from "next/navigation";
import { getSessionScope } from "@/lib/auth/scope";
import { signOut } from "@/lib/auth/config";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionScope();
  if (!session) redirect("/login");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Bea<span>con</span>
        </div>
        <div className="brand-sub">
          {session.isAgency ? "Agency console" : "Client console"}
        </div>
        <nav className="nav">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/clients">Clients</NavLink>
          <NavLink href="/inbox">Lead inbox</NavLink>
          <NavLink href="/pipeline">Pipeline</NavLink>
          <NavLink href="/reporting">Reporting</NavLink>
        </nav>
        <form action={logout} style={{ marginTop: 24 }}>
          <button className="btn secondary small" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
