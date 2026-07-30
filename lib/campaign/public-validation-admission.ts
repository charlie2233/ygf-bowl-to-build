import type { AbuseSignal } from "@/lib/campaign/rate-limit";

export interface PublicValidationAdmissionInput {
  accountDigest?: string;
  codeDigest?: string;
  sessionDigest: string;
  signal: AbuseSignal;
}

export interface PublicValidationAdmission {
  admit(input: PublicValidationAdmissionInput): Promise<boolean>;
}
