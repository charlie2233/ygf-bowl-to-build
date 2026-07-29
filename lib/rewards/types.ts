export const PARTNER_REWARD_KINDS = [
  "claude-pro-gift",
] as const;

export type PartnerRewardKind =
  (typeof PARTNER_REWARD_KINDS)[number];

export type PartnerRewardState =
  | "assigned"
  | "revealed"
  | "revoked"
  | "expired";

export interface PartnerRewardSecretEnvelope {
  ciphertext: string;
  digest: string;
  iv: string;
  tag: string;
}

export interface PartnerRewardSummary {
  expiresAt: string;
  id: string;
  kind: PartnerRewardKind;
  revealedAt?: string;
  state: PartnerRewardState;
}

export interface PartnerRewardReveal {
  reward: PartnerRewardSummary;
  secret: PartnerRewardSecretEnvelope;
}
