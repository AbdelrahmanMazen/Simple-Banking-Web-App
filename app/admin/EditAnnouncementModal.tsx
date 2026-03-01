"use client";
import React, { useState } from "react";

import { AdminAnnouncement } from "./types";

type Props = {
  item: AdminAnnouncement;
  onClose: () => void;
};

export default function EditAnnouncementModal({ item, onClose }: Props) {
  const [form, setForm] = useState({
    title: item.title || "",
    titleAr: item.titleAr || "",
    body: item.body || "",
    bodyAr: item.bodyAr || "",
    mediaUrl: item.mediaUrl || "",
    youtubeUrl: item.youtubeId ? `https://youtu.be/${item.youtubeId}` : "",
    startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 16) : "",
    endsAt: item.endsAt ? new Date(item.endsAt).toISOString().slice(0, 16) : "",
    status: item.status || "SCHEDULED",
    id: item.id,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-slate-100 shadow-[0_25px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Edit Announcement</h2>
            <p className="text-xs text-amber-100/80">Times are saved as Africa/Cairo (UTC+02).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-300"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form method="post" action="/api/admin/update-announcement" className="max-h-[80vh] overflow-y-auto px-6 py-4 space-y-4">
          <input type="hidden" name="id" value={form.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Title"
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
              required
            />
            <input
              name="titleAr"
              value={form.titleAr}
              onChange={handleChange}
              placeholder="Title (Arabic)"
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            />
            <textarea
              name="body"
              value={form.body}
              onChange={handleChange}
              placeholder="Body"
              className="md:col-span-2 min-h-[96px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            />
            <textarea
              name="bodyAr"
              value={form.bodyAr}
              onChange={handleChange}
              placeholder="Body (Arabic)"
              className="md:col-span-2 min-h-[96px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            />
            <input
              name="mediaUrl"
              value={form.mediaUrl}
              onChange={handleChange}
              placeholder="Media URL"
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            />
            <input
              name="youtubeUrl"
              value={form.youtubeUrl}
              onChange={handleChange}
              placeholder="YouTube URL"
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            />
            <div className="space-y-1">
              <input
                name="startsAt"
                type="datetime-local"
                value={form.startsAt}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
              />
              <p className="text-[11px] text-amber-100/80">Start (Cairo)</p>
            </div>
            <div className="space-y-1">
              <input
                name="endsAt"
                type="datetime-local"
                value={form.endsAt}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
              />
              <p className="text-[11px] text-amber-100/80">Leave blank for open-ended</p>
            </div>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-200/70 focus:ring-amber-200/30 focus:outline-none"
            >
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:-translate-y-0.5 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
