import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GapLab | Agent Behavior Research",
  description: "Find the gap between agent success and failure. Improve prompts with reproducible paired evaluations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
