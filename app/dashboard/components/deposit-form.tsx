"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, Smartphone } from "lucide-react";
import SubmitWithOverlay from "@/app/components/form-pending-overlay";
import { deposit } from "@/app/actions/bankActions";

type DepositStrings = {
  depositTitle: string;
  instant: string;
  accountLabel: string;
  linkedToProfile: string;
  sourceLabel: string;
  mobileWallet: string;
  card: string;
  amount: string;
  amountPlaceholder: string;
  description: string;
  descriptionPlaceholderDeposit: string;
  depositHelper: string;
  deposit: string;
  depositPending: string;
  depositOverlay: string;
  walletNumber: string;
  walletNumberPlaceholder: string;
  walletProviderHint: string;
  providerVodafone: string;
  providerWe: string;
  providerOrange: string;
  providerEtisalat: string;
};

type Props = {
  accountId: number;
  accountName: string;
  userName: string;
  hasAccounts: boolean;
  depositError?: string;
  strings: DepositStrings;
};

function detectProvider(walletDigits: string, strings: DepositStrings) {
  if (walletDigits.startsWith("010")) return strings.providerVodafone;
  if (walletDigits.startsWith("015")) return strings.providerWe;
  if (walletDigits.startsWith("012")) return strings.providerOrange;
  if (walletDigits.startsWith("011")) return strings.providerEtisalat;
  return "";
}

function maskWallet(walletDigits: string) {
  if (!walletDigits) return "";
  if (walletDigits.length <= 6) return walletDigits;
  return `${walletDigits.slice(0, 3)}****${walletDigits.slice(-3)}`;
}

export default function DepositForm({ accountId, accountName, userName, hasAccounts, depositError, strings }: Props) {
  const [source, setSource] = useState<string>("Mobile Wallet");
  const [walletNumber, setWalletNumber] = useState<string>("");
  const walletDigits = useMemo(() => walletNumber.replace(/\D/g, ""), [walletNumber]);
  const provider = useMemo(() => detectProvider(walletDigits, strings), [walletDigits, strings]);
  const showWallet = source === "Mobile Wallet";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-5 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">{strings.depositTitle}</h3>
        <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-200">
          {strings.instant}
        </div>
      </div>
      <form action={deposit} className="mt-3 space-y-3">
        <input type="hidden" name="accountId" value={accountId} />
        <div className="grid grid-cols-1 gap-3">
          <label className="space-y-2 text-xs font-medium text-slate-100">
            {strings.accountLabel}
            <div className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white ring-1 ring-white/5 focus-within:border-emerald-300/60 focus-within:ring-emerald-200/30">
              <div className="flex h-full items-center justify-between text-xs text-slate-200">
                <span className="truncate">{accountName || userName || strings.accountLabel}</span>
                <span className="text-[11px] text-slate-400">{strings.linkedToProfile}</span>
              </div>
            </div>
          </label>

          <label className="space-y-2 text-xs font-medium text-slate-100">
            {strings.sourceLabel}
            <select
              name="source"
              defaultValue="Mobile Wallet"
              onChange={(e) => setSource(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
            >
              <option value="Mobile Wallet" className="bg-slate-900">
                {strings.mobileWallet}
              </option>
              <option value="Credit/Debit Card" className="bg-slate-900">
                {strings.card}
              </option>
            </select>
          </label>

          {showWallet && (
            <label className="space-y-2 text-xs font-medium text-slate-100">
              {strings.walletNumber}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    name="walletNumber"
                    value={walletNumber}
                    onChange={(e) => setWalletNumber(e.target.value)}
                    required={showWallet}
                    minLength={11}
                    maxLength={14}
                    inputMode="numeric"
                    pattern="[0-9\s\-]{11,14}"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
                    placeholder={strings.walletNumberPlaceholder}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                </div>
                {provider ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                    {provider}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-2 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10">
                    <Smartphone className="h-4 w-4" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{strings.walletProviderHint}</p>
            </label>
          )}

          <label className="space-y-2 text-xs font-medium text-slate-100">
            {strings.amount}
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
              placeholder={strings.amountPlaceholder}
              inputMode="decimal"
            />
          </label>

          <label className="space-y-2 text-xs font-medium text-slate-100">
            {strings.description}
            <input
              name="description"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-white/5 focus:border-emerald-300/60 focus:ring-emerald-200/30 focus:outline-none"
              placeholder={strings.descriptionPlaceholderDeposit}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <ArrowDownToLine className="h-4 w-4 text-emerald-300" /> {strings.depositHelper}
        </div>
        {depositError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 shadow-inner shadow-rose-500/20">
            {depositError}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {showWallet && provider && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-400/30">
              <Smartphone className="h-4 w-4" /> {maskWallet(walletDigits)}
            </span>
          )}
          <SubmitWithOverlay
            label={strings.deposit}
            pendingLabel={strings.depositPending}
            overlayMessage={strings.depositOverlay}
            disabled={!hasAccounts}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <ArrowDownToLine className="h-4 w-4" /> {strings.deposit}
          </SubmitWithOverlay>
        </div>
      </form>
    </div>
  );
}