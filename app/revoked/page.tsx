import { RedemptionState } from "@/components/redemption-state";

export default function RevokedPage() {
  return (
    <RedemptionState title="This code is unavailable">
      This receipt code was withdrawn and cannot be redeemed. Ask YGF staff for
      privacy-safe help if you believe this is an error.
    </RedemptionState>
  );
}
