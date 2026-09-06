import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cedar Point OS",
  description: "AI-native operating system for Cedar Point Media",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/command", label: "Cedar Command Center" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white p-4">
            <div className="mb-8 flex items-center gap-2 px-2">
              <div className="h-7 w-7 rounded-md bg-cedar-600" />
              <span className="text-sm font-semibold tracking-tight">Cedar Point OS</span>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-cedar-50 hover:text-cedar-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
