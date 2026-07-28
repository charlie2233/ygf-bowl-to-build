import { RedemptionState } from "@/components/redemption-state";

export default function AlreadyUsedPage() {
  return (
    <RedemptionState
      action="/auth?next=/wallet"
      actionLabel="Open my wallet"
      title="This code was already used"
    >
      If you claimed it earlier, reopen the same browser wallet. If you linked
      an account, sign in with that same account. An unlinked guest wallet
      cannot be recovered after browser data is cleared. Staff never need your
      full code.
    </RedemptionState>
  );
}
