"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  updatedAt: string | null;
  title: string;
  subtitle: string;
};

const STORAGE_KEY = "announcementLastSeenAt";
const POLL_MS = 30000;

export default function AnnouncementRefresh({ updatedAt, title, subtitle }: Props) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<number | null>(null);

  const scheduleReload = (publishedAt: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setShow(true);
    timerRef.current = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, String(publishedAt));
      window.location.reload();
    }, 3000);
  };

  useEffect(() => {
    const lastSeenRaw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;

    const currentPublished = updatedAt ? new Date(updatedAt).getTime() : null;
    if (currentPublished && !Number.isNaN(currentPublished) && lastSeen < currentPublished) {
      scheduleReload(currentPublished);
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/announcement/updated", { cache: "no-store" });
        if (!res.ok) return;
        const data: { updatedAt: string | null } = await res.json();
        if (!data.updatedAt) return;
        const remotePublished = new Date(data.updatedAt).getTime();
        if (Number.isNaN(remotePublished)) return;
        const latestSeenRaw = window.localStorage.getItem(STORAGE_KEY);
        const latestSeen = latestSeenRaw ? Number(latestSeenRaw) : 0;
        if (remotePublished > latestSeen) {
          scheduleReload(remotePublished);
        }
      } catch {
        // swallow network errors
      }
    };

    const interval = window.setInterval(poll, POLL_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.clearInterval(interval);
    };
  }, [updatedAt]);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-40 flex justify-center px-3 sm:px-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-amber-200/40 bg-slate-950/90 px-4 py-3 text-white shadow-2xl shadow-amber-500/20 ring-1 ring-amber-300/40 backdrop-blur">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/50">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold leading-tight sm:text-base">{title}</p>
          <p className="text-xs text-amber-100/90 sm:text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
