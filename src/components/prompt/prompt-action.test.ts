import { describe, expect, it } from "vitest";

import { buildPromptAction } from "@/app/actions/prompt";
import { getPanelContext } from "@/lib/data";
import { PROMPT_MAX_CHARS } from "@/lib/prompt";

/** Gerçek `getPanelContext()` + tohumlu mock depo (varsayılan `DATA_SOURCE`): aksiyon uçtan uca çalışır. */
async function seed() {
  const { repo, wsId } = await getPanelContext();
  const [idea] = await repo.listIdeas(wsId, {});
  const [content] = (await repo.listContent(wsId, { limit: 1 })).items;
  const workspace = await repo.getWorkspace(wsId);
  return { idea, content, workspace };
}

describe("buildPromptAction", () => {
  it("içerik kaynağı: Türkçe prompt döner; niş tanımı ve kaynak hesap içerir", async () => {
    const { content, workspace } = await seed();
    const result = await buildPromptAction({ kind: "content", contentId: content.id }, "tr");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe("tr");
    expect(result.text).toContain("## Kanıt");
    expect(result.text).toContain(`@${content.owner.handle}`);
    expect(workspace?.nicheBrief).toBeTruthy();
    expect(result.text).toContain("## Bağlam");
    expect(Array.from(result.text).length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
  });

  it("fikir kaynağı: fikir başlığı + kanıt videolar; İngilizce dil desteklenir", async () => {
    const { idea } = await seed();
    const result = await buildPromptAction({ kind: "idea", ideaId: idea.id }, "en");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("## Idea");
    expect(result.text).toContain("Write the output in English.");
    expect(result.text).toContain(idea.title.slice(0, 30));
    expect(result.text.match(/^### /gm)?.length).toBe(Math.min(idea.evidence.length, 5));
  });

  it("geçersiz girdiyi depoya ulaşmadan reddeder", async () => {
    const bad: [unknown, unknown][] = [
      [null, "tr"],
      [{}, "tr"],
      [{ kind: "idea" }, "tr"],
      [{ kind: "idea", ideaId: "" }, "tr"],
      [{ kind: "content", contentId: "x".repeat(200) }, "tr"],
      [{ kind: "video", id: "a" }, "tr"],
      [{ kind: "content", contentId: "ci_001" }, "de"],
      [{ kind: "content", contentId: "ci_001" }, undefined],
    ];
    for (const [source, language] of bad) {
      expect(await buildPromptAction(source, language)).toMatchObject({ ok: false, code: "invalid_input" });
    }
  });

  it("bilinmeyen kaynak Türkçe not_found mesajı verir", async () => {
    const idea = await buildPromptAction({ kind: "idea", ideaId: "yok_123" }, "tr");
    expect(idea).toMatchObject({ ok: false, code: "not_found" });
    expect(!idea.ok && idea.message).toContain("Fikir bulunamadı");

    const content = await buildPromptAction({ kind: "content", contentId: "yok_123" }, "en");
    expect(content).toMatchObject({ ok: false, code: "not_found" });
    expect(!content.ok && content.message).toContain("İçerik bulunamadı");
  });
});
