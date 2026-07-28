import type { Metadata } from "next";

import { ShareCardBuilder } from "@/components/share/share-card-builder";

export const metadata: Metadata = {
  title: "Create a check-in card",
  description:
    "Download a public, secret-free YGF Bowl-to-Build check-in card.",
};

export default function SharePage() {
  return (
    <section className="share-page">
      <div className="container">
        <header className="share-page__intro">
          <p>YGF Bowl-to-Build</p>
          <h1>Create your check-in card</h1>
          <p>
            Choose an optional first task, preview the public card, then
            download it as an SVG when you’re ready.
          </p>
        </header>
        <ShareCardBuilder />
      </div>
    </section>
  );
}
