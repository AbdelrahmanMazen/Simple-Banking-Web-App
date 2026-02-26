import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimpleBank",
  description: "Lightweight banking demo with accounts, deposits, and withdrawals.",
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
