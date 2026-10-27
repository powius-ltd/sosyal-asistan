import { describe, expect, it } from "vitest";

import { ONBOARDING_GATE_MESSAGE, onboardingGate } from "@/lib/onboarding/gate";
import { PANEL_JARGON } from "@/lib/plain-language";

const workerScriptExists = () => true;

describe("onboardingGate (tek kapı; üyelik gelince yalnız burası değişir)", () => {
  it("örnek veride yönetici modu yeter: iş koşturulmaz, akış mock deposunda ilerler", () => {
    expect(onboardingGate({ env: {}, workerScriptExists: () => false })).toEqual({ open: true, mock: true });
    expect(onboardingGate({ env: { DATA_SOURCE: " MOCK " }, workerScriptExists })).toEqual({ open: true, mock: true });
  });

  it("gerçek veride iş kuyruğunun koşulları aranır", () => {
    expect(onboardingGate({ env: { DATA_SOURCE: "supabase" }, workerScriptExists })).toEqual({ open: true, mock: false });
    expect(onboardingGate({ env: { DATA_SOURCE: "supabase" }, workerScriptExists: () => false })).toEqual({ open: false, reason: "worker_missing" });
    expect(onboardingGate({ env: { DATA_SOURCE: "bilinmeyen" }, workerScriptExists })).toEqual({ open: false, reason: "data_source" });
  });

  it("yönetici modu kapalıyken (barındırılan ortam, OPERATOR_MODE=off) her veri kaynağında kapalı", () => {
    for (const env of [{ VERCEL: "1" }, { OPERATOR_MODE: "off" }, { VERCEL: "1", DATA_SOURCE: "supabase" }, { OPERATOR_MODE: "off", DATA_SOURCE: "supabase" }]) {
      expect(onboardingGate({ env, workerScriptExists }), JSON.stringify(env)).toEqual({ open: false, reason: "operator_off" });
    }
  });

  it("kapalı nedenleri düz dille söylenir", () => {
    for (const message of Object.values(ONBOARDING_GATE_MESSAGE)) {
      expect(message).not.toMatch(PANEL_JARGON);
      expect(message).not.toMatch(/apify|supabase|npm|worker/i);
    }
  });
});
