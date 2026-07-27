import { ChevronDown } from "lucide-react";

import {
  publicFaq,
  type PublicFaqItem,
} from "@/lib/content/legal";

type FaqListProps = Readonly<{
  items?: readonly PublicFaqItem[];
}>;

export function FAQList({ items = publicFaq }: FaqListProps) {
  return (
    <div className="faq-list">
      {items.map(({ answer, question }) => (
        <details className="faq-item" key={question}>
          <summary>
            <span>{question}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
