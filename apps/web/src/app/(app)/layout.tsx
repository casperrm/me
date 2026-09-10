import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireActor } from "@/lib/guards";
import { isAuthorized } from "@cedar/auth";
import { logoutAction } from "@/lib/actions/auth";
import { unreadNotificationCount } from "@/lib/services/notification-service";
import { isMfaEnrollmentRequired } from "@/lib/services/mfa-policy-service";
import { CommandPalette } from "./CommandPalette";

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

  // Section 23.1 enforcement gate (docs/specs/mfa.md) — an org that has
  // turned this on gets every OWNER/ADMIN who hasn't enrolled redirected
  // to /security on every other page until they do. /security itself is
  // exempt (it's how they enroll) and is compared via the real pathname
  // the middleware forwards, not a route-group assumption.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname !== "/security" && (await isMfaEnrollmentRequired(actor))) {
    redirect("/security?mfaRequired=1");
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

  const canSeeAiSupervisor = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "ai:supervise",
  });

  const canSeeIntegrations = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "organization:manage",
  });

  // Template editing (docs/specs/projects-and-calendar.md) is gated
  // org-wide clients:write, same tier as creating a template from any
  // client's project — mirrors how /integrations gates its own nav item
  // on the same permission its page requires, rather than showing a link
  // that would just crash into a permission-denied card underneath.
  const canSeeTemplates = await isAuthorized({
    userId: actor.user.id,
    organizationId: actor.organizationId,
    permission: "clients:write",
  });

  const unreadCount = await unreadNotificationCount(actor.membership.id);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", badge: 0 },
    { href: "/clients", label: "Clients", badge: 0 },
    { href: "/calendar", label: "Calendar", badge: 0 },
    { href: "/meetings", label: "Meetings", badge: 0 },
    { href: "/notifications", label: "Notifications", badge: unreadCount },
    { href: "/command", label: "Cedar Command Center", badge: 0 },
    ...(canSeeAiSupervisor ? [{ href: "/command/supervisor", label: "AI Supervisor", badge: 0 }] : []),
    { href: "/metrics", label: "Metrics Catalog", badge: 0 },
    ...(canSeeTemplates ? [{ href: "/templates", label: "Project Templates", badge: 0 }] : []),
    ...(canSeeTemplates ? [{ href: "/memory", label: "Agency Memory", badge: 0 }] : []),
    ...(canSeeIntegrations ? [{ href: "/integrations", label: "Integration Center", badge: 0 }] : []),
    ...(canSeeTeam ? [{ href: "/team", label: "Team & Permissions", badge: 0 }] : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white p-4">
        <div>
          <div className="mb-8 flex items-center gap-2 px-2">
            <div className="h-7 w-7 rounded-md bg-cedar-600" />
            <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
          </div>
          <div className="mb-3">
            <CommandPalette />
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-cedar-50 hover:text-cedar-800"
              >
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="rounded-full bg-cedar-600 px-1.5 py-0.5 text-xs font-medium text-white">{item.badge}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-neutral-100 pt-3">
          <div className="px-2 text-xs text-neutral-500">
            <div className="font-medium text-neutral-700">{actor.user.name}</div>
            <div>{actor.membership.role}</div>
          </div>
          <Link href="/security" className="mt-2 block rounded-md px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50">
            Security
          </Link>
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
