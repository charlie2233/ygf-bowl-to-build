import { RedemptionState } from "@/components/redemption-state";

export default function AlreadyUsedPage() {
  return (
    <RedemptionState
      action="/auth?next=/wallet"
      actionLabel="Open my wallet"
      title="This code was already used"
    >
      If you claimed it earlier, sign in with the same account to reopen your
      wallet. Staff never need your full code.
    </RedemptionState>
  );
}
