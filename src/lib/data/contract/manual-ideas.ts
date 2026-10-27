/**
 * Sözleşme parçası: elle (sohbetten) eklenen fikir (`createManualIdea`). Test kendi oluşturduğunu `dismissed` yapar (fikir silinemez);
 * günlük sınır burada SINANMAZ (20 kayıt test çalışma alanını kirletir): mock birim testinde (`manual-ideas.test.ts`).
 */
import { expect, it } from "vitest";

import { MANUAL_IDEA_NOTE_MAX, MANUAL_IDEA_TITLE_MAX } from "@/lib/data/manual-idea-input";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function manualIdeasContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  it("elle fikir: kayıt alanları, listede görünür, plan üretimi silmez; geçersiz girdi ve bilinmeyen çalışma alanı reddedilir", async () => {
    const r = create();
    const now = new Date();
    const own = (await r.listOwnAccounts(wsId))[0];
    const idea = await r.createManualIdea(wsId, { title: "  Sözleşme test fikri  ", note: "Müşterinin kendi cümlesi." }, now);
    try {
      expect(idea).toMatchObject({ workspaceId: wsId, source: "manual", status: "new", title: "Sözleşme test fikri", rationale: "Müşterinin kendi cümlesi.", format: "short_video", hooks: [], scriptOutline: [], evidence: [] });
      expect(idea.platform).toBe(own.platform);
      expect((await r.getIdea(wsId, idea.id))?.source).toBe("manual");
      expect((await r.listIdeas(wsId, { status: "new" })).some((i) => i.id === idea.id)).toBe(true);
      const withFormat = await r.createManualIdea(wsId, { title: "Carousel fikri", note: "Not", format: "carousel" }, now);
      await r.updateIdeaStatus(wsId, withFormat.id, "dismissed");
      expect(withFormat.format).toBe("carousel");
    } finally {
      await r.updateIdeaStatus(wsId, idea.id, "dismissed");
    }
    await expectCode(r.createManualIdea(wsId, { title: "", note: "x" }, now), "invalid_input");
    await expectCode(r.createManualIdea(wsId, { title: "x", note: " " }, now), "invalid_input");
    await expectCode(r.createManualIdea(wsId, { title: "x".repeat(MANUAL_IDEA_TITLE_MAX + 1), note: "x" }, now), "invalid_input");
    await expectCode(r.createManualIdea(wsId, { title: "x", note: "x".repeat(MANUAL_IDEA_NOTE_MAX + 1) }, now), "invalid_input");
    await expectCode(r.createManualIdea(wsId, { title: "x", note: "x", format: "podcast" } as never, now), "invalid_input");
    await expectCode(r.createManualIdea(wsId, { title: "x", note: "x", source: "weekly_plan" } as never, now), "invalid_input");
    await expectCode(r.createManualIdea(MISSING_ID, { title: "x", note: "x" }, now), "not_found");
  });
}
