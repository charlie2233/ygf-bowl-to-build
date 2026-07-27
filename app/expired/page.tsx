import { RedemptionState } from "@/components/redemption-state";

export default function ExpiredPage() {
  return (
    <RedemptionState title="This claim has expired">
      This code or wallet is outside its available window. Ask YGF staff for
      privacy-safe help if you believe this is an error.
    </RedemptionState>
  );
}
