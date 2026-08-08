import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo Live Tracker | Bio-Mesh Location Telemetry",
  description: "Privacy-first consensual real-time location streaming platform with temporary encrypted tracking links.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-screen flex flex-col bg-[#030a07] bg-web-grid text-emerald-50 selection:bg-emerald-500 selection:text-white antialiased">
        {children}
      </body>
    </html>
  );
}
