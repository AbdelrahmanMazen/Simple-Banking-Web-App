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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <h2 className="text-lg font-bold mb-4 text-slate-900">Edit Announcement</h2>
        <form method="post" action="/adminUpdateAnnouncementSchedule">
          <input type="hidden" name="id" value={form.id} />
          <div className="grid gap-3">
            <input name="title" value={form.title} onChange={handleChange} placeholder="Title" className="border rounded p-2" required />
            <input name="titleAr" value={form.titleAr} onChange={handleChange} placeholder="Title (Arabic)" className="border rounded p-2" />
            <textarea name="body" value={form.body} onChange={handleChange} placeholder="Body" className="border rounded p-2" />
            <textarea name="bodyAr" value={form.bodyAr} onChange={handleChange} placeholder="Body (Arabic)" className="border rounded p-2" />
            <input name="mediaUrl" value={form.mediaUrl} onChange={handleChange} placeholder="Media URL" className="border rounded p-2" />
            <input name="youtubeUrl" value={form.youtubeUrl} onChange={handleChange} placeholder="YouTube URL" className="border rounded p-2" />
            <input name="startsAt" type="datetime-local" value={form.startsAt} onChange={handleChange} className="border rounded p-2" />
            <input name="endsAt" type="datetime-local" value={form.endsAt} onChange={handleChange} className="border rounded p-2" />
            <select name="status" value={form.status} onChange={handleChange} className="border rounded p-2">
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-300 text-gray-800">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
