import type { Metadata } from "next";

import { OfferPageContent } from "@/components/marketing/offer-page-content";

export const metadata: Metadata = {
  title: "The offer",
  description:
    "Spend $25+ at YGF, get a code at checkout, and claim limited Build Credits.",
};

export default function OfferPage() {
  return <OfferPageContent />;
}
