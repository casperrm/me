import Link from "next/link";
import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { getReadableClientIds } from "@/lib/readable-clients";
import { getUpcomingEvents } from "@/lib/services/calendar-service";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  task_due: "Task",
  project_due: "Project",
  invoice_due: "Invoice",
};

const TYPE_STYLE: Record<string, string> = {
  task_due: "bg-cedar-50 text-cedar-700",
  project_due: "bg-amber-50 text-amber-700",
  invoice_due: "bg-neutral-100 text-neutral-600",
};

export default async function CalendarPage() {
  const actor = await requireActor();
  const clientIds = await getReadableClientIds(actor);

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 60);

  const events = await getUpcomingEvents({ organizationId: actor.organizationId, clientIds, from, to });

  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.date.toDateString();
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(event);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-neutral-500">
          Deadlines, invoice due dates, and project milestones over the next 60 days (Section 12).
        </p>
      </div>

      <Card>
        {byDate.size === 0 ? (
          <p className="text-sm text-neutral-400">Nothing due in the next 60 days.</p>
        ) : (
          <div className="space-y-4">
            {[...byDate.entries()].map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <div className="mb-1 text-xs font-medium text-neutral-500">
                  {new Date(dateKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <ul className="space-y-1">
                  {dayEvents.map((event, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${TYPE_STYLE[event.type]}`}>
                        {TYPE_LABEL[event.type]}
                      </span>
                      <Link href={event.href} className="hover:text-cedar-700 hover:underline">
                        {event.title}
                      </Link>
                      <span className="text-xs text-neutral-400">— {event.clientName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
