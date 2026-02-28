"use client";

import { useState } from "react";

type Props = {
  title: string;
  body: string;
};

export default function LegalNoticeBanner({ title, body }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const handleClose = () => {
    // Dismiss for the current session only; it will reappear on reload.
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 px-4">
      <div className="mx-auto flex max-w-5xl items-start gap-3 rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-900/85 via-red-800/80 to-red-900/90 px-4 py-3 text-sm text-red-50 shadow-[0_25px_60px_rgba(248,113,113,0.45)] backdrop-blur-2xl ring-1 ring-red-300/10" role="alert">
        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white" aria-hidden>
          !
        </span>
        <div className="flex-1 space-y-1 leading-relaxed">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-100">{title}</div>
          <p className="text-[13px] text-red-50/90 sm:text-sm">{body}</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-red-50 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-red-200/70"
          aria-label="Dismiss notice"
        >
          ×
        </button>
      </div>
    </div>
  );
}
