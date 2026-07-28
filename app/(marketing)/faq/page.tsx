import type { Metadata } from "next";

import { FAQPageContent } from "@/components/marketing/faq-page-content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Eligibility, expiry, privacy, and use details for YGF Bowl-to-Build.",
};

export default function FAQPage() {
  return <FAQPageContent />;
}
