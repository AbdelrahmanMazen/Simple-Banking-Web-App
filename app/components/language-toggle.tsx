"use client";

import { useState, useTransition } from "react";
import { Locale, supportedLocales } from "@/lib/i18n";

function setLangCookie(lang: Locale) {
  document.cookie = `lang=${lang}; path=/; max-age=31536000`;
}

export default function LanguageToggle({ locale }: { locale: Locale }) {
  const [active, setActive] = useState<Locale>(locale);
  const [isPending, startTransition] = useTransition();

  const handleChange = (lang: Locale) => {
    if (lang === active) return;
    setActive(lang);
    setLangCookie(lang);
    startTransition(() => {
      window.location.reload();
    });
  };

  return (
    <div className="inline-flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
      {supportedLocales.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => handleChange(lang)}
          className={`px-3 py-1 text-xs font-semibold transition ${
            active === lang ? "bg-white text-slate-900 rounded-full" : "text-slate-200"
          } ${isPending ? "opacity-70" : ""}`.trim()}
          aria-pressed={active === lang}
        >
          {lang === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}
