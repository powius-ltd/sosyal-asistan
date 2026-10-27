/**
 * Sözleşme parçası: Analist brifingi (`getLatestBriefing`). ŞEKİL: seed'li workspace'te dolu brifing (1–5 madde, yazma sözleşmesiyle
 * `briefing-schema` doğrulanır, kanıt ref'leri geçerli ve içerik ref'leri gerçek içeriğe çözülür, `next_step` eylemli), serileştirilebilir;
 * yok/bilinmeyen/biçimsiz workspace → `null` (hata değil). Hesap/üretim `agents/analyst` testlerindedir; mock ve Supabase AYNI süiti geçer.
 */
import { expect, it } from "vitest";

import { briefingBasisSchema, briefingPayloadSchema } from "@/lib/data/briefing-schema";
import { BRIEFING_ITEMS_MAX, BRIEFING_ITEMS_MIN, BRIEFING_SCHEMA_VERSION } from "@/lib/domain/briefing";
import { parseBriefingRef } from "@/lib/domain/briefing-refs";
import type { ContractContext } from "@/lib/data/contract/support";

export function briefingContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("getLatestBriefing: seed'li workspace'te dolu brifing; şekil yazma sözleşmesine uyar", async () => {
    const briefing = await create().getLatestBriefing(wsId);
    expect(briefing, "seed'li workspace'te brifing var").not.toBeNull();
    if (briefing === null) return;
    expect(briefing.agent).toBe("analyst");
    expect(briefing.id.length).toBeGreaterThan(0);
    expect(Date.parse(briefing.generatedAt)).not.toBeNaN();
    expect(briefing.promptVersion.trim().length).toBeGreaterThan(0);
    expect(briefing.personaVersion.trim().length).toBeGreaterThan(0);
    expect(briefing.items.length).toBeGreaterThanOrEqual(BRIEFING_ITEMS_MIN);
    expect(briefing.items.length).toBeLessThanOrEqual(BRIEFING_ITEMS_MAX);
    const payload = briefingPayloadSchema.safeParse({ schemaVersion: BRIEFING_SCHEMA_VERSION, items: briefing.items });
    expect(payload.success, payload.success ? "" : payload.error.message).toBe(true);
    const basis = briefingBasisSchema.safeParse(briefing.basis);
    expect(basis.success, basis.success ? "" : basis.error.message).toBe(true);
    expect(briefing.items.some((item) => item.kind === "next_step" && item.action !== undefined), "en az bir eylemli sıradaki adım").toBe(true);
    expect(JSON.parse(JSON.stringify(briefing))).toEqual(briefing);
  });

  it("getLatestBriefing: içerik kanıt ref'leri gerçek içeriğe çözülür (uydurma kimlik yok)", async () => {
    const r = create();
    const briefing = await r.getLatestBriefing(wsId);
    expect(briefing).not.toBeNull();
    const refs = (briefing?.items ?? []).flatMap((item) => item.evidence).map((ref) => parseBriefingRef(ref));
    for (const ref of refs) {
      expect(ref, "kanıt ref'i ayrışır").toBeDefined();
      if (ref?.kind === "content" || ref?.kind === "due") {
        expect(await r.getContent(wsId, ref.contentId), `içerik bulunur: ${ref.contentId}`).not.toBeNull();
      }
    }
  });

  it("getLatestBriefing: bilinmeyen ya da biçimsiz workspace → null (hata değil)", async () => {
    const r = create();
    expect(await r.getLatestBriefing(foreign)).toBeNull();
    expect(await r.getLatestBriefing("not-a-uuid")).toBeNull();
  });
}
