"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  show: boolean;
  title: string;
  subtitle: string;
};

export default function PublishNotice({ show, title, subtitle }: Props) {
  useEffect(() => {
    if (!show) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("announcementPublished");
    const target = url.toString();
    const timer = window.setTimeout(() => {
      window.location.replace(target);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex max-w-xl items-center gap-3 rounded-2xl border border-amber-200/40 bg-slate-950/90 px-4 py-3 text-white shadow-2xl shadow-amber-500/20 ring-1 ring-amber-300/40 backdrop-blur">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs text-amber-100/90">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
