"use client";
import React, { useState } from "react";
import EditAnnouncementModal from "./EditAnnouncementModal";

import { AdminAnnouncement } from "./types";

type Props = {
  item: AdminAnnouncement;
};

export default function AnnouncementEditButton({ item }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:-translate-y-0.5 hover:bg-blue-400 disabled:opacity-60"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      {open && <EditAnnouncementModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}
