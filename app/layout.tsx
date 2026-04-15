import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Tajawal, Inter } from "next/font/google";
import "./globals.css";
import { resolveLocale, translate } from "@/lib/i18n";
import LegalNoticeBannerLazy from "@/app/components/legal-notice-banner-lazy";

const tajawal = Tajawal({ subsets: ["arabic"], weight: ["400", "500", "700"], display: "swap", variable: "--font-tajawal" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SimpleBank",
  description: "Lightweight banking demo with accounts, deposits, and withdrawals.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("lang")?.value || "en");
  const ramadanEndsAt = Date.UTC(2026, 2, 20); // 20 Mar 2026
  const showRamadan = Date.now() < ramadanEndsAt;
  const baseFont = locale === "ar" ? tajawal.className : inter.className;
  const baseBg = showRamadan
    ? "bg-gradient-to-br from-emerald-950 via-slate-950 to-amber-900"
    : "bg-slate-950";
  const ramadanGreeting = translate(locale, "ramadanGreeting");
  const legalTitle = translate(locale, "legalNoticeTitle");
  const legalBody = translate(locale, "legalNoticeBody");
  const footerCopyright = translate(locale, "footerCopyright");
  const designedByLabel = translate(locale, "designedByLabel");
  const designedByName = translate(locale, "designedByName");

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className={`${baseFont} antialiased ${baseBg}`}>
        {showRamadan && (
          <div className="pointer-events-none fixed inset-0 z-0 opacity-90">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(248,180,0,0.08),transparent_30%),radial-gradient(circle_at_70%_70%,rgba(59,130,246,0.08),transparent_32%),radial-gradient(circle_at_15%_75%,rgba(234,179,8,0.06),transparent_38%)]" />
            <div className="absolute left-1/2 top-6 h-24 w-24 -translate-x-1/2 rotate-12 rounded-full border border-amber-300/30 bg-amber-200/10 shadow-[0_0_40px_rgba(250,204,21,0.25)]" aria-hidden />
            <div className="absolute right-12 top-16 h-3 w-16 rounded-full bg-emerald-300/30 blur-md" aria-hidden />
            {/* Lantern glows */}
            <div className="absolute left-[12%] top-28 h-16 w-16 -rotate-6 rounded-full bg-gradient-to-br from-amber-400/50 via-amber-200/30 to-transparent shadow-[0_0_30px_rgba(234,179,8,0.4)]" aria-hidden />
            <div className="absolute right-[10%] top-44 h-14 w-14 rotate-3 rounded-full bg-gradient-to-br from-emerald-300/40 via-emerald-200/25 to-transparent shadow-[0_0_26px_rgba(74,222,128,0.35)]" aria-hidden />
            <div className="absolute left-[55%] top-[55%] h-18 w-18 -rotate-2 rounded-full bg-gradient-to-br from-cyan-300/35 via-cyan-100/20 to-transparent shadow-[0_0_24px_rgba(103,232,249,0.3)]" aria-hidden />
            <div className="absolute left-[22%] bottom-16 h-14 w-14 rotate-6 rounded-full bg-gradient-to-br from-amber-300/45 via-amber-100/20 to-transparent shadow-[0_0_26px_rgba(250,204,21,0.35)]" aria-hidden />
            {/* Hanging lantern stems */}
            <div className="absolute left-[12%] top-0 h-28 w-px bg-gradient-to-b from-amber-200/60 to-amber-200/0" aria-hidden />
            <div className="absolute right-[10%] top-0 h-32 w-px bg-gradient-to-b from-emerald-200/60 to-emerald-200/0" aria-hidden />
            <div className="absolute left-[55%] top-0 h-36 w-px bg-gradient-to-b from-cyan-200/60 to-cyan-200/0" aria-hidden />
          </div>
        )}
        {showRamadan && (
          <div className="fixed inset-x-0 top-0 z-40 flex justify-center p-3">
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-400/30 shadow-lg shadow-emerald-500/20">
              <span className="inline-flex h-3 w-3 rounded-full bg-amber-300" aria-hidden />
              <span>{ramadanGreeting}</span>
            </div>
          </div>
        )}
        <div className="relative z-10 min-h-screen">{children}</div>
        <footer className="relative z-20 border-t border-white/5 bg-black/20 px-6 py-5 backdrop-blur-sm md:backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-slate-200/85">
            <div className={`flex items-center gap-3 ${locale === "ar" ? "flex-row-reverse text-right" : "text-left"}`}>
              <img src="/Logo/Layer1.png" alt="SimpleBank logo" className="h-14 w-auto" />
              <div className={`flex flex-col leading-tight ${locale === "ar" ? "text-right" : "text-left"}`}>
                <span className={locale === "ar" ? "text-[11px] text-slate-400" : "text-[11px] uppercase tracking-[0.2em] text-slate-400"}>
                  {designedByLabel}
                </span>
                <span className={locale === "ar" ? "text-base text-slate-100" : "signature-font text-base text-slate-100"}>
                  {designedByName}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-200">{footerCopyright}</div>
            <div className="text-xs text-slate-300">{legalTitle}</div>
            <div className="text-xs text-slate-400">{legalBody}</div>
          </div>
        </footer>
        <LegalNoticeBannerLazy title={legalTitle} body={legalBody} />
      </body>
    </html>
  );
}
