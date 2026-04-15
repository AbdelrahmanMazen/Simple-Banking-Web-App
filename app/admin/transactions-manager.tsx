"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import SubmitWithOverlay from "@/app/components/form-pending-overlay";
import { adminDeleteTransaction, adminDeleteTransactionsBulk } from "@/app/actions/bankActions";
import { Locale, translate } from "@/lib/i18n";

type TxnView = {
  id: number;
  description: string | null;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  source: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletionReason: string | null;
  account: { name: string; user: { name: string } };
  deletedByUser: { name: string; email: string } | null;
};

type Props = {
  transactions: TxnView[];
  isDomainAdmin: boolean;
  locale: Locale;
};

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });
}

export default function TransactionsManager({ transactions, isDomainAdmin, locale }: Props) {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
  const isRTL = locale === "ar";
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const allSelected = selectedIds.length > 0 && selectedIds.length === transactions.length;
  const selectedCount = selectedIds.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map((t) => t.id));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-4 ${isRTL ? "text-right" : ""}`}>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-300"
              checked={allSelected}
              onChange={toggleAll}
            />
            {t("selectAll")} ({transactions.length})
          </label>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
            {t("selectedCount", { count: selectedCount })}
          </span>
        </div>
        <form action={adminDeleteTransactionsBulk} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            name="reason"
            placeholder={t("reasonOptionalLabel")}
            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none md:w-64"
          />
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="transactionIds" value={id} />
          ))}
          <SubmitWithOverlay
            label={t("deleteSelected")}
            pendingLabel={t("deleteSelected")}
            overlayMessage={t("deleteSelectedOverlay")}
            disabled={!isDomainAdmin || selectedCount === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:-translate-y-0.5 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            <Trash2 className="h-4 w-4" /> {t("deleteSelected")}
          </SubmitWithOverlay>
        </form>
      </div>

      <div className="grid gap-3 cv-auto">
        {transactions.map((txn) => {
          const isDeleted = Boolean(txn.deletedAt);
          const createdAt = new Date(txn.createdAt).toLocaleString();
          return (
            <div
              key={txn.id}
              className="rounded-2xl border border-white/5 bg-gradient-to-r from-white/5 to-white/0 px-4 py-3 ring-1 ring-white/10 shadow-inner shadow-black/10"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-300"
                    checked={selectedSet.has(txn.id)}
                    onChange={() => toggleOne(txn.id)}
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">{txn.description || txn.type}</p>
                      {isDeleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-200 ring-1 ring-rose-400/30">
                          <AlertCircle className="h-3.5 w-3.5" /> {t("deletedBadge")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      #{txn.id} • {txn.account.user.name} • {txn.account.name} • {createdAt}
                      {txn.source ? ` • ${txn.source}` : ""}
                    </p>
                    {txn.deletedAt && (
                      <p className="text-[11px] text-rose-200">
                        Deleted at {new Date(txn.deletedAt).toLocaleString()} by {txn.deletedByUser?.name || "Admin"}
                        {txn.deletionReason ? ` • ${txn.deletionReason}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                  <span className={txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN" ? "text-emerald-300" : "text-rose-200"}>
                    {(txn.type === "DEPOSIT" || txn.type === "TRANSFER_IN") ? "+" : "-"}
                    {formatCurrency(txn.amountCents / 100)}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                    Bal: {formatCurrency(txn.balanceAfterCents / 100)}
                  </span>
                </div>
              </div>

              {!isDeleted && (
                <form action={adminDeleteTransaction} className="mt-3 flex flex-col gap-2 lg:w-80 lg:flex-row lg:items-center lg:gap-2">
                  <input type="hidden" name="transactionId" value={txn.id} />
                  <input
                    name="reason"
                    placeholder={t("reasonOptionalLabel")}
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-rose-200/70 focus:ring-rose-200/30 focus:outline-none"
                  />
                  <SubmitWithOverlay
                    label={t("delete") ?? "Delete"}
                    pendingLabel={t("delete") ?? "Delete"}
                    overlayMessage={t("deleteTxnOverlay")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:-translate-y-0.5 hover:bg-rose-400 md:w-auto"
                  >
                    <Trash2 className="h-4 w-4" /> {t("delete") ?? "Delete"}
                  </SubmitWithOverlay>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
