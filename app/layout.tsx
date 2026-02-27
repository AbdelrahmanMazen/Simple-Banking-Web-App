import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Tajawal, Inter } from "next/font/google";
import "./globals.css";
import { resolveLocale } from "@/lib/i18n";

const tajawal = Tajawal({ subsets: ["arabic"], weight: ["400", "500", "700"], display: "swap", variable: "--font-tajawal" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SimpleBank",
  description: "Lightweight banking demo with accounts, deposits, and withdrawals.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("lang")?.value || "en");

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className={`${locale === "ar" ? tajawal.className : inter.className} antialiased bg-slate-950`}>{children}</body>
    </html>
  );
}
