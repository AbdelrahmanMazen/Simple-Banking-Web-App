import { cookies } from "next/headers";
import { resolveLocale, translate } from "@/lib/i18n";

export default async function GlobalLoading() {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("lang")?.value || "en");
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="relative flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-5 shadow-2xl shadow-black/40 ring-1 ring-white/10">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 animate-[spin_1.8s_linear_infinite] rounded-full border-2 border-white/15 border-t-emerald-400" />
          <div className="absolute inset-3 animate-[spin_1.4s_linear_infinite_reverse] rounded-full border-2 border-white/10 border-t-cyan-300" />
          <div className="absolute inset-6 animate-pulse rounded-full bg-emerald-400/80" />
        </div>
        <div className="space-y-1">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{t("loadingProcessing")}</p>
          <p className="text-lg font-semibold text-white">{t("loadingWorking")}</p>
          <p className="text-xs text-slate-400">{t("loadingKeepOpen")}</p>
        </div>
      </div>
    </div>
  );
}
