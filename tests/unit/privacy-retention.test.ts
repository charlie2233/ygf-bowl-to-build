import { describe, expect, it } from "vitest";

import { privacySections } from "@/lib/content/legal";

describe("truthful retention copy", () => {
  it("describes Postgres replay storage and the unsatisfied physical-cleanup gate", () => {
    const copy = privacySections
      .flatMap((section) => section.body ?? [])
      .join(" ");

    expect(copy).toContain(
      "stored in Postgres for a logical 15-minute idempotent replay window",
    );
    expect(copy).toContain("can repeat or echo submitted input");
    expect(copy).toContain(
      "Raw request prompts are not stored in a separate prompt column",
    );
    expect(copy).toContain(
      "bounded scheduled cleanup job is still a production launch gate",
    );
    expect(copy).not.toContain("short-lived process memory");
  });

  it("warns that an unlinked anonymous wallet is browser-bound", () => {
    const copy = privacySections
      .flatMap((section) => section.body ?? [])
      .join(" ");

    expect(copy).toContain(
      "Clearing browser site data can permanently remove access",
    );
    expect(copy).toContain(
      "anonymous-user cleanup is not automatic",
    );
  });
});
