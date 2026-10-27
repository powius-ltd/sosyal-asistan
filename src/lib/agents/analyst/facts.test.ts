import { describe, expect, it } from "vitest";

import { collectFacts } from "@/lib/agents/analyst/facts";
import { FACTS_MAX_BYTES } from "@/lib/agents/analyst/facts-types";
import { reviewAnalystOutput } from "@/lib/agents/analyst/verify";
import { isBriefingRef } from "@/lib/domain/briefing-refs";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const ctx = () => ({ repo: createMockRepository(), workspaceId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) });

describe("collectFacts (mock depo)", () => {
  it("paket sınırın altında; her ref geçerli biçimde ve pakette; tüm sayısal alanlar sonlu", async () => {
    const facts = await collectFacts(ctx());
    expect(facts.bytes).toBeLessThanOrEqual(FACTS_MAX_BYTES);
    expect(facts.bytes).toBe(Buffer.byteLength(JSON.stringify(facts.pack), "utf8"));
    expect(facts.refs.size).toBeGreaterThan(0);
    for (const ref of facts.refs.keys()) {
      expect(isBriefingRef(ref)).toBe(true);
      expect(facts.json).toContain(`"${ref}"`);
    }
    for (const value of Object.values(facts.pack.numbers)) expect(Number.isFinite(value)).toBe(true);
    expect(facts.omitted).toEqual({});
    expect(facts.basis.analyzedCount).toBeGreaterThan(0);
  });

  it("yayın tarihi olgudur: içerikte 'ago' (gün) + belirteç, kendi en son video 'latest' işaretli; pencere genel sayı (tarih metne yalnız belirteçle girer)", async () => {
    const facts = await collectFacts(ctx());
    const contents = facts.pack.contents as { ref: string; side: string; ago?: number; latest?: boolean }[];
    const latest = contents.filter((c) => c.latest === true);
    expect(latest).toHaveLength(1);
    expect(latest[0].side).toBe("own");
    expect(typeof latest[0].ago).toBe("number");
    expect(facts.tokens.get(`ago:${latest[0].ref}`)?.format).toBe("days_ago");
    // "latest" gerçekten kendi videolarının en yenisi: hiçbir kendi içerik ondan daha taze değil.
    const ownAges = contents.filter((c) => c.side === "own" && c.ago !== undefined).map((c) => c.ago as number);
    expect(latest[0].ago).toBe(Math.min(...ownAges));
    expect(facts.pack.numbers.own_best_window).toBe(90);
    expect(facts.tokens.get("g:own_best_window")?.format).toBe("days");
  });

  it("ölçülemeyen alan pakete girmez, belirteci sebebiyle unmeasured'a yazılır (0 değil)", async () => {
    const facts = await collectFacts(ctx());
    expect(facts.pack.unmeasured.length).toBeGreaterThan(0);
    for (const { key, reason } of facts.pack.unmeasured) {
      expect(reason.length).toBeGreaterThan(0);
      expect(facts.tokens.get(key)?.value).toBeUndefined();
      if (key.startsWith("g:")) expect(facts.pack.numbers).not.toHaveProperty(key.slice(2));
    }
  });

  it("harcama yönetici bilgisidir: varsayılan pakette (brifing) yok, unmeasured'da da yok; yalnız includeSpend ile girer", async () => {
    const spendKeys = ["apify_usd", "apify_cap_usd", "sub_runs"];
    const plain = await collectFacts(ctx());
    for (const key of spendKeys) {
      expect(plain.pack.numbers).not.toHaveProperty(key);
      expect(plain.tokens.get(`g:${key}`)).toBeUndefined();
      expect(plain.pack.unmeasured.map((u) => u.key)).not.toContain(`g:${key}`);
    }
    const operator = await collectFacts(ctx(), { includeSpend: true });
    expect(operator.pack.numbers).toHaveProperty("apify_usd");
    expect(operator.pack.numbers).toHaveProperty("sub_runs");
  });

  it("rakip metni kısaltılır; eylem listesi kod üretir (ajan komut icat edemez)", async () => {
    const facts = await collectFacts(ctx());
    for (const content of facts.pack.contents) if (typeof content.caption === "string") expect([...content.caption].length).toBeLessThanOrEqual(110);
    for (const [id, action] of facts.actions) {
      expect(id.startsWith(`${action.type}:`)).toBe(true);
      expect(action.spendsMoney).toBe(action.type === "run_cmd" ? action.spendsMoney : false);
    }
    expect([...facts.actions.keys()].filter((id) => id.startsWith("run_cmd:")).every((id) => /^run_cmd:(collect|analyze|label|plan|measure)$/.test(id))).toBe(true);
  });

  it("boyut sınırı aşılırsa az önemli olgular atılır, omitted sayılır; atılan olgunun ref/eylem/belirteci geçersiz olur", async () => {
    const full = await collectFacts(ctx());
    const trimmed = await collectFacts(ctx(), { maxBytes: 4_500 });
    expect(trimmed.bytes).toBeLessThanOrEqual(4_500);
    const omittedCount = Object.values(trimmed.omitted).reduce((sum, n) => sum + (n ?? 0), 0);
    expect(omittedCount).toBeGreaterThan(0);
    expect(trimmed.refs.size).toBeLessThan(full.refs.size);
    expect(trimmed.pack.omitted).toEqual(trimmed.omitted);

    const dropped = [...full.refs.keys()].filter((ref) => !trimmed.refs.has(ref) && ref.startsWith("c:"));
    expect(dropped.length).toBeGreaterThan(0);
    const ref = dropped[0];
    expect(trimmed.tokens.get(`views:${ref}`)).toBeUndefined();
    expect(trimmed.actions.has(`open_video:${ref}`)).toBe(false);
    expect(trimmed.json).not.toContain(ref);
    // Ajan atılan olguya atıf yaparsa doğrulama reddeder.
    const review = reviewAnalystOutput({ items: [{ kind: "changed", headline: "Başlık", body: "Metin.", evidence: [ref] }] }, trimmed);
    expect(review).toContain("kanıt ref'i pakette yok");
  });
});
