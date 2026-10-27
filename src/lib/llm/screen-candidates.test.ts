import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { CANDIDATE_PROMPT_VERSION, SCREEN_CANDIDATE_BATCH_MAX, screenCandidates, screenCandidatesBatched, type ScreenCandidateItem } from "@/lib/llm/screen-candidates";

const NICHE = "Kadınlar için inanç temelli koçluk: niyet, dua, şifa.";
const item = (id: string, bio = "Niyet koyma ve dua üzerine çalışırım", captions: string[] = ["Bugün sabah duası ile güne başla"]): ScreenCandidateItem => ({ id, bio, captions });
const verdict = (id: string, v: "fit" | "off" | "unsure" = "fit", quote = "niyet koyma ve dua") => ({ id, verdict: v, reason: `Biyografide somut ifade var (${id}).`, quote: v === "unsure" ? "" : quote });

describe("screenCandidates", () => {
  it("geçerli çıktı: girdi sırasında sonuç, doğrulanmış alıntı, meta ve istem sürümü", async () => {
    const llm = createFakeLlm({ results: [verdict("b", "off", "güne başla"), verdict("a")] });
    const out = await screenCandidates(llm.backend, { niche: NICHE, items: [item("a"), item("b")] });
    expect(out.results.map((r) => [r.id, r.fit])).toEqual([["a", "fit"], ["b", "off"]]);
    expect(out.results[0].quote).toBe("niyet koyma ve dua");
    expect(out.promptVersion).toBe(CANDIDATE_PROMPT_VERSION);
    expect(out.meta).toMatchObject({ kind: "llm_topic_screen", backend: "claude_cli" });
    expect(out.downgraded).toBe(0);
  });

  it("alıntı metinde yoksa karar unsure'a düşer (gerekçe korunur)", async () => {
    const llm = createFakeLlm({ results: [verdict("a", "fit", "uydurma bir cümle burada")] });
    const out = await screenCandidates(llm.backend, { niche: NICHE, items: [item("a")] });
    expect(out.results[0]).toMatchObject({ id: "a", fit: "unsure" });
    expect(out.results[0].quote).toBeUndefined();
    expect(out.results[0].reason).toContain("doğrulanamadı");
    expect(out.downgraded).toBe(1);
  });

  it("boş alıntı fit/off için geçersiz: unsure", async () => {
    const llm = createFakeLlm({ results: [verdict("a", "off", "")] });
    expect((await screenCandidates(llm.backend, { niche: NICHE, items: [item("a")] })).results[0].fit).toBe("unsure");
  });

  it("biyografi ve açıklaması olmayan aday modele gitmez: unsure; hepsi metinsizse model çağrılmaz", async () => {
    const llm = createFakeLlm({ results: [verdict("a")] });
    const mixed = await screenCandidates(llm.backend, { niche: NICHE, items: [{ id: "x" }, item("a")] });
    expect(mixed.results.map((r) => [r.id, r.fit])).toEqual([["x", "unsure"], ["a", "fit"]]);

    const none = await screenCandidates(createFakeLlm({ results: [] }).backend, { niche: NICHE, items: [{ id: "x", bio: "  " }] });
    expect(none.meta).toBeUndefined();
    expect(none.results).toEqual([expect.objectContaining({ id: "x", fit: "unsure" })]);
  });

  it("yalnız açıklaması olan (biyografisiz) aday elenir", async () => {
    const llm = createFakeLlm({ results: [verdict("a", "fit", "sabah duası ile")] });
    const out = await screenCandidates(llm.backend, { niche: NICHE, items: [{ id: "a", captions: ["Bugün sabah duası ile güne başla"] }] });
    expect(out.results[0].fit).toBe("fit");
  });

  it("girdi doğrulaması: boş niş, 15'ten fazla aday, yinelenen id", async () => {
    const llm = createFakeLlm({ results: [] });
    await expect(screenCandidates(llm.backend, { niche: " ", items: [item("a")] })).rejects.toMatchObject({ code: "invalid_input" });
    const many = Array.from({ length: SCREEN_CANDIDATE_BATCH_MAX + 1 }, (_, i) => item(`c${i}`));
    await expect(screenCandidates(llm.backend, { niche: NICHE, items: many })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(screenCandidates(llm.backend, { niche: NICHE, items: [item("a"), item("a")] })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("istem: boyut kullanılmaz, alıntı kuralı ve düz dil var", async () => {
    const llm = createFakeLlm({ results: [verdict("a")] });
    await screenCandidates(llm.backend, { niche: NICHE, items: [item("a")] });
    const sent = JSON.stringify(llm.calls);
    expect(sent).toContain("Follower counts");
    expect(sent).toContain("PLAIN LANGUAGE");
    expect(sent).toContain("character for character");
  });
});

describe("screenCandidatesBatched", () => {
  it("16 aday iki partiye bölünür (15 + 1), sonuçlar sırayla", async () => {
    const items = Array.from({ length: 16 }, (_, i) => item(`c${i}`));
    const llm = createFakeLlm({ results: items.slice(0, 15).map((it) => verdict(it.id)) }, { results: [verdict("c15")] });
    const out = await screenCandidatesBatched(llm.backend, { niche: NICHE, items });
    expect(out.results).toHaveLength(16);
    expect(out.metas).toHaveLength(2);
    expect(out.failed).toEqual([]);
  });
});
