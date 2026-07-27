import type { AbuseSignal } from "@/lib/campaign/rate-limit";

export type RedemptionAttemptOutcome =
  | "accepted"
  | "invalid"
  | "unavailable"
  | "throttled";

export interface RedemptionAdmissionInput {
  signal: AbuseSignal;
  userId: string;
}

export interface RedemptionAdmissionResult {
  allowed: boolean;
  attemptId: string;
}

export interface FinishRedemptionAttemptInput {
  attemptId: string;
  outcome: RedemptionAttemptOutcome;
}

export interface RedemptionAdmission {
  admit(
    input: RedemptionAdmissionInput,
  ): Promise<RedemptionAdmissionResult>;
  finish(input: FinishRedemptionAttemptInput): Promise<void>;
}
