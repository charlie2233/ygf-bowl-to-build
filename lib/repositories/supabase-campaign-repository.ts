import { hashCode } from "@/lib/campaign/code";
import {
  type CreditWallet,
  domainError,
} from "@/lib/campaign/types";
import { createServiceRoleClient } from "@/lib/auth/server";
import type {
  CampaignRepository,
  GetWalletInput,
  RedeemCodeInput,
  RedemptionResult,
  ValidateCodeInput,
  ValidateCodeResult,
} from "@/lib/repositories/campaign-repository";

export type Task4CampaignRepository = Pick<
  CampaignRepository,
  "getWallet" | "redeemCode" | "validateCode"
>;

interface WalletRow {
  created_at: string;
  expires_at: string;
  id: string;
  initial_balance: number;
  provider_committed_micro_usd: number;
  provider_reserved_micro_usd: number;
  remaining_balance: number;
  reserved_balance: number;
  user_id: string;
}

interface RedemptionRpcRow {
  code_id: string;
  expires_at: string;
  initial_balance: number;
  provider_committed_micro_usd: number;
  provider_reserved_micro_usd: number;
  redeemed_at: string;
  remaining_balance: number;
  reserved_balance: number;
  wallet_created_at: string;
  wallet_id: string;
  wallet_user_id: string;
}

export class CampaignRepositoryUnavailableError extends Error {
  constructor() {
    super("CAMPAIGN_REPOSITORY_UNAVAILABLE");
    this.name = "CampaignRepositoryUnavailableError";
  }
}

function mapWallet(row: WalletRow): CreditWallet {
  return {
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    initialBalance: row.initial_balance,
    providerCommittedMicroUsd: row.provider_committed_micro_usd,
    providerReservedMicroUsd: row.provider_reserved_micro_usd,
    remainingBalance: row.remaining_balance,
    reservedBalance: row.reserved_balance,
    userId: row.user_id,
  };
}

function repositoryUnavailable(): never {
  throw new CampaignRepositoryUnavailableError();
}

function mapDatabaseError(message: unknown): never {
  const codes = [
    "ACCOUNT_ALREADY_REDEEMED",
    "CODE_ALREADY_REDEEMED",
    "CODE_EXPIRED",
    "CODE_NOT_FOUND",
    "CODE_REVOKED",
    "IDEMPOTENCY_CONFLICT",
  ] as const;
  const code =
    typeof message === "string"
      ? codes.find((candidate) => message.includes(candidate))
      : undefined;
  if (code) {
    return domainError(code);
  }
  return repositoryUnavailable();
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(new Date(value).getTime())
  );
}

function validLedgerInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasValidWalletAccounting(
  initialBalance: unknown,
  remainingBalance: unknown,
  reservedBalance: unknown,
  providerCommittedMicroUsd: unknown,
  providerReservedMicroUsd: unknown,
) {
  return (
    validLedgerInteger(initialBalance) &&
    validLedgerInteger(remainingBalance) &&
    validLedgerInteger(reservedBalance) &&
    remainingBalance + reservedBalance <= initialBalance &&
    validLedgerInteger(providerCommittedMicroUsd) &&
    validLedgerInteger(providerReservedMicroUsd) &&
    providerCommittedMicroUsd + providerReservedMicroUsd <= 250_000
  );
}

function isWalletRow(
  value: unknown,
  expectedUserId: string,
): value is WalletRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Partial<WalletRow>;
  return (
    validIdentifier(row.id) &&
    row.user_id === expectedUserId &&
    hasValidWalletAccounting(
      row.initial_balance,
      row.remaining_balance,
      row.reserved_balance,
      row.provider_committed_micro_usd,
      row.provider_reserved_micro_usd,
    ) &&
    validTimestamp(row.created_at) &&
    validTimestamp(row.expires_at) &&
    new Date(row.expires_at).getTime() > new Date(row.created_at).getTime()
  );
}

function isRedemptionRpcRow(
  value: unknown,
  expectedUserId: string,
): value is RedemptionRpcRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Partial<RedemptionRpcRow>;
  return (
    validIdentifier(row.code_id) &&
    validTimestamp(row.redeemed_at) &&
    validIdentifier(row.wallet_id) &&
    row.wallet_user_id === expectedUserId &&
    hasValidWalletAccounting(
      row.initial_balance,
      row.remaining_balance,
      row.reserved_balance,
      row.provider_committed_micro_usd,
      row.provider_reserved_micro_usd,
    ) &&
    validTimestamp(row.wallet_created_at) &&
    validTimestamp(row.expires_at) &&
    new Date(row.expires_at).getTime() >
      new Date(row.wallet_created_at).getTime()
  );
}

function mapRedemptionWallet(row: RedemptionRpcRow): CreditWallet {
  return {
    createdAt: row.wallet_created_at,
    expiresAt: row.expires_at,
    id: row.wallet_id,
    initialBalance: row.initial_balance,
    providerCommittedMicroUsd: row.provider_committed_micro_usd,
    providerReservedMicroUsd: row.provider_reserved_micro_usd,
    remainingBalance: row.remaining_balance,
    reservedBalance: row.reserved_balance,
    userId: row.wallet_user_id,
  };
}

export class SupabaseCampaignRepository
  implements Task4CampaignRepository
{
  async validateCode({
    code,
  }: ValidateCodeInput): Promise<ValidateCodeResult> {
    const client = createServiceRoleClient();
    const codeHash = await hashCode(code);
    const { data, error } = await client
      .from("promo_codes")
      .select("state,expires_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) {
      return repositoryUnavailable();
    }
    const eligible =
      data?.state === "eligible" &&
      (data.expires_at === null ||
        new Date(data.expires_at).getTime() > Date.now());
    return { eligible };
  }

  async getWallet({ userId }: GetWalletInput): Promise<CreditWallet> {
    const client = createServiceRoleClient();
    const { data, error } = await client
      .from("wallets")
      .select(
        "id,user_id,initial_balance,remaining_balance,reserved_balance,provider_committed_micro_usd,provider_reserved_micro_usd,created_at,expires_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return repositoryUnavailable();
    }
    if (!data) {
      return domainError("WALLET_NOT_FOUND");
    }
    if (!isWalletRow(data, userId)) {
      return repositoryUnavailable();
    }
    return mapWallet(data);
  }

  async redeemCode({
    code,
    idempotencyKey,
    userId,
  }: RedeemCodeInput): Promise<RedemptionResult> {
    const codeHash = await hashCode(code);
    let response: Awaited<
      ReturnType<ReturnType<typeof createServiceRoleClient>["rpc"]>
    >;
    try {
      const client = createServiceRoleClient();
      response = await client.rpc("redeem_campaign_code", {
        p_code_hash: codeHash,
        p_idempotency_key: idempotencyKey,
        p_user_id: userId,
      });
    } catch {
      return repositoryUnavailable();
    }

    const { data, error } = response;
    if (error) {
      return mapDatabaseError(error.message);
    }
    const row =
      Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!isRedemptionRpcRow(row, userId)) {
      return repositoryUnavailable();
    }

    return {
      codeId: row.code_id,
      redeemedAt: row.redeemed_at,
      wallet: mapRedemptionWallet(row),
    };
  }
}
