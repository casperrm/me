"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/clients", label: "Partners", icon: "☺" },
  { href: "/calendar", label: "Content Calendar", icon: "▣" },
  { href: "/campaigns", label: "Boost Campaigns", icon: "▲" },
  { href: "/invoices", label: "Analytics & Invoicing", icon: "◎" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/brain", label: "Cedar Point Brain", icon: "⚙" },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full w-64 flex-col bg-cedar-900 text-cedar-50">
      <div className="px-6 py-6">
        <div className="text-xl font-bold">Cedar Point</div>
        <div className="text-xs text-cedar-300">Agency Command Center</div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-cedar-700 text-white" : "text-cedar-200 hover:bg-cedar-800"
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-cedar-800">
        <div className="px-3 pb-2 text-xs text-cedar-400 truncate">Signed in as {userName}</div>
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 text-sm rounded-lg text-cedar-200 hover:bg-cedar-800"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
