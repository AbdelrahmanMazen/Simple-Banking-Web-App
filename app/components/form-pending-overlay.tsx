"use client";

import { Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { ReactNode, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  label?: string;
  pendingLabel?: string;
  overlayMessage?: string;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
};

export default function SubmitWithOverlay({ label, pendingLabel, overlayMessage, className = "", disabled, children }: Props) {
  const { pending } = useFormStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showOverlay = mounted && pending;
  const contentLabel = pending ? pendingLabel || label : label;
  const isDisabled = disabled || pending;

  return (
    <>
      {showOverlay &&
        createPortal(
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/75 backdrop-blur-md px-6">
            <div className="space-y-3 text-center text-slate-100">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-300" />
              <p className="text-lg font-semibold">{overlayMessage || "Processing..."}</p>
              <p className="text-sm text-slate-300">Please wait a moment.</p>
            </div>
          </div>,
          document.body
        )}

      <button
        type="submit"
        disabled={isDisabled}
        aria-busy={pending}
        className={`${className} ${isDisabled ? "cursor-not-allowed opacity-70" : ""}`.trim()}
      >
        {children ?? contentLabel}
      </button>
    </>
  );
}
