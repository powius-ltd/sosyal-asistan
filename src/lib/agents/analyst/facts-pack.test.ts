import { describe, expect, it } from "vitest";

import { commandAction, contentEntry } from "@/lib/agents/analyst/facts-entries";
import { assembleFacts } from "@/lib/agents/analyst/facts-pack";
import { TEST_ACCOUNT } from "@/lib/agents/analyst/test-support";
import { TokenTable } from "@/lib/agents/analyst/tokens";

const CAPTION = "a".repeat(100);

function build(maxBytes?: number) {
  const tokens = new TokenTable();
  const entries = [3, 1, 2, 1].map((rank, i) => contentEntry({ id: `ci_${i}`, handle: "x", isOwn: false, caption: CAPTION, lift: 2 + i, views: 1000 + i, baselineN: 12 }, tokens, rank * 10 + i));
  return assembleFacts({ weekday: "Salı", accountType: "business", account: TEST_ACCOUNT, numbers: { followers: 5 }, entries, commands: [commandAction("plan")], tokens, basis: { analyzedCount: 1, labeledCount: 0 }, maxBytes });
}

describe("assembleFacts: boyut kırpma", () => {
  it("sınır yeterliyse hiçbir şey atılmaz ve omitted alanı yazılmaz", () => {
    const facts = build();
    expect(facts.refs.size).toBe(4);
    expect(facts.omitted).toEqual({});
    expect(facts.pack).not.toHaveProperty("omitted");
  });

  it("sınır aşılınca en büyük rank'lı (en az önemli) olgu önce atılır; sayısı omitted'a yazılır", () => {
    const full = build();
    const tight = build(full.bytes - 20);
    expect(tight.bytes).toBeLessThanOrEqual(full.bytes - 20);
    // rank: ci_0 → 30, ci_1 → 11, ci_2 → 22, ci_3 → 13: en önemsiz ci_0 atılır.
    expect([...tight.refs.keys()].sort()).toEqual(["c:ci_1", "c:ci_2", "c:ci_3"]);
    expect(tight.omitted).toEqual({ contents: 1 });
    expect(tight.pack.omitted).toEqual({ contents: 1 });
    expect(tight.tokens.get("lift:c:ci_0")).toBeUndefined();
    expect(tight.tokens.get("lift:c:ci_1")).toBeDefined();
    expect(tight.actions.has("open_video:c:ci_0")).toBe(false);
    expect(tight.actions.has("run_cmd:plan")).toBe(true); // genel komut olguya bağlı değil: kalır
  });

  it("çok sıkı sınırda tüm olgular gider, genel sayılar ve komutlar kalır", () => {
    const tight = build(10);
    expect(tight.refs.size).toBe(0);
    expect(tight.omitted).toEqual({ contents: 4 });
    expect(tight.pack.numbers).toEqual({ followers: 5 });
  });

  it("aynı ref iki kez girmez: en önemli (küçük rank) kalır", () => {
    const tokens = new TokenTable();
    const input = { id: "ci_a", handle: "x", isOwn: false, lift: 2, baselineN: 12 };
    const facts = assembleFacts({
      accountType: "business",
      account: TEST_ACCOUNT,
      weekday: "Salı",
      numbers: {},
      entries: [contentEntry(input, tokens, 50), contentEntry({ ...input, isNew: true }, tokens, 5)],
      commands: [],
      tokens,
      basis: { analyzedCount: 0, labeledCount: 0 },
    });
    expect(facts.pack.contents).toHaveLength(1);
    expect(facts.pack.contents[0]).toMatchObject({ new: true });
  });
});
