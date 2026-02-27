import { AlertOctagon, ArrowDownToLine, ArrowUpFromLine, Clock3, HandCoins, Handshake, LogOut, Send, Sparkles, UserRound, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { acceptMoneyRequest, createMoneyRequest, deposit, rejectMoneyRequest, settleLoanRequestPenalties, settleUserOverdrafts, transfer, withdraw } from "@/app/actions/bankActions";
import { signoutAction } from "@/app/actions/authActions";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveLocale, translate } from "@/lib/i18n";
import LanguageToggle from "@/app/components/language-toggle";
import SubmitWithOverlay from "@/app/components/form-pending-overlay";

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type SearchParams = {
  transferError?: string;
  transferSuccess?: string;
  depositError?: string;
  withdrawError?: string;
  lang?: string;
};

type AccountWithCount = {
  id: number;
  name: string;
  balanceCents: number;
  createdAt: Date;
  _count: { transactions: number };
};

type TxnWithAccount = {
  id: number;
  description: string | null;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  source: string | null;
  createdAt: Date;
  account: { name: string };
};

type TargetAccount = { name: string; user: { name: string } };
type OverdraftAnchor = { accountId: number; createdAt: Date };
type RequestRow = {
  id: number;
  requesterId: number;
  targetUserId: number;
  amountCents: number;
  type: string;
  status: string;
  description: string | null;
  dueAt: Date;
  createdAt: Date;
  penaltyAccruedCents: number;
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const locale = resolveLocale(resolvedParams.lang ?? cookieStore.get("lang")?.value ?? "en");
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  if (!user.isVerified) {
    redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  }

  await settleUserOverdrafts(user.id);
  await settleLoanRequestPenalties(user.id);

  const [accounts, transactions, targetAccountNames, overdraftAnchors, incomingRequests, outgoingRequests] = await Promise.all([
    prisma.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { transactions: true } } },
    }) as Promise<AccountWithCount[]>,
    prisma.transaction.findMany({
      where: { account: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { account: { select: { name: true } } },
    }) as Promise<TxnWithAccount[]>,
    prisma.account.findMany({
      where: { userId: { not: user.id } },
      select: { name: true, user: { select: { name: true } } },
    }) as Promise<TargetAccount[]>,
    prisma.transaction.findMany({
      where: { account: { userId: user.id }, type: { in: ["OVERDRAFT_ALERT"] } },
      orderBy: { createdAt: "desc" },
      select: { accountId: true, createdAt: true },
    }) as Promise<OverdraftAnchor[]>,
    prisma.request.findMany({
      where: { targetUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.request.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ] as const);

  const totalBalanceCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0);
  const userAccount = accounts[0];
  const userAccountId = userAccount?.id;
  const hasAccounts = accounts.length > 0;
  const transferError = resolvedParams?.transferError;
  const transferSuccess = resolvedParams?.transferSuccess;
  const depositError = resolvedParams?.depositError;
  const withdrawError = resolvedParams?.withdrawError;
  const suggestedNames: string[] = Array.from(
    new Set<string>(
      targetAccountNames
        .flatMap((n) => [n.name, n.user.name, `${n.name} — ${n.user.name}`])
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => a.localeCompare(b));

  const anchorMap = new Map<number, Date>();
  for (const alert of overdraftAnchors) {
    if (!anchorMap.has(alert.accountId)) {
      anchorMap.set(alert.accountId, alert.createdAt);
    }
  }

  const delinquentAccounts = accounts
    .filter((a) => a.balanceCents < 0)
    .map((a) => {
      const anchor = anchorMap.get(a.id) ?? a.createdAt;
      const dueAt = new Date(anchor.getTime() + 30 * MS_PER_DAY);
      const msLeft = Math.max(0, dueAt.getTime() - Date.now());
      const daysLeft = Math.floor(msLeft / MS_PER_DAY);
      const hoursLeft = Math.floor((msLeft % MS_PER_DAY) / (1000 * 60 * 60));
      const daysSinceAnchor = Math.max(0, Math.floor((Date.now() - anchor.getTime()) / MS_PER_DAY));
      const projectedBalance = Math.round(a.balanceCents * Math.pow(1.05, daysSinceAnchor));
      const penaltyDelta = projectedBalance - a.balanceCents;

      return {
        id: a.id,
        name: a.name,
        balanceCents: a.balanceCents,
        projectedBalance,
        penaltyDelta,
        anchor,
        dueAt,
        daysLeft,
        hoursLeft,
      };
    });

  const incomingPending = incomingRequests.filter((r) => r.status === "PENDING");
  const outgoingPending = outgoingRequests.filter((r) => r.status === "PENDING");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{t("simpleBank")}</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              {t("welcomeBack", { name: user.name })}
            </h1>
            <p className="text-slate-400">
              {t("intro")}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="glass-panel w-full max-w-md rounded-2xl px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/30 ring-1 ring-white/10">
              {t("transferHelper")}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <LanguageToggle locale={locale} />
              <Link
                href="/dashboard/account"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:bg-white/20"
                aria-label={t("manageAccount")}
              >
                <UserRound className="h-5 w-5" />
              </Link>
              <form action={signoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <LogOut className="h-4 w-4" /> {t("signOut")}
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="glass-panel col-span-2 rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">{t("balance")}</p>
                  <p className="mt-2 text-4xl font-semibold text-white">{formatCurrency(totalBalanceCents / 100)}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                  <Wallet className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3 auto-rows-fr">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex min-h-[150px] flex-col justify-between rounded-2xl bg-white/5 p-4 ring-1 ring-white/5 transition hover:-translate-y-1 hover:ring-white/20"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-400">{account.name}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(account.balanceCents / 100)}</p>
                    <p className="text-xs text-slate-400">{t("transactionsCount", { count: account._count.transactions })}</p>
                  </div>
                ))}
                {accounts.length === 0 && (
                  <p className="text-slate-300">{t("noAccounts")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="glass-panel h-full rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-rose-500/15 via-amber-500/10 to-white/0 p-6">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/4 top-0 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />
                <div className="absolute right-1/4 bottom-0 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />
              </div>
              {delinquentAccounts.length ? (
                <div className="relative flex flex-1 flex-col space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-amber-200/80">{t("overdraftNotice")}</p>
                      <p className="text-2xl font-semibold text-white">{t("payWithin")}</p>
                      <p className="text-sm text-amber-100/80">{t("overdraftPenalty")}</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/30">
                      <AlertOctagon className="h-6 w-6" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {delinquentAccounts.map((acct) => (
                      <div
                        key={acct.id}
                        className="rounded-2xl border border-amber-400/30 bg-black/20 p-4 text-amber-50 shadow-inner shadow-amber-500/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">{acct.name}</p>
                            <p className="text-xs text-amber-100/80">{t("negativeSince", { date: acct.anchor.toLocaleDateString() })}</p>
                            <p className="text-xs text-amber-100/80">{t("willDeleteAfter", { date: acct.dueAt.toLocaleDateString() })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-rose-100">{formatCurrency(acct.projectedBalance / 100)}</p>
                            <p className="text-xs text-amber-200">{t("includesFees", { amount: formatCurrency(Math.abs(acct.penaltyDelta) / 100) })}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-amber-50">
                          <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 font-semibold ring-1 ring-amber-300/30">
                            <Clock3 className="h-3.5 w-3.5" /> {t("dueIn", { days: acct.daysLeft, hours: acct.hoursLeft })}
                          </div>
                          <p className="text-[11px] text-amber-100/80">{t("dailyPenalty")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="relative flex flex-1 flex-col justify-between space-y-3 min-h-[220px]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-200">{t("accountStatus")}</p>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-300/30">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-3xl font-semibold text-white">{t("allClear")}</p>
                  <p className="text-sm text-slate-300">{t("healthyBalances")}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-400 animate-[pulse_2.4s_ease-in-out_infinite]" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30 lg:col-span-2">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{t("incomingRequests")}</h2>
                <HandCoins className="h-5 w-5 text-amber-200" />
              </div>
              {incomingPending.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">{t("noPendingRequests")}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {incomingPending.map((req) => {
                    const isLoan = req.type === "LOAN";
                    const tone = isLoan ? "text-rose-200" : "text-emerald-200";
                    const bg = isLoan ? "bg-rose-500/10 border-rose-400/30" : "bg-emerald-500/10 border-emerald-400/30";
                    const daysLeft = Math.max(0, Math.ceil((req.dueAt.getTime() - Date.now()) / MS_PER_DAY));

                    return (
                      <div
                        key={req.id}
                        className={`flex flex-col gap-4 rounded-2xl border ${bg} p-4 text-white shadow-inner shadow-black/20`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">{isLoan ? t("loanRequest") : t("paymentRequest")}</p>
                            <p className="text-xs text-slate-200">{t("amountLabel", { amount: formatCurrency(req.amountCents / 100) })}</p>
                            {req.description && <p className="text-xs text-slate-300">{t("noteLabel", { note: req.description })}</p>}
                            <p className="text-xs text-amber-100">{t("dueInDays", { days: daysLeft })}</p>
                            {isLoan && (
                              <p className="text-xs font-semibold text-rose-200">{t("adminPenalty")}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-end">
                          <form action={acceptMoneyRequest}>
                            <input type="hidden" name="requestId" value={req.id} />
                            <SubmitWithOverlay
                              label={t("accept")}
                              pendingLabel={t("acceptPending")}
                              overlayMessage={t("acceptOverlay")}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 sm:w-auto"
                            >
                              <Handshake className="h-4 w-4" /> {t("accept")}
                            </SubmitWithOverlay>
                          </form>

                          <form action={rejectMoneyRequest}>
                            <input type="hidden" name="requestId" value={req.id} />
                            <SubmitWithOverlay
                              label={t("reject")}
                              pendingLabel={t("rejectPending")}
                              overlayMessage={t("rejectOverlay")}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
                            >
                              <XCircle className="h-4 w-4" /> {t("reject")}
                            </SubmitWithOverlay>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{t("requestMoney")}</h2>
                <Send className="h-5 w-5 text-blue-200" />
              </div>
              <form action={createMoneyRequest} className="space-y-3">
                <label className="space-y-2 text-sm text-slate-200">
                  {t("recipientName")}
                  <input
                    name="targetName"
                    list="account-name-options"
                    required
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                    placeholder={t("accountPlaceholder")}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-200">
                  {t("amount")}
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                    placeholder={t("amountPlaceholder")}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-200">
                  {t("type")}
                  <select
                    name="type"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white ring-1 ring-white/10 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                  >
                    <option value="DEMAND" className="bg-slate-900">{t("demandOption")}</option>
                    <option value="LOAN" className="bg-slate-900">{t("loanOption")}</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-200">
                  {t("noteOptional")}
                  <input
                    name="description"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                    placeholder={t("descriptionPlaceholder")}
                  />
                </label>
                <p className="text-xs text-slate-400">{t("requestHelper")}</p>
                <SubmitWithOverlay
                  label={t("sendRequest")}
                  pendingLabel={t("sendingRequest")}
                  overlayMessage={t("sendingRequestOverlay")}
                  className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:bg-blue-400 inline-flex items-center justify-center gap-2"
                >
                  {t("sendRequest")}
                </SubmitWithOverlay>
              </form>

              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="flex items-center gap-2 text-sm text-slate-200">
                  <HandCoins className="h-4 w-4 text-amber-200" /> {t("outgoingRequests")}
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {outgoingPending.length === 0 && <p className="text-slate-400">{t("noOutgoing")}</p>}
                  {outgoingPending.map((req) => (
                    <div key={req.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                      <div className="space-y-1">
                        <p className="font-semibold text-white">{req.type === "LOAN" ? t("loanRequest") : t("paymentRequest")}</p>
                        <p className="text-[11px] text-slate-400">{t("dueDate", { date: req.dueAt.toLocaleDateString() })}</p>
                      </div>
                      <p className={`text-sm font-semibold ${req.type === "LOAN" ? "text-rose-200" : "text-emerald-200"}`}>
                        {formatCurrency(req.amountCents / 100)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{t("depositTitle")}</h2>
                <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                  {t("instant")}
                </div>
              </div>
              <form action={deposit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("accountLabel")}
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-emerald-300/60 focus-within:ring-emerald-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{userAccount?.name ?? user.name ?? t("accountLabel")}</span>
                        <span className="text-xs text-slate-400">{t("linkedToProfile")}</span>
                      </div>
                      {userAccountId && <input type="hidden" name="accountId" value={userAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("sourceLabel")}
                    <select
                      name="source"
                      defaultValue="Mobile Wallet"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                    >
                      <option value="Mobile Wallet" className="bg-slate-900">{t("mobileWallet")}</option>
                      <option value="Credit/Debit Card" className="bg-slate-900">{t("card")}</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("amount")}
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                      placeholder={t("amountPlaceholder")}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("description")}
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                      placeholder={t("descriptionPlaceholderDeposit")}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-300" /> {t("depositHelper")}
                </div>
                {depositError && (
                  <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 shadow-inner shadow-rose-500/20">
                    {depositError}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <SubmitWithOverlay
                    label={t("deposit")}
                    pendingLabel={t("depositPending")}
                    overlayMessage={t("depositOverlay")}
                    disabled={!hasAccounts}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem] sm:w-auto"
                  >
                    <ArrowDownToLine className="h-4 w-4" /> {t("deposit")}
                  </SubmitWithOverlay>
                </div>
              </form>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{t("withdrawTitle")}</h2>
                <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-200">
                  {t("protected")}
                </div>
              </div>
              <form action={withdraw} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("accountLabel")}
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-rose-200/70 focus-within:ring-rose-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{userAccount?.name ?? user.name ?? t("accountLabel")}</span>
                        <span className="text-xs text-slate-400">{t("linkedToProfile")}</span>
                      </div>
                      {userAccountId && <input type="hidden" name="accountId" value={userAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("amount")}
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                      placeholder={t("amountPlaceholder")}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("description")}
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                      placeholder={t("descriptionPlaceholderWithdraw")}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <ArrowUpFromLine className="h-4 w-4 text-rose-200" /> {t("withdrawHelper")}
                </div>
                {withdrawError && (
                  <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 shadow-inner shadow-rose-500/20">
                    {withdrawError}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <SubmitWithOverlay
                    label={t("withdraw")}
                    pendingLabel={t("withdrawPending")}
                    overlayMessage={t("withdrawOverlay")}
                    disabled={!hasAccounts}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-white/25 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem] sm:w-auto"
                  >
                    <ArrowUpFromLine className="h-4 w-4" /> {t("withdraw")}
                  </SubmitWithOverlay>
                </div>
              </form>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{t("sendMoney")}</h2>
                <div className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
                  {t("byAccountName")}
                </div>
              </div>
              <form action={transfer} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                    {t("fromAccount")}
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-blue-200/70 focus-within:ring-blue-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{userAccount?.name ?? user.name ?? t("accountLabel")}</span>
                        <span className="text-xs text-slate-400">{t("linkedToProfile")}</span>
                      </div>
                      {userAccountId && <input type="hidden" name="fromAccountId" value={userAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                    {t("toAccountName")}
                    <input
                      name="toAccountName"
                      required
                      list="account-name-options"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder={t("toAccountPlaceholder")}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    {t("amount")}
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder={t("amountPlaceholderTransfer")}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-3">
                    {t("note")}
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder={t("notePlaceholder")}
                    />
                  </label>
                </div>
                <datalist id="account-name-options">
                  {suggestedNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <Send className="h-4 w-4 text-blue-200" />
                  {t("transferHelper")}
                </div>
                {transferError && (
                  <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 shadow-inner shadow-rose-500/20">
                    {transferError}
                  </div>
                )}
                {transferSuccess && !transferError && (
                  <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-50 shadow-inner shadow-emerald-500/20">
                    {t("transferSent")}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {!hasAccounts && (
                    <p className="text-sm text-slate-400">{t("noAccountsAvailable")}</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-start">
                    <SubmitWithOverlay
                      label={t("send")}
                      pendingLabel={t("transferPending")}
                      overlayMessage={t("transferOverlay")}
                      disabled={!hasAccounts}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem] sm:w-auto"
                    >
                      <Send className="h-4 w-4" /> {t("send")}
                    </SubmitWithOverlay>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t("recentActivity")}</h2>
              <p className="text-sm text-slate-400">{t("latestTransactions")}</p>
            </div>
            <div className="mt-4 divide-y divide-white/5">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{txn.description || txn.type}</p>
                    <p className="text-xs text-slate-400">
                      {txn.account.name} • {new Date(txn.createdAt).toLocaleString()}
                      {txn.source ? ` • ${txn.source}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <span
                      className={
                        txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN"
                          ? "text-emerald-300"
                          : "text-rose-200"
                      }
                    >
                      {txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN" ? "+" : "-"}
                      {formatCurrency(txn.amountCents / 100)}
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                      {t("balanceAfter", { amount: formatCurrency(txn.balanceAfterCents / 100) })}
                    </span>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="py-4 text-slate-300">{t("noTransactions")}</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
