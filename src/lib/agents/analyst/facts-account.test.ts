import { describe, expect, it } from "vitest";

import { collectFacts } from "@/lib/agents/analyst/facts";
import { commandActions, planGenerable, type CommandState } from "@/lib/agents/analyst/facts-commands";
import { OWN_BEST_LIFT_MIN, OWN_BEST_MAX, ownBestContents } from "@/lib/agents/analyst/facts-own-best";
import { buildAnalystSystemPrompt } from "@/lib/agents/analyst/prompt";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import type { PanelRepository } from "@/lib/data/repository";
import type { AccountType } from "@/lib/domain/account-type";
import { video, NOW as FIXTURE_NOW } from "@/lib/anatomy/test-fixtures";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const NOW = new Date(MOCK_NOW);

async function ctxFor(accountType: AccountType, over: Partial<PanelRepository> = {}) {
  const repo = createMockRepository();
  await repo.updateWorkspace(MOCK_WORKSPACE_ID, { accountType });
  return { repo: { ...repo, ...over } as PanelRepository, workspaceId: MOCK_WORKSPACE_ID, now: NOW };
}

const refKinds = (refs: Iterable<string>) => new Set([...refs].map((ref) => ref.split(":")[0]));
const hasAction = (actions: ReadonlyMap<string, unknown>, id: string) => actions.has(id);

describe("collectFacts: hesap türüne göre paket", () => {
  it("business: açı matrisi hücreleri ve etiket sayıları var, konu hücresi yok; hesap bölümü amacı taşır", async () => {
    const facts = await collectFacts(await ctxFor("business"));
    expect(facts.accountType).toBe("business");
    expect(facts.pack.account).toMatchObject({ matrices: ["angle_funnel"], hasRivals: true });
    expect(facts.pack.account.purpose.length).toBeGreaterThan(0);
    expect(refKinds(facts.refs.keys()).has("topic")).toBe(false);
    expect(facts.pack.numbers).toHaveProperty("labeled");
    expect(facts.tokens.get("g:unlabeled")).toBeDefined();
  });

  it("creator: açı matrisi olguları ve etiket sayıları GİRMEZ; konu × hook hücreleri (topic: ref'i) girer; 'etiketle' eylemi yok", async () => {
    const facts = await collectFacts(await ctxFor("creator"));
    expect(facts.pack.account.matrices).toEqual(["topic_hook"]);
    const kinds = refKinds(facts.refs.keys());
    expect(kinds.has("cell")).toBe(false);
    expect(kinds.has("topic")).toBe(true);
    expect(facts.pack.numbers).not.toHaveProperty("labeled");
    expect(facts.pack.numbers).not.toHaveProperty("unlabeled");
    expect(facts.tokens.get("g:labeled")).toBeUndefined();
    expect(hasAction(facts.actions, "run_cmd:label")).toBe(false);
    expect(facts.pack.numbers).toHaveProperty("topic_clustered");
    // topic hücresi: konu adı + hook + durum; belirteçler kayıtlı
    const topicCell = facts.pack.cells.find((cell) => typeof cell.ref === "string" && cell.ref.startsWith("topic:"));
    expect(topicCell).toMatchObject({ topic: expect.any(String), hook: expect.any(String), status: expect.any(String) });
    expect(facts.tokens.get(`on:${topicCell?.ref as string}`)).toBeDefined();
    expect(hasAction(facts.actions, `open_matrix:${topicCell?.ref as string}`)).toBe(true);
  });

  it("mixed: iki matris birden (cell: ve topic: ref'leri); açı etiketleme komutu etiketsiz video varsa durur", async () => {
    const facts = await collectFacts(await ctxFor("mixed"));
    expect(facts.pack.account.matrices).toEqual(["angle_funnel", "topic_hook"]);
    const kinds = refKinds(facts.refs.keys());
    expect(kinds.has("cell")).toBe(true);
    expect(kinds.has("topic")).toBe(true);
  });

  it("kendi tutanlar (son dönem, eşik katı ve üstü) pakete best:true ile, lift azalan girer; sayısı belirteçle", async () => {
    const facts = await collectFacts(await ctxFor("creator"));
    const best = facts.pack.contents.filter((content) => content.best === true);
    expect(best.length).toBeGreaterThan(0);
    expect(best.length).toBeLessThanOrEqual(OWN_BEST_MAX);
    for (const content of best) {
      expect(content.side).toBe("own");
      expect(content.lift as number).toBeGreaterThanOrEqual(OWN_BEST_LIFT_MIN);
      expect(facts.refs.has(content.ref as `c:${string}`)).toBe(true);
    }
    const lifts = best.map((content) => content.lift as number);
    expect(lifts).toEqual([...lifts].sort((a, b) => b - a));
    expect(facts.tokens.get("g:own_best_count")?.value).toBeGreaterThanOrEqual(best.length);
  });

  it("rakipsiz hesap açıkça işaretlenir (hasRivals: false) ve rakip içerik olgusu girmez", async () => {
    const facts = await collectFacts(await ctxFor("creator", { listCompetitors: async () => [] }));
    expect(facts.pack.account.hasRivals).toBe(false);
  });
});

