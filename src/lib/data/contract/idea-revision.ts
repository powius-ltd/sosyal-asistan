/**
 * Sözleşme parçası: fikir değişikliği (`reviseIdea`, SPN-35). Hook / taslak yeniden yazılır, ESKİ hâl `details.revisions`'a (en yeni başta)
 * girer; başlık ve gerekçe değişmez; düzenlenemeyen durum `invalid_state`. Test seed'deki `new` bir fikri kullanır ve içeriğini sonunda geri yazar
 * (revizyon kaydı kalır; sözleşme süiti kendi test çalışma alanında koşar). Durum denemesi `new → dismissed → new` ile geri alınır.
 */
import { expect, it } from "vitest";

import { IDEA_REVISIONS_MAX } from "@/lib/domain/idea-revision";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

const NOW = new Date("2030-02-01T09:00:00.000Z");
const HOOKS = [
  { text: "Bunu bir hafta dene, farkı kendin gör.", type: "question" },
  { text: "Çoğu kişi ilk adımı atlıyor.", type: "bold_claim" },
  { text: "Ben de aynı hatayı yapıyordum.", type: "confession" },
];

export function ideaRevisionContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("reviseIdea: yeni hook ve taslak yazılır, eski hâl revisions'ın başına girer, başlık / gerekçe değişmez", async () => {
    const r = create();
    const [idea] = await r.listIdeas(wsId, { status: "new", limit: 1 });
    expect(idea, "seed: new durumunda fikir").toBeDefined();
    if (!idea) return;
    const priorRevisions = idea.details.revisions ?? [];
    const revised = await r.reviseIdea(wsId, idea.id, { request: "Açılışı daha sade yap", hooks: HOOKS, scriptOutline: ["Açılış", "Gövde"] }, NOW);
    try {
      expect(revised.hooks).toEqual(HOOKS.map((h) => h.text));
      expect(revised.scriptOutline).toEqual(["Açılış", "Gövde"]);
      expect(revised.details.hookTypes).toEqual(HOOKS.map((h) => h.type));
      expect(revised.title).toBe(idea.title);
      expect(revised.rationale).toBe(idea.rationale);
      expect(revised.status).toBe("new");
      const [latest] = revised.details.revisions ?? [];
      expect(latest, "eski hâl saklandı").toMatchObject({ request: "Açılışı daha sade yap", hooks: idea.hooks, scriptOutline: idea.scriptOutline, at: NOW.toISOString() });
      expect(revised.details.revisions?.length).toBe(Math.min(priorRevisions.length + 1, IDEA_REVISIONS_MAX));
      expect((await r.getIdea(wsId, idea.id))?.hooks).toEqual(HOOKS.map((h) => h.text));
    } finally {
      const back = idea.hooks.length >= 3 ? idea.hooks.slice(0, 5).map((text, i) => ({ text, type: idea.details.hookTypes?.[i] ?? "question" })) : HOOKS;
      await r.reviseIdea(wsId, idea.id, { request: "geri al", hooks: back, scriptOutline: idea.scriptOutline.length >= 2 ? idea.scriptOutline : ["Açılış", "Gövde"] }, NOW);
    }
  });

  it("reviseIdea: bırakılmış fikir invalid_state; geçersiz girdi invalid_input; bilinmeyen fikir / workspace not_found", async () => {
    const r = create();
    const [idea] = await r.listIdeas(wsId, { status: "new", limit: 1 });
    expect(idea, "seed: new durumunda fikir").toBeDefined();
    if (!idea) return;
    await r.updateIdeaStatus(wsId, idea.id, "dismissed");
    try {
      await expectCode(r.reviseIdea(wsId, idea.id, { request: "x", hooks: HOOKS, scriptOutline: ["a", "b"] }, NOW), "invalid_state");
    } finally {
      await r.updateIdeaStatus(wsId, idea.id, "new");
    }
    await expectCode(r.reviseIdea(wsId, idea.id, { request: "x", hooks: HOOKS.slice(0, 2), scriptOutline: ["a", "b"] }, NOW), "invalid_input");
    await expectCode(r.reviseIdea(wsId, idea.id, { request: "", hooks: HOOKS, scriptOutline: ["a", "b"] }, NOW), "invalid_input");
    await expectCode(r.reviseIdea(wsId, MISSING_ID, { request: "x", hooks: HOOKS, scriptOutline: ["a", "b"] }, NOW), "not_found");
    await expectCode(r.reviseIdea(foreign, idea.id, { request: "x", hooks: HOOKS, scriptOutline: ["a", "b"] }, NOW), "not_found");
  });
}
