import { Prisma } from "@prisma/client";
import { Funnel, History, ListFilter, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { adminClearAuditTrail, adminDeleteUser, adminUpdateAccount, updateMostafaDebt } from "@/app/actions/bankActions";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import SubmitWithOverlay from "@/app/components/form-pending-overlay";
import TransactionsManager from "./transactions-manager";

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });
}

type AdminAccount = {
  id: number;
  name: string;
  balanceCents: number;
  _count: { transactions: number };
  user: { name: string; email: string };
};

type AdminTxn = {
  id: number;
  description: string | null;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  source: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  deletionReason: string | null;
  deletedByUser: { name: string; email: string } | null;
  account: { name: string; user: { name: string } };
};

type AdminSearchParams = {
  type?: string;
  q?: string;
  includeDeleted?: string;
};

export default async function AdminPage({ searchParams }: { searchParams?: Promise<AdminSearchParams> }) {
  const resolvedParams = (await searchParams) ?? {};
  const filterType = resolvedParams.type?.toUpperCase();
  const includeDeleted = resolvedParams.includeDeleted === "1";
  const query = resolvedParams.q?.trim();

  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isVerified) redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  if (!user.isAdmin) redirect("/dashboard");

  const domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL?.toLowerCase();
  const isDomainAdmin = domainAdminEmail ? user.email.toLowerCase() === domainAdminEmail : user.isAdmin;

  const baseTxnFilter: Prisma.TransactionWhereInput = includeDeleted ? {} : { deletedAt: null };
  const filteredTxWhere: Prisma.TransactionWhereInput = {
    ...baseTxnFilter,
    ...(filterType ? { type: filterType } : {}),
    ...(query
      ? {
          OR: [
            { description: { contains: query, mode: "insensitive" } },
            { source: { contains: query, mode: "insensitive" } },
            { account: { name: { contains: query, mode: "insensitive" } } },
            { account: { user: { name: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [counts, accounts, recentTx, deletedTx, mostafaDebt] = await Promise.all([
    prisma.$transaction([
      prisma.user.count(),
      prisma.account.count(),
      prisma.transaction.count({ where: { deletedAt: null } }),
      prisma.transaction.count({ where: { deletedAt: { not: null } } }),
      prisma.account.aggregate({ _sum: { balanceCents: true } }),
    ]),
    prisma.account.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { transactions: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) as Promise<AdminAccount[]>,
    prisma.transaction.findMany({
      where: filteredTxWhere,
      include: {
        account: { select: { name: true, user: { select: { name: true, email: true } } } },
        deletedByUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }) as Promise<AdminTxn[]>,
    prisma.transaction.findMany({
      where: { deletedAt: { not: null } },
      include: {
        account: { select: { name: true, user: { select: { name: true, email: true } } } },
        deletedByUser: { select: { name: true, email: true } },
      },
      orderBy: { deletedAt: "desc" },
      take: 15,
    }) as Promise<AdminTxn[]> ,
    prisma.account.findFirst({
      where: { user: { name: { contains: "Mostafa", mode: "insensitive" } }, name: { contains: "debt", mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, balanceCents: true, user: { select: { name: true, email: true } } },
    }),
  ] as const);

  const [totalUsers, totalAccounts, totalActiveTransactions, totalDeletedTransactions, balanceAgg] = counts;
  const totalBalanceCents = balanceAgg._sum.balanceCents ?? 0;
  const recentTxView = recentTx.map((txn) => ({
    id: txn.id,
    description: txn.description,
    type: txn.type,
    amountCents: txn.amountCents,
    balanceAfterCents: txn.balanceAfterCents,
    source: txn.source,
    createdAt: txn.createdAt.toISOString(),
    deletedAt: txn.deletedAt ? txn.deletedAt.toISOString() : null,
    deletionReason: txn.deletionReason,
    account: { name: txn.account.name, user: { name: txn.account.user.name } },
    deletedByUser: txn.deletedByUser ? { name: txn.deletedByUser.name, email: txn.deletedByUser.email } : null,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-3xl font-semibold text-white">System overview</h1>
            <p className="text-slate-400">Manage users, accounts, and monitor recent activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
              <ShieldCheck className="h-4 w-4" /> Admin access
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-slate-300 ring-1 ring-white/10">
              Active tx: {totalActiveTransactions.toLocaleString()} • Deleted tx: {totalDeletedTransactions.toLocaleString()}
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Users</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalUsers}</p>
            <p className="text-xs text-slate-500">Unique verified customers</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Accounts</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalAccounts}</p>
            <p className="text-xs text-slate-500">Active bank accounts</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Transactions</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalActiveTransactions}</p>
            <p className="text-xs text-slate-500">Soft-deleted: {totalDeletedTransactions}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Balance</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(totalBalanceCents / 100)}</p>
            <p className="text-xs text-slate-500">System-wide holdings</p>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-rose-500/10 to-white/0 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-rose-200">Danger zone</p>
                <h2 className="text-lg font-semibold text-white">Delete user</h2>
                <p className="text-sm text-slate-300">Removes user, accounts, transactions, sessions, and requests.</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
                {domainAdminEmail ? `Only ${domainAdminEmail} can execute.` : "Admins only."}
              </div>
            </div>

            <form action={adminDeleteUser} className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label className="space-y-2 text-sm font-medium text-slate-100 lg:col-span-1">
                User ID
                <input
                  name="userId"
                  type="number"
                  min="1"
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                  placeholder="e.g. 12"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 lg:col-span-2">
                Reason (optional)
                <input
                  name="reason"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                  placeholder="Why this user is being deleted"
                />
              </label>
              <div className="lg:col-span-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-xs text-rose-200">Cannot delete domain admin or yourself.</p>
                <SubmitWithOverlay
                  label="Delete user"
                  pendingLabel="Deleting..."
                  overlayMessage="Deleting user..."
                  disabled={!isDomainAdmin}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> Delete user
                </SubmitWithOverlay>
              </div>
            </form>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-300">Domain admin tools</p>
                <h2 className="text-lg font-semibold text-white">Manage any account</h2>
                <p className="text-sm text-slate-400">Edit balances, names, ownership, and creation dates.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
                  <Wrench className="h-4 w-4" /> Restricted
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
                  {domainAdminEmail ? `Only ${domainAdminEmail} can execute.` : "Admins only."}
                </div>
              </div>
            </div>

            <form action={adminUpdateAccount} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-100">
                Account ID
                <input
                  name="accountId"
                  type="number"
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="e.g. 1"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                New balance (EGP)
                <input
                  name="balance"
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Leave empty to keep"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                New name
                <input
                  name="name"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Optional"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                Reassign to user ID
                <input
                  name="ownerUserId"
                  type="number"
                  min="1"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Optional"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                Created at (ISO or date string)
                <input
                  name="createdAt"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="2024-01-15T12:00:00Z"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                Description / audit note
                <input
                  name="description"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Why this change is made"
                />
              </label>
              <div className="md:col-span-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-400">
                  {domainAdminEmail ? `Only the domain admin (${domainAdminEmail}) can run these actions.` : "Restricted to admins only."}
                </p>
                <SubmitWithOverlay
                  label="Apply changes"
                  pendingLabel="Applying..."
                  overlayMessage="Updating account..."
                  disabled={!isDomainAdmin}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wrench className="h-4 w-4" /> Apply changes
                </SubmitWithOverlay>
              </div>
            </form>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">Accounts</p>
                <h2 className="text-lg font-semibold text-white">Top recent accounts</h2>
              </div>
              <Users className="h-5 w-5 text-emerald-200" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {accounts.map((acct) => (
                <div key={acct.id} className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{acct.name}</p>
                      <p className="text-xs text-slate-400">{acct.user.name} • {acct.user.email}</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                      {acct._count.transactions} tx
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-white">{formatCurrency(acct.balanceCents / 100)}</p>
                  <p className="text-xs text-slate-500">Account #{acct.id}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <History className="h-4 w-4" /> Transaction history
                </div>
                <h2 className="text-lg font-semibold text-white">Recent transactions</h2>
                <p className="text-sm text-slate-400">Filter, search, and clear transactions. Deleted entries disappear from user history but remain auditable here.</p>
              </div>
              <form className="flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10 lg:w-auto lg:flex-row lg:items-center lg:gap-3" method="get">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-slate-400">
                  <ListFilter className="h-4 w-4" /> Filters
                </div>
                <select
                  name="type"
                  defaultValue={filterType ?? ""}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                >
                  <option value="">All types</option>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="WITHDRAW">Withdraw</option>
                  <option value="TRANSFER_IN">Transfer In</option>
                  <option value="TRANSFER_OUT">Transfer Out</option>
                  <option value="OVERDRAFT_ALERT">Overdraft Alert</option>
                  <option value="OVERDRAFT_FEE">Overdraft Fee</option>
                  <option value="ADMIN_ADJUST">Admin Adjust</option>
                  <option value="REQUEST_PENALTY_IN">Penalty In</option>
                  <option value="REQUEST_PENALTY_OUT">Penalty Out</option>
                </select>
                <input
                  name="q"
                  defaultValue={query ?? ""}
                  placeholder="Search by account, user, source, description"
                  className="h-10 min-w-[240px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    name="includeDeleted"
                    value="1"
                    defaultChecked={includeDeleted}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-300"
                  />
                  Include deleted
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  <Funnel className="h-4 w-4" /> Apply
                </button>
              </form>
            </div>
            <div className="mt-4">
              <TransactionsManager transactions={recentTxView} isDomainAdmin={isDomainAdmin} />
              {recentTx.length === 0 && <p className="py-4 text-slate-300">No transactions match this filter.</p>}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-rose-500/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-rose-200">Audit trail</p>
                <h2 className="text-lg font-semibold text-white">Deleted transactions</h2>
                <p className="text-sm text-slate-400">Kept for compliance while hidden from all user views.</p>
              </div>
              {mostafaDebt && (
                <div className="flex flex-col gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-100 ring-1 ring-rose-400/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">Mostafa debt</p>
                      <p className="text-lg font-semibold">{formatCurrency(mostafaDebt.balanceCents / 100)}</p>
                      <p className="text-[11px] text-rose-200">Acct #{mostafaDebt.id} • {mostafaDebt.user.name}</p>
                    </div>
                  </div>
                  <form action={updateMostafaDebt} className="flex flex-col gap-2 text-[11px] text-white/80 md:flex-row md:items-center">
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      className="h-9 w-28 rounded-xl border border-white/15 bg-white/5 px-2 text-sm text-white placeholder:text-white/50 ring-1 ring-white/10 focus:border-white/60 focus:ring-white/20 focus:outline-none"
                      placeholder="Amount"
                    />
                    <div className="flex gap-1">
                      <SubmitWithOverlay
                        label="Pay"
                        pendingLabel="Updating..."
                        overlayMessage="Updating Mostafa debt..."
                        name="direction"
                        value="pay"
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-400 px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-300"
                      >
                        Pay
                      </SubmitWithOverlay>
                      <SubmitWithOverlay
                        label="Add"
                        pendingLabel="Updating..."
                        overlayMessage="Updating Mostafa debt..."
                        name="direction"
                        value="add"
                        className="inline-flex items-center justify-center rounded-lg bg-white/20 px-3 py-2 text-[11px] font-bold text-white ring-1 ring-white/30 transition hover:-translate-y-0.5 hover:bg-white/30"
                      >
                        Add
                      </SubmitWithOverlay>
                    </div>
                  </form>
                </div>
              )}
              <form action={adminClearAuditTrail} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10 md:flex-row md:items-center md:gap-3">
                <input
                  name="confirm"
                  required
                  placeholder="Type CLEAR to purge"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                />
                <SubmitWithOverlay
                  label="Clear audit log"
                  pendingLabel="Clearing..."
                  overlayMessage="Clearing audit log..."
                  disabled={!isDomainAdmin}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> Clear audit log
                </SubmitWithOverlay>
              </form>
            </div>
            <div className="mt-4 divide-y divide-white/5">
              {deletedTx.map((txn) => (
                <div key={txn.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between md:gap-6">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">{txn.description || txn.type}</p>
                    <p className="text-xs text-slate-400">
                      #{txn.id} • {txn.account.user.name} • {txn.account.name} • {new Date(txn.createdAt).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-rose-200">
                      Deleted at {txn.deletedAt ? new Date(txn.deletedAt).toLocaleString() : ""} by {txn.deletedByUser?.name || "Admin"}
                      {txn.deletionReason ? ` • ${txn.deletionReason}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                    <span className="text-slate-200">{formatCurrency(txn.amountCents / 100)}</span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">Bal: {formatCurrency(txn.balanceAfterCents / 100)}</span>
                  </div>
                </div>
              ))}
              {deletedTx.length === 0 && <p className="py-4 text-slate-300">No deleted transactions yet.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
