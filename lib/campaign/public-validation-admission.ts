import type { AbuseSignal } from "@/lib/campaign/rate-limit";

export interface PublicValidationAdmission {
  admit(signal: AbuseSignal): Promise<boolean>;
}
