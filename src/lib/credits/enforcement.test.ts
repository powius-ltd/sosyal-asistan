import { describe, expect, it } from "vitest";

import { isCreditsEnforced } from "@/lib/credits/enforcement";

describe("isCreditsEnforced", () => {
  it("PANEL_EDITION tanımsızken eski davranış", () => {
    expect(isCreditsEnforced({ CREDITS_ENFORCED: "on" })).toBe(true);
    expect(isCreditsEnforced({})).toBe(false);
  });
  it("kopyada anahtar açık olsa da kapalı", () => {
    expect(isCreditsEnforced({ CREDITS_ENFORCED: "on", PANEL_EDITION: "kopya" })).toBe(false);
  });
});
