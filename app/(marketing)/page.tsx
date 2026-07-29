import type { Metadata } from "next";

import { MarketingHome } from "@/components/marketing/marketing-home";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  title: "Buy a bowl. Build with AI.",
  description:
    "A qualifying YGF purchase unlocks limited Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
};

export default function HomePage() {
  return <MarketingHome />;
}
