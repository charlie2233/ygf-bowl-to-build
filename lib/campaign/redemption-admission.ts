import type { AbuseSignal } from "@/lib/campaign/rate-limit";

export type RedemptionAttemptOutcome =
  | "accepted"
  | "invalid"
  | "unavailable"
  | "throttled";

export interface RedemptionAdmissionInput {
  codeDigest: string;
  sessionDigest: string;
  signal: AbuseSignal;
  userId: string;
}

export type RedemptionAdmissionResult =
  | {
      allowed: true;
      attemptId: string;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

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
