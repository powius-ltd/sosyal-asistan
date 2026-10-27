import { describe, expect, it } from "vitest";

import type { Idea } from "@/lib/domain/intel";
import type { FocusDirection, WeeklyPlan, WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import type { OutcomeContent } from "@/lib/outcomes/content";
import { buildWeekReview } from "@/lib/outcomes/review";
import { DAY_MS } from "@/lib/time";

const PUBLISHED = Date.parse("2026-10-06T16:00:00Z");
const NOW = new Date(PUBLISHED + 12 * DAY_MS);
const at = (days: number) => new Date(PUBLISHED + days * DAY_MS).toISOString();

const hookDirection = (value: string): FocusDirection => ({
  group: "hook_type", value, label: value, novelty: 1, score: 1, sampleSize: 5, confidence: "medium", ownTried: true, evidenceContentIds: [],
});
const durationDirection = (value: string): FocusDirection => ({ ...hookDirection(value), group: "duration_bucket" });
const topicDirection = (value: string): FocusDirection => ({ ...hookDirection(value), group: "topic_cluster" });

function planItem(ideaId: string, over: Partial<Idea> = {}, position = 1): WeeklyPlanItem {
  const idea = {
    id: ideaId, title: `Fikir ${ideaId}`, hookType: "question", details: {}, hooks: [],
    reelLink: { linkId: `l-${ideaId}`, status: "confirmed", origin: "manual_url", shortcode: `code${ideaId}`, contentItemId: `c-${ideaId}` },
    ...over,
  } as unknown as Idea;
  return { ideaId, position, idea };
}

function plan(items: WeeklyPlanItem[], directions: FocusDirection[]): WeeklyPlan {
  return {
    id: "plan-1", weekStart: "2026-10-05", generatedAt: at(-2), items, alternatives: [],
    sections: { focus: { directions } },
  } as unknown as WeeklyPlan;
}

const content = (id: string, over: Partial<OutcomeContent> = {}): OutcomeContent => ({
  id: `c-${id}`, ownerHandle: "ornek", publishedAt: at(0), durationSec: 40, baselineViews: 1000, baselineViewsKind: "ig_play_count",
  snapshots: [
    { capturedAt: at(1.5), views: 900, viewsKind: "ig_play_count" },
    { capturedAt: at(4), views: 1200, viewsKind: "ig_play_count" },
    { capturedAt: at(8), views: 2000, viewsKind: "ig_play_count" },
  ],
  ...over,
});

const review = (items: WeeklyPlanItem[], directions: FocusDirection[], contents: OutcomeContent[], extra = {}) =>
  buildWeekReview({ plan: plan(items, directions), contents: new Map(contents.map((c) => [c.id, c])), now: NOW, ...extra });

describe("geçen hafta: yön hükmü", () => {
  it("uyan yön + D+7 lift ≥ 1,0 → tuttu (≥ 1,5 güçlü); < 1,0 → tutmadı", () => {
    const strong = review([planItem("1")], [hookDirection("question")], [content("1")]);
    expect(strong.items[0].directions).toEqual([expect.objectContaining({ verdict: "held", strong: true })]);

    const weak = review([planItem("1")], [hookDirection("question")], [content("1", { snapshots: [{ capturedAt: at(8), views: 1200, viewsKind: "ig_play_count" }] })]);
    expect(weak.items[0].directions[0]).toMatchObject({ verdict: "held", strong: false });

    const lost = review([planItem("1")], [hookDirection("question")], [content("1", { snapshots: [{ capturedAt: at(8), views: 600, viewsKind: "ig_play_count" }] })]);
    expect(lost.items[0].directions[0].verdict).toBe("missed");
  });

  it("uymayan yön listede YOK; hook türü analizden (varsa) yoksa fikirden", () => {
    const r = review([planItem("1")], [hookDirection("story"), durationDirection("30_60")], [content("1")]);
    expect(r.items[0].directions.map((d) => d.value)).toEqual(["30_60"]); // fikir "question", süre 40 sn → 30_60

    const analysis = review([planItem("1")], [hookDirection("story")], [content("1", { analysisHookType: "story" })]);
    expect(analysis.items[0].directions.map((d) => d.value)).toEqual(["story"]);
  });

  it("D+7 ölçümü yok → unmeasured + sebep (0 ya da tutmadı DEĞİL)", () => {
    const noD7 = content("1", { snapshots: [{ capturedAt: at(1.5), views: 900, viewsKind: "ig_play_count" }] });
    const r = review([planItem("1")], [hookDirection("question")], [noD7]);
    expect(r.items[0].directions[0]).toMatchObject({ verdict: "unmeasured" });
    expect(r.items[0].directions[0].reason).toMatch(/7\. gün/);
    expect(r.items[0].checkpoints.map((c) => c.status)).toEqual(["measured", "missed", "missed"]);
    expect([r.summary.held, r.summary.missed, r.summary.unmeasured]).toEqual([0, 0, 1]);
  });

  it("yayının yöne uyumu bilinemiyorsa (süre/konu olgusu yok) unmeasured + sebep, 'uymadı' denmez", () => {
    const r = review([planItem("1")], [durationDirection("30_60"), topicDirection("fiyat")], [content("1", { durationSec: undefined })]);
    expect(r.items[0].directions.map((d) => [d.group, d.verdict])).toEqual([["duration_bucket", "unmeasured"], ["topic_cluster", "unmeasured"]]);
  });

  it("konu: ref'siz eski kayıtta birebir ad Türkçe katlamayla eşleşir", () => {
    const r = review([planItem("1", { details: { topic: "Fiyatlandırma" } })], [topicDirection("FİYATLANDIRMA")], [content("1")]);
    expect(r.items[0].directions[0].verdict).toBe("held");
  });

  it("konu ve tekrar yönü fikrin bağlı yönünden eşleşir (gerçek veride fikir konusu küme adıyla aynı yazılmaz)", () => {
    // Küme adı ve fikrin serbest konu etiketi ayrı LLM çağrılarından: birebir tutmaz.
    const directions = [hookDirection("story"), topicDirection("Evde kahve demleme"), { ...topicDirection("repeat_winners"), label: "Tekrarla / seriye çevir" }];
    const toTopic = planItem("1", { details: { topic: "Soğuk demleme sırları" }, directionRef: "F2" });
    const toRepeat = planItem("2", { details: { topic: "Geçen haftaki tarifin 2. bölümü" }, directionRef: "F3" }, 2);
    const r = review([toTopic, toRepeat], directions, [content("1"), content("2")]);

    expect(r.items[0].directions).toEqual([expect.objectContaining({ value: "Evde kahve demleme", verdict: "held" })]);
    expect(r.items[1].directions).toEqual([expect.objectContaining({ value: "repeat_winners", verdict: "held" })]);
    expect(r.directions.map((d) => [d.value, d.held])).toEqual([["story", 0], ["Evde kahve demleme", 1], ["repeat_winners", 1]]);
  });

  it("bağsız (ref'siz) eski kayıtta tutmayan konu sessizce düşmez: 'eşleştirilemedi' sebebiyle görünür", () => {
    const r = review([planItem("1", { details: { topic: "Soğuk demleme sırları" } })], [topicDirection("Evde kahve demleme")], [content("1")]);
    expect(r.items[0].directions).toEqual([expect.objectContaining({ verdict: "unmeasured", reason: expect.stringMatching(/eşleştirilemedi/) })]);
    expect(r.directions[0]).toMatchObject({ held: 0, missed: 0, unmeasured: 1 });
  });
});

describe("geçen hafta: bağ ve toplam", () => {
  it("bağsız öğede nokta/hüküm yok; içerik bekleyen bağ da içeriksizdir", () => {
    const unlinked = planItem("1", { reelLink: undefined });
    const awaiting = planItem("2", { reelLink: { linkId: "l-2", status: "awaiting_content", origin: "manual_url", shortcode: "zz" } }, 2);
    const r = review([unlinked, awaiting], [hookDirection("question")], []);
    for (const item of r.items) expect([item.checkpoints, item.directions, item.publishedAt]).toEqual([[], [], undefined]);
    expect(r.items.map((i) => i.link?.status)).toEqual([undefined, "awaiting_content"]);
    expect(r.summary).toMatchObject({ planned: 2, linked: 1, measuredD7: 0, held: 0, missed: 0, unmeasured: 0 });
  });

  it("yön toplamı her plan yönü için vardır; hükümler yayınlardan sayılır; D+1/D+3'te lift yok", () => {
    const r = review(
      [planItem("1"), planItem("2", {}, 2)],
      [hookDirection("question"), hookDirection("story")],
      [content("1"), content("2", { snapshots: [{ capturedAt: at(8), views: 300, viewsKind: "ig_play_count" }] })],
      { suggestionCounts: new Map([["2", 2]]) },
    );
    expect(r.directions.map((d) => [d.value, d.held, d.missed, d.unmeasured])).toEqual([["question", 1, 1, 0], ["story", 0, 0, 0]]);
    expect(r.items[1].suggestionCount).toBe(2);
    expect(r.summary.measuredD7).toBe(2);
    for (const item of r.items) for (const c of item.checkpoints) if (c.day !== 7) expect(c.lift).toBeUndefined();
  });

  it("öğeler plan sırasına göre; saat çağıranın `now`'ı", () => {
    const r = review([planItem("b", {}, 2), planItem("a", {}, 1)], [], []);
    expect(r.items.map((i) => i.ideaId)).toEqual(["a", "b"]);
    expect(r.computedAt).toBe(NOW.toISOString());
    expect(r.weekStart).toBe("2026-10-05");
  });
});