describe("ownBestContents (saf)", () => {
  const own = (id: string, lift: number | undefined, daysAgo = 10, extra: { immature?: boolean } = {}) => video({ id, own: true, lift, daysAgo, ...extra }).item;

  it("yalnız kendi, pencere içinde, eşik ve üstü, olgun; lift azalan; en çok OWN_BEST_MAX; toplam ayrı sayılır", () => {
    const items = [
      own("a", 5.9),
      own("b", 3.2),
      own("c", 2.9), // eşik altı
      own("d", undefined), // ölçülemedi: 0 sayılmaz, atlanır
      own("e", 8, 200), // pencere dışı
      own("f", 9, 5, { immature: true }), // lift oturmadı
      video({ id: "r", lift: 12 }).item, // rakip
      ...["g1", "g2", "g3", "g4", "g5", "g6"].map((id, i) => own(id, 3 + i / 10)),
    ];
    const best = ownBestContents(items, FIXTURE_NOW);
    expect(best.total).toBe(8);
    expect(best.top).toHaveLength(OWN_BEST_MAX);
    expect(best.top.map((item) => item.id).slice(0, 2)).toEqual(["a", "g6"]);
    expect(best.top.every((item) => item.owner.kind === "own")).toBe(true);
  });

  it("tutan yoksa boş (hata değil)", () => {
    expect(ownBestContents([own("x", 1.2)], FIXTURE_NOW)).toEqual({ top: [], total: 0 });
  });
});

describe("commandActions + planGenerable: eylem önerileri duruma göre", () => {
  const base: CommandState = { accountType: "business", daysSinceCollect: 2, hasUnanalyzed: false, unlabeledCount: 4, planGenerable: true, dueCount: 0 };
  const ids = (state: CommandState) => commandActions(state).map((option) => option.id);

  it("etiketle: yalnız açı etiketlemesi uygulanan türde ve etiketsiz video varsa", () => {
    expect(ids(base)).toContain("run_cmd:label");
    expect(ids({ ...base, accountType: "mixed" })).toContain("run_cmd:label");
    expect(ids({ ...base, accountType: "creator" })).not.toContain("run_cmd:label");
    expect(ids({ ...base, unlabeledCount: 0 })).not.toContain("run_cmd:label");
  });

  it("planı üret: plan yokken ve üretilebilirse; bu hafta/gelecek hafta planı varsa ya da üretilemiyorsa yok", () => {
    expect(ids(base)).toContain("run_cmd:plan");
    expect(ids({ ...base, planRole: "past_week" })).toContain("run_cmd:plan");
    expect(ids({ ...base, planRole: "this_week" })).not.toContain("run_cmd:plan");
    expect(ids({ ...base, planRole: "next_week" })).not.toContain("run_cmd:plan");
    expect(ids({ ...base, planGenerable: false })).not.toContain("run_cmd:plan");
  });

  it("plan üretilebilirlik: analizli video + (izlenen rakip ya da kendi tutanlar); rakipsiz ve tutansız → hayır", () => {
    expect(planGenerable({ analyzedCount: 10, hasRivals: true, ownBestCount: 0 })).toBe(true);
    expect(planGenerable({ analyzedCount: 10, hasRivals: false, ownBestCount: 7 })).toBe(true);
    expect(planGenerable({ analyzedCount: 10, hasRivals: false, ownBestCount: 0 })).toBe(false);
    expect(planGenerable({ analyzedCount: 0, hasRivals: true, ownBestCount: 3 })).toBe(false);
  });

  it("toplama/analiz/ölçüm eylemleri eski kurallarla", () => {
    expect(ids({ ...base, daysSinceCollect: undefined })).toContain("run_cmd:collect");
    expect(ids({ ...base, daysSinceCollect: 7 })).toContain("run_cmd:collect");
    expect(ids({ ...base, daysSinceCollect: 6 })).not.toContain("run_cmd:collect");
    expect(ids({ ...base, hasUnanalyzed: true })).toContain("run_cmd:analyze");
    expect(ids({ ...base, dueCount: 1 })).toContain("run_cmd:measure");
  });
});

describe("buildAnalystSystemPrompt: dil hesap türüne göre", () => {
  it("creator: satış/huni dili yasak, konu × hook anlatılır, açı hücresi anlatılmaz", () => {
    const prompt = buildAnalystSystemPrompt("creator");
    expect(prompt).toContain("This account sells nothing");
    expect(prompt).toContain("topic/hook");
    expect(prompt).not.toContain("stage/angle");
    expect(prompt).not.toContain("labeled/unlabeled");
  });

  it("business: güven → müşteri → satış, açı matrisi; mixed: iki amaç ve iki matris", () => {
    const business = buildAnalystSystemPrompt("business");
    expect(business).toContain("trust, then customers, then sales");
    expect(business).toContain("stage/angle");
    expect(business).not.toContain("This account sells nothing");
    const mixed = buildAnalystSystemPrompt("mixed");
    expect(mixed).toContain("two goals");
    expect(mixed).toContain("stage/angle");
    expect(mixed).toContain("topic/hook");
  });
});
