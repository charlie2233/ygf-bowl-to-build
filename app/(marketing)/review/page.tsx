import type { Metadata } from "next";

import { ReviewPageContent } from "@/components/marketing/review-page-content";

export const metadata: Metadata = {
  title: "Review YGF",
  description: "Share feedback about the YGF Bowl-to-Build experience.",
};

export default function ReviewPage() {
  return <ReviewPageContent />;
}
