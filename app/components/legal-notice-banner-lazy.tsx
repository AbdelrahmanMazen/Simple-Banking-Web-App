"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Lazy-load legal notice on the client to avoid blocking server rendering.
const LegalNoticeBanner = dynamic(() => import("./legal-notice-banner"), {
  ssr: false,
  loading: () => null,
});

type Props = ComponentProps<typeof LegalNoticeBanner>;

export default function LegalNoticeBannerLazy(props: Props) {
  return <LegalNoticeBanner {...props} />;
}
