import { RedemptionState } from "@/components/redemption-state";

export default function BlockedPage() {
  return (
    <RedemptionState title="Please wait before trying again">
      Too many attempts were made in a short period. Wait a few minutes, then
      enter the printed receipt code carefully.
    </RedemptionState>
  );
}
