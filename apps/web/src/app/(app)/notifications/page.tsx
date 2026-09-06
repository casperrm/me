import { Card } from "@/components/Card";
import { requireActor } from "@/lib/guards";
import { listNotifications } from "@/lib/services/notification-service";
import { NotificationRow } from "./NotificationRow";
import { MarkAllReadButton } from "./MarkAllReadButton";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const actor = await requireActor();
  const notifications = await listNotifications(actor.membership.id);
  const hasUnread = notifications.some((n) => n.status === "UNREAD");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-neutral-500">Approvals, quality control, and escalations (Bible Section 30).</p>
      </div>
      <Card action={hasUnread && <MarkAllReadButton />}>
        {notifications.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={{
                  id: n.id,
                  severity: n.severity,
                  category: n.category,
                  title: n.title,
                  body: n.body,
                  actionUrl: n.actionUrl,
                  status: n.status,
                  clientName: n.client?.name ?? null,
                  createdAt: n.createdAt.toISOString(),
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
