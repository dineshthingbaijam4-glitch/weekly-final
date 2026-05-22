import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TA Weekly Dashboard",
  description: "Talent Acquisition Weekly Hiring Funnel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
