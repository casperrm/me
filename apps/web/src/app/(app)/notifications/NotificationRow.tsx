"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const SEVERITY_STYLE: Record<string, string> = {
  INFO: "bg-cedar-50 text-cedar-700",
  WARNING: "bg-amber-50 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export interface NotificationRowData {
  id: string;
  severity: string;
  category: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  status: string;
  clientName: string | null;
  createdAt: string;
}

export function NotificationRow({ notification }: { notification: NotificationRowData }) {
  const router = useRouter();
  const [status, setStatus] = useState(notification.status);
  const [loading, setLoading] = useState(false);

  async function act(action: "read" | "acknowledge") {
    setLoading(true);
    try {
      await fetch(`/api/notifications/${notification.id}/${action}`, { method: "POST" });
      setStatus(action === "read" ? "READ" : "ACKNOWLEDGED");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className={`rounded-md border border-neutral-100 p-3 ${status === "UNREAD" ? "bg-cedar-50/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLE[notification.severity] ?? ""}`}>
              {notification.severity}
            </span>
            <span className="text-xs text-neutral-400">{notification.category}</span>
            {notification.clientName && <span className="text-xs text-neutral-400">· {notification.clientName}</span>}
          </div>
          <p className="mt-1 text-sm font-medium text-neutral-800">
            {notification.actionUrl ? (
              <Link href={notification.actionUrl} className="hover:underline" onClick={() => status === "UNREAD" && act("read")}>
                {notification.title}
              </Link>
            ) : (
              notification.title
            )}
          </p>
          {notification.body && <p className="mt-0.5 text-sm text-neutral-500">{notification.body}</p>}
          <p className="mt-1 text-xs text-neutral-300">{new Date(notification.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          {status === "UNREAD" && (
            <button onClick={() => act("read")} disabled={loading} className="text-cedar-700 hover:underline disabled:opacity-50">
              Mark read
            </button>
          )}
          {status !== "ACKNOWLEDGED" && (
            <button onClick={() => act("acknowledge")} disabled={loading} className="text-neutral-500 hover:underline disabled:opacity-50">
              Acknowledge
            </button>
          )}
          {status === "ACKNOWLEDGED" && <span className="text-neutral-400">Acknowledged</span>}
        </div>
      </div>
    </li>
  );
}
