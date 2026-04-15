import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import LanguageToggle from "@/app/components/language-toggle";
import { signinAction } from "@/app/actions/authActions";
import { getCurrentUser } from "@/lib/auth";
import { resolveLocale, translate } from "@/lib/i18n";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("lang")?.value || "en");
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);

  return (
    <div className="min-h-screen bg-slate-950/60 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-14">
        <div className="glass-lite rounded-3xl p-[1.5px]">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/10 to-white/0 p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{t("simpleBank")}</p>
                <h1 className="text-3xl font-semibold text-white">{t("authSigninTitle")}</h1>
                <p className="mt-2 text-slate-300">{t("authSigninSubtitle")}</p>
              </div>
              <div className="flex items-center gap-2">
                <LanguageToggle locale={locale} />
                <Link
                  href="/signup"
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  {t("authSigninNeedAccount")}
                </Link>
              </div>
            </div>
            <div className="mt-6 border-t border-white/5 pt-6">
              <form action={signinAction} className="space-y-4">
              <label className="space-y-2 text-sm text-slate-200">
                {t("authEmail")}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                {t("authPassword")}
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
              >
                {t("authContinue")}
              </button>
              <p className="text-xs text-slate-400">{t("authAdminNote")}</p>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
