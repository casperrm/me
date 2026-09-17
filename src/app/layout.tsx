import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cedar Point | Agency Command Center",
  description: "The all-in-one platform for Cedar Point Consulting - clients, content, boosts, invoicing, and the Cedar Point Brain AI assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
