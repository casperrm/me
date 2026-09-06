import { requireActor } from "@/lib/guards";
import { logoutAction } from "@/lib/actions/auth";

// Client Portal pages read the session cookie and query per-user scoped
// data — never statically prerender/cache them.
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-cedar-600" />
          <span className="text-sm font-semibold tracking-tight">Cedar Point OS — Client Portal</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>{actor.user.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="text-neutral-500 hover:text-neutral-800 hover:underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-8">{children}</main>
    </div>
  );
}
