"use client";

import { Play, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Locale, translate } from "@/lib/i18n";

type AnnouncementData = {
	title: string;
	titleAr?: string | null;
	body?: string | null;
	bodyAr?: string | null;
	mediaUrl?: string | null;
	youtubeId?: string | null;
	createdAt?: string | null;
};

type Props = {
	announcement: AnnouncementData | null;
	locale: Locale;
};

export default function FloatingAnnouncement({ announcement, locale }: Props) {
	const [dismissed, setDismissed] = useState(false);
	const isRTL = locale === "ar";
	const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) => translate(locale, key, params);

	const embedUrl = useMemo(() => {
		if (!announcement?.youtubeId) return null;
		return `https://www.youtube.com/embed/${announcement.youtubeId}?rel=0&modestbranding=1&playsinline=1`;
	}, [announcement?.youtubeId]);

	if (!announcement || dismissed) return null;

	const localizedTitle = isRTL ? announcement.titleAr || announcement.title : announcement.title;
	const localizedBody = isRTL ? announcement.bodyAr || announcement.body : announcement.body;

	return (
		<div
			dir={isRTL ? "rtl" : "ltr"}
			className={`sticky top-20 z-40 mx-auto h-0 w-full max-w-4xl overflow-visible px-3 sm:px-6 pointer-events-none ${isRTL ? "text-right" : ""}`}
		>
			<div className="relative top-3 overflow-hidden rounded-3xl border border-white/15 bg-slate-950/90 text-white shadow-2xl shadow-black/40 ring-1 ring-amber-300/30 backdrop-blur-xl pointer-events-auto">
				<div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-rose-500/10 px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-6">
					<div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100 ring-1 ring-white/20">
						{t("announcementBadge")}
					</div>
					<div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-100/80">
						{announcement.createdAt && (
							<span className="hidden sm:inline">{t("announcementUpdatedAt", { date: new Date(announcement.createdAt).toLocaleString() })}</span>
						)}
						<button
							type="button"
							onClick={() => setDismissed(true)}
							className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
							aria-label={t("announcementDismiss")}
						>
							<X className="h-3.5 w-3.5" /> {t("announcementDismiss")}
						</button>
					</div>
				</div>

				<div className="grid gap-5 px-4 py-5 sm:px-6 sm:py-6 md:grid-cols-[1.2fr_1fr]">
					<div className="space-y-3">
						<h3 className="text-xl font-semibold leading-tight text-white sm:text-2xl">{localizedTitle}</h3>
						{localizedBody && <p className="text-sm leading-6 text-slate-200 sm:text-base">{localizedBody}</p>}
						{!localizedBody && <p className="text-sm text-slate-300">{t("announcementNone")}</p>}
					</div>

					<div className="flex flex-col gap-3">
						{announcement.mediaUrl && !embedUrl && (
							<div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 ring-1 ring-white/10">
								{/* Using img to avoid domain config constraints for Next.js Image */}
								<img
									src={announcement.mediaUrl}
									alt={t("announcementMediaAlt")}
									className="h-full w-full max-h-56 object-cover sm:max-h-72"
									loading="lazy"
								/>
							</div>
						)}

						{embedUrl && (
							<div className="overflow-hidden rounded-2xl border border-white/10 bg-black/60 ring-1 ring-white/10">
								<div className="relative aspect-video w-full">
									<iframe
										className="absolute inset-0 h-full w-full"
										src={embedUrl}
										title={announcement.title}
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
										allowFullScreen
									/>
								</div>
							</div>
						)}

						{!announcement.mediaUrl && !embedUrl && (
							<div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-200 ring-1 ring-white/10">
								<Play className="h-4 w-4 text-amber-200" />
								{t("announcementPreview")}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
