"use client";

import type { ComponentProps } from "react";
import LegalNoticeBanner from "./legal-notice-banner";

// Render the notice client-side without forcing a full CSR bailout.
type Props = ComponentProps<typeof LegalNoticeBanner>;

export default function LegalNoticeBannerLazy(props: Props) {
  return <LegalNoticeBanner {...props} />;
}
