import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/guards";
import { isAuthorized } from "@cedar/auth";
import { logoutAction } from "@/lib/actions/auth";

// Every authenticated page reads the session cookie and queries per-user
// data — none of it should ever be statically prerendered/cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  // A Client Portal contact has zero organization-wide permissions by
  // design (Section 15.2) — the internal app shell has nothing for them
  // to see, so send them to their curated view instead of a wall of
  // permission-denied cards.
  if (actor.membership.role === "CLIENT_PORTAL") {
    redirect("/portal");
  }

  const canSeeTeam = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "members:invite",
  }) || (await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "members:manage",
  }));

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clients", label: "Clients" },
    { href: "/calendar", label: "Calendar" },
    { href: "/command", label: "Cedar Command Center" },
    ...(canSeeTeam ? [{ href: "/team", label: "Team & Permissions" }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white p-4">
        <div>
          <div className="mb-8 flex items-center gap-2 px-2">
            <div className="h-7 w-7 rounded-md bg-cedar-600" />
            <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-cedar-50 hover:text-cedar-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-neutral-100 pt-3">
          <div className="px-2 text-xs text-neutral-500">
            <div className="font-medium text-neutral-700">{actor.user.name}</div>
            <div>{actor.membership.role}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
