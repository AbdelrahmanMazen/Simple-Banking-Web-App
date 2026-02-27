import { ArrowDownToLine, ArrowUpFromLine, Banknote, LogOut, Send, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deposit, transfer, withdraw } from "@/app/actions/bankActions";
import { signoutAction } from "@/app/actions/authActions";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });
}

type SearchParams = {
  transferError?: string;
  transferSuccess?: string;
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedParams = (await searchParams) ?? {};
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }
  if (!user.isVerified) {
    redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  }

  const [accounts, transactions, targetAccountNames] = await Promise.all([
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
  ] as const);

  const totalBalanceCents = accounts.reduce((sum, a) => sum + a.balanceCents, 0);
  const primaryAccount = accounts[0];
  const primaryAccountId = primaryAccount?.id;
  const hasAccounts = accounts.length > 0;
  const transferError = resolvedParams?.transferError;
  const transferSuccess = resolvedParams?.transferSuccess;
  const suggestedNames: string[] = Array.from(
    new Set<string>(
      targetAccountNames
        .flatMap((n) => [n.name, n.user.name, `${n.name} — ${n.user.name}`])
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => a.localeCompare(b));

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
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">SimpleBank</p>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              Welcome back, {user.name}
            </h1>
            <p className="text-slate-400">
              Track balances, deposits, and withdrawals in a lightweight, demo-friendly bank.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="glass-panel w-full max-w-md rounded-2xl px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/30 ring-1 ring-white/10">
              Send money by account name only, and manage deposits/withdrawals below.
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link
                href="/dashboard/account"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 transition hover:-translate-y-0.5 hover:bg-white/20"
                aria-label="Manage account settings"
              >
                <UserRound className="h-5 w-5" />
              </Link>
              <form action={signoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <LogOut className="h-4 w-4" /> Sign out
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
                  <p className="text-sm text-slate-400">Balance</p>
                  <p className="mt-2 text-4xl font-semibold text-white">{formatCurrency(totalBalanceCents / 100)}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                  <Wallet className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/5 transition hover:-translate-y-1 hover:ring-white/20"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-400">{account.name}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(account.balanceCents / 100)}</p>
                    <p className="mt-2 text-xs text-slate-400">{account._count.transactions} transactions</p>
                  </div>
                ))}
                {accounts.length === 0 && (
                  <p className="text-slate-300">No accounts yet. Create one to get started.</p>
                )}
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/10 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300">Account health</p>
                <Banknote className="h-5 w-5 text-emerald-300" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-white">Stable</p>
              <p className="mt-1 text-sm text-slate-400">SQLite store locally; use Postgres in production hosting.</p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-full w-4/5 rounded-full bg-emerald-400" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Deposit</h2>
                <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Instant
                </div>
              </div>
              <form action={deposit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Account
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-emerald-300/60 focus-within:ring-emerald-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{primaryAccount?.name ?? "Select an account"}</span>
                        <span className="text-xs text-slate-400">Auto-selected</span>
                      </div>
                      {primaryAccountId && <input type="hidden" name="accountId" value={primaryAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Source
                    <select
                      name="source"
                      defaultValue="Mobile Wallet"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                    >
                      <option value="Mobile Wallet" className="bg-slate-900">Mobile Wallet</option>
                      <option value="Credit/Debit Card" className="bg-slate-900">Credit/Debit Card</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                      placeholder="100.00"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Description
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                      placeholder="Paycheck, gift, etc."
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-300" /> Funds are added instantly and logged as transactions.
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="submit"
                    disabled={!hasAccounts}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem]"
                  >
                    <ArrowDownToLine className="h-4 w-4" /> Deposit
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Withdraw</h2>
                <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-slate-200">
                  Protected
                </div>
              </div>
              <form action={withdraw} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Account
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-rose-200/70 focus-within:ring-rose-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{primaryAccount?.name ?? "Select an account"}</span>
                        <span className="text-xs text-slate-400">Auto-selected</span>
                      </div>
                      {primaryAccountId && <input type="hidden" name="accountId" value={primaryAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                      placeholder="50.00"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Description
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                      placeholder="Groceries, ATM, etc."
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <ArrowUpFromLine className="h-4 w-4 text-rose-200" /> Withdrawals will fail if funds are insufficient.
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="submit"
                    disabled={!hasAccounts}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-white/25 transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem]"
                  >
                    <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
            <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Send money</h2>
                <div className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
                  By account name
                </div>
              </div>
              <form action={transfer} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                    From account
                    <div className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white ring-1 ring-white/5 focus-within:border-blue-200/70 focus-within:ring-blue-200/30">
                      <div className="flex h-full items-center justify-between text-sm text-slate-200">
                        <span className="truncate">{primaryAccount?.name ?? "Select an account"}</span>
                        <span className="text-xs text-slate-400">Auto-selected</span>
                      </div>
                      {primaryAccountId && <input type="hidden" name="fromAccountId" value={primaryAccountId} />}
                    </div>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                    To account name
                    <input
                      name="toAccountName"
                      required
                      list="account-name-options"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder="Account or owner name"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder="120.00"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-3">
                    Note
                    <input
                      name="description"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-blue-200/70 focus:ring-blue-200/30 focus:outline-none"
                      placeholder="Rent, reimbursement, etc."
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
                  Send by account name or owner name; use the combined suggestion to avoid ambiguity. Transfers happen instantly.
                </div>
                {transferError && (
                  <p className="text-sm font-semibold text-rose-200">{transferError}</p>
                )}
                {transferSuccess && !transferError && (
                  <p className="text-sm font-semibold text-emerald-200">Transfer sent.</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {!hasAccounts && (
                    <p className="text-sm text-slate-400">No accounts available. Your first account is created on sign up.</p>
                  )}
                  <div className="flex justify-end sm:justify-start">
                    <button
                      type="submit"
                      disabled={!hasAccounts}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[8rem]"
                    >
                      <Send className="h-4 w-4" /> Send
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent activity</h2>
              <p className="text-sm text-slate-400">Latest transactions</p>
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
                      Bal: {formatCurrency(txn.balanceAfterCents / 100)}
                    </span>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="py-4 text-slate-300">No transactions yet. Make a deposit to see activity.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
