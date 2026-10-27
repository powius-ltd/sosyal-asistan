import { describe, expect, it } from "vitest";

import { EMPTY_FLAGS, toComplianceInput, toPublishPayload, type PublishFlags } from "@/components/publish/publish-flags";
import { checkCompliance } from "@/lib/compliance";

const flags = (patch: Partial<PublishFlags>): PublishFlags => ({ ...EMPTY_FLAGS, ...patch });

describe("toPublishPayload", () => {
  it("varsayılan: işaret yok, reklam veren yok, Trial alanı hiç gönderilmez", () => {
    expect(toPublishPayload(EMPTY_FLAGS)).toEqual({ paidPartnership: false, aiGenerated: false });
  });

  it("reklam veren yalnız ücretli iş birliğinde ve kırpılmış gider; boşsa gönderilmez", () => {
    expect(toPublishPayload(flags({ paidPartnership: true, advertiserName: "  Notion Türkiye " }))).toEqual({
      paidPartnership: true,
      aiGenerated: false,
      advertiserName: "Notion Türkiye",
    });
    expect(toPublishPayload(flags({ paidPartnership: true, advertiserName: "   " }))).toEqual({ paidPartnership: true, aiGenerated: false });
    // Ücretli iş birliği kapalıyken formda kalmış metin sızmaz.
    expect(toPublishPayload(flags({ paidPartnership: false, advertiserName: "Notion" }))).toEqual({ paidPartnership: false, aiGenerated: false });
  });

  it("Trial açıkken mezuniyet stratejisiyle gider", () => {
    expect(toPublishPayload(flags({ trialEnabled: true }))).toMatchObject({ trial: { enabled: true, graduation: "manual" } });
    expect(toPublishPayload(flags({ trialEnabled: true, trialGraduation: "performance" }))).toMatchObject({
      trial: { enabled: true, graduation: "performance" },
    });
    expect(toPublishPayload(flags({ trialEnabled: false, trialGraduation: "performance" }))).not.toHaveProperty("trial");
  });
});

describe("toComplianceInput (canlı denetim girdisi)", () => {
  it("işaretleri ve bölgeyi taşır; reklam veren adı denetimde kullanılır", () => {
    const input = toComplianceInput("Reklam · Notion Türkiye ile", flags({ paidPartnership: true, advertiserName: "Notion Türkiye" }), "TR");
    expect(input).toEqual({
      caption: "Reklam · Notion Türkiye ile",
      isPaidPartnership: true,
      isAiGenerated: false,
      advertiserName: "Notion Türkiye",
      region: "TR",
    });
    expect(checkCompliance(input).status).toBe("ok"); // ibare + reklam veren açıklamada
  });

  it("ücretli iş birliği kapalıyken reklam veren adı denetime girmez", () => {
    expect(toComplianceInput("x", flags({ advertiserName: "Marka" }), "US").advertiserName).toBeUndefined();
  });
});
