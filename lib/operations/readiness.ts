import type { RuntimeEnvironment } from "@/lib/auth/runtime";

export type OperationalSwitch =
  | "YGF_REDEMPTION_ENABLED"
  | "YGF_WEB_TASKS_ENABLED";

/**
 * Production mutations require an explicit operator enablement. Local demo and
 * test flows preserve their existing default unless an operator sets false.
 */
export function isOperationalSwitchEnabled(
  name: OperationalSwitch,
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  const value = environment[name];
  if (nodeEnvironment === "production") {
    return value === "true";
  }
  return value !== "false";
}

export function isRedemptionEnabled(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  return isOperationalSwitchEnabled(
    "YGF_REDEMPTION_ENABLED",
    environment,
    nodeEnvironment,
  );
}

export function isWebTasksEnabled(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  return isOperationalSwitchEnabled(
    "YGF_WEB_TASKS_ENABLED",
    environment,
    nodeEnvironment,
  );
}
