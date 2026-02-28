import { Prisma } from "@prisma/client";
import { Funnel, History, ListFilter, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LanguageToggle from "@/app/components/language-toggle";
import { adminClearAuditTrail, adminDeleteUser, adminUpdateAccount, adminRenumberAccount, adminDeleteAnnouncement, adminSetAnnouncement, updateMostafaDebt } from "@/app/actions/bankActions";
import { getCurrentUser } from "@/lib/auth";
import { resolveLocale, translate } from "@/lib/i18n";
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
  lang?: string;
};

type AdminAnnouncement = {
  id: number;
  title: string;
  titleAr: string | null;
  body: string | null;
  bodyAr: string | null;
  mediaUrl: string | null;
  youtubeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export default async function AdminPage({ searchParams }: { searchParams?: Promise<AdminSearchParams> }) {
  const resolvedParams = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const locale = resolveLocale(resolvedParams.lang ?? cookieStore.get("lang")?.value ?? "en");
  const isRTL = locale === "ar";
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const filterType = resolvedParams.type?.toUpperCase();
  const includeDeleted = resolvedParams.includeDeleted === "1";
  const query = resolvedParams.q?.trim();

  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isVerified) redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  if (!user.isAdmin) redirect("/dashboard");

  const domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL?.toLowerCase();
  const isDomainAdmin = domainAdminEmail ? user.email.toLowerCase() === domainAdminEmail : user.isAdmin;

  let announcementAvailable = true;
  let announcement: AdminAnnouncement | null = null;
  try {
    announcement = (await prisma.announcement.findFirst({ orderBy: { createdAt: "desc" } })) as AdminAnnouncement | null;
  } catch {
    announcementAvailable = false;
  }

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
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white ${isRTL ? "text-right" : ""}`}>
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{t("adminLabel")}</p>
            <h1 className="text-3xl font-semibold text-white">{t("adminSystemOverview")}</h1>
            <p className="text-slate-400">{t("adminSystemSubtitle")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
              <ShieldCheck className="h-4 w-4" /> {t("adminAccess")}
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-slate-300 ring-1 ring-white/10">
              {t("adminActiveDeleted", { active: totalActiveTransactions.toLocaleString(), deleted: totalDeletedTransactions.toLocaleString() })}
            </div>
            <LanguageToggle locale={locale} />
          </div>
        </header>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-amber-500/10 to-white/0 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-amber-200">{t("announcementAdminHeading")}</p>
                <h2 className="text-lg font-semibold text-white">{t("announcementAdminSubtitle")}</h2>
                {!announcementAvailable && (
                  <p className="text-sm text-amber-100/80">{t("announcementUnavailable")}</p>
                )}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 ring-1 ring-white/15">
                {announcementAvailable ? t("announcementBadge") : t("announcementUnavailableShort")}
              </div>
            </div>

            <form
              action={adminSetAnnouncement}
              className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("announcementTitleLabel")}
                <input
                  name="title"
                  required
                  defaultValue={announcement?.title ?? ""}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="Holiday updates, new feature, etc."
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("announcementTitleArLabel")}
                <input
                  name="titleAr"
                  defaultValue={announcement?.titleAr ?? ""}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="العنوان بالعربية"
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("announcementMediaLabel")}
                <input
                  name="mediaUrl"
                  type="url"
                  defaultValue={announcement?.mediaUrl ?? ""}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="https://.../image.gif"
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                {t("announcementBodyLabel")}
                <textarea
                  name="body"
                  rows={3}
                  defaultValue={announcement?.body ?? ""}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="Details, instructions, links..."
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                {t("announcementBodyArLabel")}
                <textarea
                  name="bodyAr"
                  rows={3}
                  defaultValue={announcement?.bodyAr ?? ""}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="المحتوى بالعربية"
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                {t("announcementYoutubeLabel")}
                <input
                  name="youtubeUrl"
                  type="url"
                  defaultValue={announcement?.youtubeId ? `https://youtu.be/${announcement.youtubeId}` : ""}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
                  placeholder="YouTube link (optional)"
                  disabled={!announcementAvailable || !isDomainAdmin}
                />
              </label>
              <div className="md:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-300">
                  {announcement?.updatedAt
                    ? t("announcementUpdatedAt", { date: announcement.updatedAt.toLocaleString() })
                    : t("announcementPreview")}
                </p>
                <SubmitWithOverlay
                  label={t("announcementPublish")}
                  pendingLabel={t("announcementPublishPending")}
                  overlayMessage={t("announcementPublishPending")}
                  disabled={!announcementAvailable || !isDomainAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:-translate-y-0.5 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {t("announcementPublish")}
                </SubmitWithOverlay>
              </div>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100 ring-1 ring-white/15">
                  {t("announcementPreview")}
                </div>
                {announcement && announcement.createdAt && (
                  <span className="text-xs text-slate-400">{t("announcementUpdatedAt", { date: announcement.createdAt.toLocaleString() })}</span>
                )}
              </div>
              {announcement ? (
                <div className="mt-3 space-y-2">
                  <p className="text-lg font-semibold text-white">{announcement.title}</p>
                  {announcement.body && <p className="text-sm text-slate-200">{announcement.body}</p>}
                  {!announcement.body && <p className="text-sm text-slate-400">{t("announcementNone")}</p>}
                  {(announcement.titleAr || announcement.bodyAr) && (
                    <div className="mt-3 space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-right ring-1 ring-white/10" dir="rtl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">{t("announcementArabicVariant")}</p>
                      <p className="text-lg font-semibold text-white">{announcement.titleAr || announcement.title}</p>
                      {announcement.bodyAr && <p className="text-sm text-slate-200">{announcement.bodyAr}</p>}
                    </div>
                  )}
                  {(announcement.mediaUrl || announcement.youtubeId) && (
                    <p className="text-xs text-amber-100">{announcement.mediaUrl || announcement.youtubeId}</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-300">{t("announcementNone")}</p>
              )}
            </div>

            {announcement && (
              <form action={adminDeleteAnnouncement} className="mt-4 flex justify-end">
                <SubmitWithOverlay
                  label={t("announcementDelete")}
                  pendingLabel={t("announcementDeletePending")}
                  overlayMessage={t("announcementDeletePending")}
                  disabled={!announcementAvailable || !isDomainAdmin}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> {t("announcementDelete")}
                </SubmitWithOverlay>
              </form>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("adminUsersLabel")}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalUsers}</p>
            <p className="text-xs text-slate-500">{t("adminUsersHint")}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("adminAccountsLabel")}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalAccounts}</p>
            <p className="text-xs text-slate-500">{t("adminAccountsHint")}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("adminTransactionsLabel")}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{totalActiveTransactions}</p>
            <p className="text-xs text-slate-500">{t("adminTransactionsHint", { count: totalDeletedTransactions })}</p>
          </div>
          <div className="glass-panel rounded-2xl p-5 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("adminBalanceLabel")}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(totalBalanceCents / 100)}</p>
            <p className="text-xs text-slate-500">{t("adminBalanceHint")}</p>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-rose-500/10 to-white/0 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-rose-200">{t("dangerZone")}</p>
                <h2 className="text-lg font-semibold text-white">{t("deleteUserTitle")}</h2>
                <p className="text-sm text-slate-300">{t("deleteUserDesc")}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
                {domainAdminEmail ? t("domainAdminOnly", { email: domainAdminEmail }) : t("adminsOnly")}
              </div>
            </div>

            <form action={adminDeleteUser} className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label className="space-y-2 text-sm font-medium text-slate-100 lg:col-span-1">
                {t("userIdLabel")}
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
                {t("reasonOptionalLabel")}
                <input
                  name="reason"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                  placeholder="Why this user is being deleted"
                />
              </label>
              <div className="lg:col-span-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-xs text-rose-200">{t("deleteProtection")}</p>
                <SubmitWithOverlay
                  label={t("deleteUserCta")}
                  pendingLabel={t("deleteUserCta")}
                  overlayMessage={t("deleteUserCta")}
                  disabled={!isDomainAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" /> {t("deleteUserCta")}
                </SubmitWithOverlay>
              </div>
            </form>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-300">{t("adminToolsTitle")}</p>
                <h2 className="text-lg font-semibold text-white">{t("adminToolsSubtitle")}</h2>
                <p className="text-sm text-slate-400">{t("adminToolsDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
                  <Wrench className="h-4 w-4" /> {t("restricted")}
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
                  {domainAdminEmail ? t("domainAdminOnly", { email: domainAdminEmail }) : t("adminsOnly")}
                </div>
              </div>
            </div>

            <form action={adminUpdateAccount} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("accountIdLabel")}
                <input
                  name="accountId"
                  type="number"
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="e.g. 1"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("newBalanceLabel")}
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
                {t("newNameLabel")}
                <input
                  name="name"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Optional"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("reassignUserLabel")}
                <input
                  name="ownerUserId"
                  type="number"
                  min="1"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Optional"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                {t("createdAtLabel")}
                <input
                  name="createdAt"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="2024-01-15T12:00:00Z"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100 md:col-span-2">
                {t("auditNoteLabel")}
                <input
                  name="description"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="Why this change is made"
                />
              </label>
              <div className="md:col-span-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-400">
                  {domainAdminEmail ? t("adminRestrictedNote", { email: domainAdminEmail }) : t("adminsOnlyShort")}
                </p>
                <SubmitWithOverlay
                  label={t("applyChanges")}
                  pendingLabel={t("applyChanges")}
                  overlayMessage={t("applyChanges")}
                  disabled={!isDomainAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Wrench className="h-4 w-4" /> {t("applyChanges")}
                </SubmitWithOverlay>
              </div>
            </form>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">{t("accountsTitle")}</p>
                <h2 className="text-lg font-semibold text-white">{t("accountsSubtitle")}</h2>
              </div>
              <Users className="h-5 w-5 text-emerald-200" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  <p className="text-xs text-slate-500">{t("account") } #{acct.id}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-emerald-500/5 to-white/0 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-300">{t("renumberTitle")}</p>
                <h2 className="text-lg font-semibold text-white">{t("renumberSubtitle")}</h2>
                <p className="text-sm text-slate-400">{t("renumberDesc")}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
                <Wrench className="h-4 w-4" /> {t("adminOnlyBadge")}
              </div>
            </div>

            <form action={adminRenumberAccount} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("currentAccountLabel")}
                <input
                  name="accountId"
                  type="number"
                  min="1"
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="e.g. 12"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-100">
                {t("newAccountLabel")}
                <input
                  name="newAccountId"
                  type="number"
                  min="1"
                  required
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-base text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none"
                  placeholder="e.g. 3"
                />
              </label>
              <div className="md:col-span-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-amber-200">{t("renumberWarning")}</p>
                <SubmitWithOverlay
                  label={t("renumberCta")}
                  pendingLabel={t("renumberOverlay")}
                  overlayMessage={t("renumberOverlay")}
                  disabled={!isDomainAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Wrench className="h-4 w-4" /> {t("renumberCta")}
                </SubmitWithOverlay>
              </div>
            </form>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/5 to-white/0 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <History className="h-4 w-4" /> {t("recentTxTitle")}
                </div>
                <h2 className="text-lg font-semibold text-white">{t("recentTxTitle")}</h2>
                <p className="text-sm text-slate-400">{t("recentTxSubtitle")}</p>
              </div>
              <form className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:w-auto" method="get">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-slate-400">
                  <ListFilter className="h-4 w-4" /> {t("filtersLabel")}
                </div>
                <select
                  name="type"
                  defaultValue={filterType ?? ""}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none md:w-auto md:min-w-[180px]"
                >
                  <option value="">{t("allTypes")}</option>
                  <option value="DEPOSIT">{t("depositTitle")}</option>
                  <option value="WITHDRAW">{t("withdrawTitle")}</option>
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
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-200/70 focus:ring-emerald-200/30 focus:outline-none md:w-56"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    name="includeDeleted"
                    value="1"
                    defaultChecked={includeDeleted}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-300"
                  />
                  {t("includeDeleted")}
                </label>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 md:w-auto"
                >
                  <Funnel className="h-4 w-4" /> {t("applyFilters")}
                </button>
              </form>
            </div>
            <div className="mt-4">
              <TransactionsManager transactions={recentTxView} isDomainAdmin={isDomainAdmin} locale={locale} />
              {recentTx.length === 0 && <p className="py-4 text-slate-300">{t("noTransactionsMatch")}</p>}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/30">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-rose-500/5 to-white/0 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-rose-200">{t("auditTrailTitle")}</p>
                <h2 className="text-lg font-semibold text-white">{t("auditTrailSubtitle")}</h2>
                <p className="text-sm text-slate-400">{t("auditTrailDesc")}</p>
              </div>
              {mostafaDebt && (
                <div className="flex flex-col gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-100 ring-1 ring-rose-400/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">{t("mostafaDebtTitle")}</p>
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
              <form action={adminClearAuditTrail} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10 md:flex-row md:items-center md:gap-3 md:self-start">
                <input
                  name="confirm"
                  required
                  placeholder={t("clearAuditPlaceholder")}
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                />
                <SubmitWithOverlay
                  label={t("clearAuditCta")}
                  pendingLabel={t("clearAuditCta")}
                  overlayMessage={t("clearAuditOverlay")}
                  disabled={!isDomainAdmin}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
                >
                  <Trash2 className="h-4 w-4" /> {t("clearAuditCta")}
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
