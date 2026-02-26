import { ShieldCheck, Users, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { adminUpdateAccount } from "@/app/actions/bankActions";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  account: { name: string; user: { name: string } };
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isVerified) redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  if (!user.isAdmin) redirect("/dashboard");

  const domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL?.toLowerCase();
  const isDomainAdmin = domainAdminEmail ? user.email.toLowerCase() === domainAdminEmail : user.isAdmin;

  const [counts, accounts, recentTx] = await Promise.all([
    prisma.$transaction([
      prisma.user.count(),
      prisma.account.count(),
      prisma.transaction.count(),
      prisma.account.aggregate({ _sum: { balanceCents: true } }),
    ]),
    prisma.account.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) as Promise<AdminAccount[]>,
    prisma.transaction.findMany({
      include: { account: { select: { name: true, user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }) as Promise<AdminTxn[]>,
  ] as const);

  const [totalUsers, totalAccounts, totalTransactions, balanceAgg] = counts;
  const totalBalanceCents = balanceAgg._sum.balanceCents ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin</p>
            <h1 className="text-3xl font-semibold text-white">System overview</h1>
            <p className="text-slate-400">Manage users, accounts, and monitor recent activity.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
            <ShieldCheck className="h-4 w-4" /> Admin access
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel rounded-2xl p-4 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Users</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalUsers}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Accounts</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalAccounts}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Transactions</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalTransactions}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Balance</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(totalBalanceCents / 100)}</p>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">Domain admin tools</p>
                <h2 className="text-lg font-semibold text-white">Manage any account</h2>
                <p className="text-sm text-slate-400">Edit balances, names, ownership, and creation dates.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
                <Wrench className="h-4 w-4" /> Restricted
              </div>
            </div>

            <form action={adminUpdateAccount} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                Created at (ISO or date string)
                <input
                  name="createdAt"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="2024-01-15T12:00:00Z"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 sm:col-span-2">
                Description / audit note
                <input
                  name="description"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Why this change is made"
                />
              </label>
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  {domainAdminEmail
                    ? `Only the domain admin (${domainAdminEmail}) can run these actions.`
                    : "Restricted to admins only."}
                </p>
                <button
                  type="submit"
                  disabled={!isDomainAdmin}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wrench className="h-4 w-4" /> Apply changes
                </button>
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
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Account</th>
                    <th className="py-2 pr-4">Balance</th>
                    <th className="py-2 pr-4">Transactions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {accounts.map((acct) => (
                    <tr key={acct.id} className="align-middle">
                      <td className="py-2 pr-4">
                        <div className="text-white">{acct.user.name}</div>
                        <div className="text-xs text-slate-400">{acct.user.email}</div>
                      </td>
                      <td className="py-2 pr-4">{acct.name}</td>
                      <td className="py-2 pr-4">{formatCurrency(acct.balanceCents / 100)}</td>
                      <td className="py-2 pr-4">{acct._count.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent transactions</h2>
              <p className="text-sm text-slate-400">Latest 10</p>
            </div>
            <div className="mt-4 divide-y divide-white/5">
              {recentTx.map((txn) => (
                <div key={txn.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{txn.description || txn.type}</p>
                    <p className="text-xs text-slate-400">
                      {txn.account.user.name} • {txn.account.name} • {new Date(txn.createdAt).toLocaleString()}
                      {txn.source ? ` • ${txn.source}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <span
                      className={
                        txn.type === "DEPOSIT"
                          ? "text-emerald-300"
                          : "text-rose-200"
                      }
                    >
                      {txn.type === "DEPOSIT" ? "+" : "-"}
                      {formatCurrency(txn.amountCents / 100)}
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                      Bal: {formatCurrency(txn.balanceAfterCents / 100)}
                    </span>
                  </div>
                </div>
              ))}
              {recentTx.length === 0 && <p className="py-4 text-slate-300">No transactions yet.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
