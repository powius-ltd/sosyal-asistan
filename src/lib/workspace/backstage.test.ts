import { describe, expect, it } from "vitest";

import { isBackstageVisible } from "@/lib/workspace/backstage";

describe("isBackstageVisible", () => {
  it("yerelde (yönetici modu açık) ve kopya değilken açık", () => {
    expect(isBackstageVisible({})).toBe(true);
    expect(isBackstageVisible({ OPERATOR_MODE: "local", PANEL_EDITION: "saas" })).toBe(true);
  });
  it("müşteri kopyasında yönetici modu açık olsa da kapalı", () => {
    expect(isBackstageVisible({ PANEL_EDITION: "kopya" })).toBe(false);
    expect(isBackstageVisible({ PANEL_EDITION: "kopya", OPERATOR_MODE: "local" })).toBe(false);
  });
  it("yönetici modu kapalıyken (barındırma) kapalı", () => {
    expect(isBackstageVisible({ OPERATOR_MODE: "off" })).toBe(false);
    expect(isBackstageVisible({ VERCEL: "1" })).toBe(false);
  });
});
