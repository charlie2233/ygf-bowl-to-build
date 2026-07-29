import { describe, expect, it } from "vitest";

import {
  isRedemptionEnabled,
  isWebTasksEnabled,
} from "@/lib/operations/readiness";

describe("operational mutation readiness", () => {
  it.each([
    ["redemption", isRedemptionEnabled, "YGF_REDEMPTION_ENABLED"],
    ["web tasks", isWebTasksEnabled, "YGF_WEB_TASKS_ENABLED"],
  ] as const)(
    "requires %s to be exactly true in production",
    (_label, isEnabled, name) => {
      expect(isEnabled({}, "production")).toBe(false);
      expect(isEnabled({ [name]: "true" }, "production")).toBe(true);
      expect(isEnabled({ [name]: "TRUE" }, "production")).toBe(false);
      expect(isEnabled({ [name]: " false " }, "production")).toBe(
        false,
      );
    },
  );

  it.each([
    ["redemption", isRedemptionEnabled, "YGF_REDEMPTION_ENABLED"],
    ["web tasks", isWebTasksEnabled, "YGF_WEB_TASKS_ENABLED"],
  ] as const)(
    "preserves %s demo and test defaults but honors an explicit false",
    (_label, isEnabled, name) => {
      for (const nodeEnvironment of ["development", "test"]) {
        expect(isEnabled({}, nodeEnvironment)).toBe(true);
        expect(
          isEnabled({ [name]: "false" }, nodeEnvironment),
        ).toBe(false);
      }
    },
  );
});
