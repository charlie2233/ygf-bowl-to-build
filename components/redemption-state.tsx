import type { ReactNode } from "react";

export function RedemptionState({
  action = "/redeem",
  actionLabel = "Try another code",
  children,
  title,
}: {
  action?: string;
  actionLabel?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="redemption-state">
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
        <a className="button button--primary button--medium" href={action}>
          {actionLabel}
        </a>
      </div>
    </section>
  );
}
