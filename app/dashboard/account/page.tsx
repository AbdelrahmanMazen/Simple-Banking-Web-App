import { ArrowLeft, Check, Lock, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LanguageToggle from "@/app/components/language-toggle";
import { updateProfile } from "@/app/actions/bankActions";
import { getCurrentUser } from "@/lib/auth";
import { resolveLocale, translate } from "@/lib/i18n";

type SearchParams = {
  saved?: string;
  lang?: string;
};

export default async function AccountSettingsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const locale = resolveLocale(resolvedParams.lang ?? cookieStore.get("lang")?.value ?? "en");
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isVerified) redirect(`/verify?email=${encodeURIComponent(user.email)}`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-14">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-slate-300">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" /> {t("backToDashboard")}
            </Link>
            <span className="hidden text-xs uppercase tracking-[0.2em] text-slate-400 sm:inline">{t("account")}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle locale={locale} />
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
              <Shield className="h-4 w-4" /> {t("secureSettings")}
            </div>
          </div>
        </header>

        <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-8">
            <div className="flex flex-col gap-2">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{t("yourProfile")}</p>
              <h1 className="text-3xl font-semibold text-white">{t("manageNamePassword")}</h1>
              <p className="text-slate-400">{t("updateProfileHint")}</p>
            </div>

            {resolvedParams.saved && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                <Check className="h-4 w-4" /> {t("changesSaved")}
              </div>
            )}

            <div className="mt-6 grid gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
                  <UserRound className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">{t("signedInAs")}</p>
                  <p className="text-lg font-semibold text-white">{user.name}</p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
              </div>
            </div>

            <form action={updateProfile} className="mt-8 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-100">
                  {t("displayName")}
                  <input
                    name="name"
                    defaultValue={user.name}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                    placeholder="Your name"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-100">
                  {t("newPassword")}
                  <input
                    name="password"
                    type="password"
                    minLength={6}
                    maxLength={80}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                    placeholder="Leave blank to keep"
                  />
                </label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">{t("passwordHint")}</p>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  <Lock className="h-4 w-4" /> {t("saveChanges")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
