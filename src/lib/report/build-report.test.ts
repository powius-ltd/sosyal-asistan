import { describe, expect, it } from "vitest";

import { makeIdea, makeItem, makePlan, makeSections } from "@/components/weekly-plan/test-fixtures";
import type { Briefing, BriefingItem } from "@/lib/domain/briefing";
import type { Checkpoint, WeekReview, WeekReviewItem } from "@/lib/domain/outcomes";
import { PANEL_JARGON } from "@/lib/plain-language";
import { buildWeeklyReport } from "@/lib/report/build-report";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const base = { workspaceName: "Deneme Çalışma Alanı", handle: "deneme", now: NOW };

function checkpoint(patch: Partial<Checkpoint> & Pick<Checkpoint, "day" | "status">): Checkpoint {
  return { windowStart: "2026-10-12T00:00:00.000Z", windowEnd: "2026-10-14T00:00:00.000Z", ...patch };
}

function reviewItem(patch: Partial<WeekReviewItem>): WeekReviewItem {
  return { ideaId: "i", title: "Geçen haftanın videosu", suggestionCount: 0, checkpoints: [], directions: [], ...patch };
}

function review(items: WeekReviewItem[]): WeekReview {
  return {
    planId: "p0",
    weekStart: "2026-09-28",
    planGeneratedAt: "2026-09-27T10:00:00.000Z",
    computedAt: NOW.toISOString(),
    items,
    directions: [{ group: "hook_type", value: "question", label: "Soru", held: 2, missed: 1, unmeasured: 0 }],
    summary: { planned: items.length, linked: 0, measuredD7: 0, held: 2, missed: 1, unmeasured: 0 },
  };
}

function briefing(generatedAt: string, items: BriefingItem[]): Briefing {
  return {
    id: "b1",
    agent: "analyst",
    generatedAt,
    items,
    basis: { analyzedCount: 3, labeledCount: 0 },
    promptVersion: "t",
    personaVersion: "t",
  };
}

const note = (patch: Partial<BriefingItem>): BriefingItem => ({
  kind: "worked",
  headline: "Soru açılışı tutuyor",
  body: "Son videolarında soruyla başlayanlar daha çok izlendi.",
  evidence: ["c:1"],
  confidence: "high",
  ...patch,
});

describe("buildWeeklyReport", () => {
  it("takvim: gün adı + hedef kitle saati + İstanbul karşılığı (gün kayarsa söylenir); atanmamış saat yazılmaz", () => {
    const plan = makePlan({ items: [makeItem(1, 1), { ...makeItem(2, 2), slotAt: undefined }] });
    const report = buildWeeklyReport({ ...base, plan });
    expect(report.calendar[0]).toMatchObject({ day: "Perşembe 8 Eki", title: "Fikir 1" });
    expect(report.calendar[0]?.timeLines).toEqual(["19:00 ET", "02:00 İstanbul (ertesi gün)"]);
    expect(report.calendar[1]).toMatchObject({ day: undefined, timeLines: [], title: "Fikir 2" });
    expect(report.videos[1]?.when).toBeUndefined();
  });

  it("zaman sırası: erken slot önce gelir, atanmamış sonda; videolar takvimle aynı sırada numaralanır", () => {
    const early = { ...makeItem(2, 2), slotAt: "2026-10-06T18:00:00.000Z" };
    const none = { ...makeItem(3, 1), slotAt: undefined };
    const report = buildWeeklyReport({ ...base, plan: makePlan({ items: [none, makeItem(1, 3), early] }) });
    expect(report.calendar.map((r) => r.title)).toEqual(["Fikir 2", "Fikir 1", "Fikir 3"]);
    expect(report.videos.map((v) => [v.position, v.title])).toEqual([[1, "Fikir 2"], [2, "Fikir 1"], [3, "Fikir 3"]]);
  });

  it("yönler: düz dil başlık + cümle; ölçülemeyen etki cümleye girmez (0 yazılmaz)", () => {
    const report = buildWeeklyReport({ ...base, plan: makePlan() });
    const [question, dm] = report.directions;
    expect(question?.title).toBe("Soruyla açılış");
    expect(question?.sentence).toBe(
      "Benzer hesaplarda bu tarz videolar normalinin 4,2 katı izlendi (12 video). Sen bunu henüz denemedin. Ne kadar emin: kısmen eminim.",
    );
    expect(dm?.title).toBe("Sonunda mesaj atma");
    expect(dm?.sentence).toBe("Sen bunu denedin. Ne kadar emin: az örnek, emin değilim.");
  });

  it("kaçın: yalnız düşük izlenen gruplar; süre grubu düz başlıkla", () => {
    const report = buildWeeklyReport({ ...base, plan: makePlan() });
    expect(report.avoid).toEqual(["15–30 sn uzunluğunda videolar. Bu tarz videolar normalinin 0,8 katı izlendi (5 video)."]);
    const sections = makeSections();
    sections.avoid.entries = [{ kind: "off_niche", group: "off_niche", value: "x", label: "x", sampleSize: 1, confidence: "low", reason: "r" }];
    expect(buildWeeklyReport({ ...base, plan: makePlan({ sections }) }).avoid).toEqual([]);
  });

  it("özet jargon taşıyorsa düşer, yerine sayıdan kurulan cümle gelir; temiz özet olduğu gibi kalır", () => {
    expect(buildWeeklyReport({ ...base, plan: makePlan({ summary: "Medyan lift 3x olan hook'lar." }) }).lead).toBe("Bu hafta 4 video planlandı.");
    expect(buildWeeklyReport({ ...base, plan: makePlan({ summary: "Bu hafta dört kısa video." }) }).lead).toBe("Bu hafta dört kısa video.");
  });

  it("video: açılış + diğer seçenekler + metin paragrafları + açıklama; metin yoksa çekim adımları; jargonlu gerekçe düşer", () => {
    const report = buildWeeklyReport({ ...base, plan: makePlan() });
    const video = report.videos[0];
    expect(video).toMatchObject({
      opening: "Cümle 1-a",
      otherOpenings: ["Cümle 1-b", "Cümle 1-c"],
      body: { kind: "script", paragraphs: ["Script 1 birinci satır", "ikinci satır"] },
      caption: "Açıklama 1",
      summary: "Gerekçe 1",
    });
    const noScript = makeItem(9, 1);
    noScript.idea = makeIdea(9, { rationale: "Hook lift'i yüksek.", details: {} });
    const outline = buildWeeklyReport({ ...base, plan: makePlan({ items: [noScript] }) }).videos[0];
    expect(outline?.body).toEqual({ kind: "outline", paragraphs: ["Adım 1", "Adım 2"] });
    expect(outline?.summary).toBeUndefined();
    expect(outline?.caption).toBeUndefined();
  });

  it("süre ve sonundaki adım: hedef süre 'yaklaşık' ile; 'none' adım sayılmaz", () => {
    const withCta = makeItem(1, 1);
    withCta.idea = makeIdea(1, { details: { targetDurationSec: 105, ctaType: "comment_keyword" } });
    const noneCta = makeItem(2, 2);
    noneCta.idea = makeIdea(2, { details: { ctaType: "none" } });
    const report = buildWeeklyReport({ ...base, plan: makePlan({ items: [withCta, noneCta] }) });
    expect(report.videos[0]?.duration).toBe("yaklaşık 1 dk 45 sn");
    expect(report.videos[1]?.duration).toBeUndefined();
    expect(report.calendar.map((r) => r.endStep)).toEqual(["Yoruma kelime yazma", undefined]);
    expect(report.showEndStepColumn).toBe(true);
    expect(buildWeeklyReport({ ...base, plan: makePlan({ items: [noneCta] }) }).showEndStepColumn).toBe(false);
  });

  it("geçen hafta: 7. gün çarpanı; yoksa ham izlenme; ölçüm yoksa durum cümlesi; boş plan sonucu bölümü çizdirmez", () => {
    const measured = reviewItem({ title: "A", checkpoints: [checkpoint({ day: 7, status: "measured", lift: 2.3, views: 1000 })] });
    const early = reviewItem({ title: "B", checkpoints: [checkpoint({ day: 1, status: "measured", views: 1500 })] });
    const missed = reviewItem({ title: "C", checkpoints: [checkpoint({ day: 7, status: "missed" })] });
    const published = reviewItem({
      title: "D",
      link: { linkId: "l", status: "confirmed", origin: "manual_url", shortcode: "x" },
    });
    const out = buildWeeklyReport({ ...base, plan: makePlan(), review: review([measured, early, missed, published]) }).review;
    expect(out?.rows).toEqual([
      { title: "A", outcome: "7. gün sonucu: normalinin 2,3 katı izlendi" },
      { title: "B", outcome: "1. gün: 1,5 B izlenme" },
      { title: "C", outcome: "Yayınlandığı henüz bilinmiyor." },
      { title: "D", outcome: "Yayınlandı; sonuç henüz ölçülmedi." },
    ]);
    expect(out?.directionLines).toEqual(["Soruyla açılış: 2 videoda tuttu, 1 videoda tutmadı."]);
    expect(buildWeeklyReport({ ...base, plan: makePlan(), review: review([]) }).review).toBeUndefined();
    expect(buildWeeklyReport({ ...base, plan: makePlan(), review: null }).review).toBeUndefined();
  });

  it("güncel notlar: taze brifing; bayat olanı, panel işi söyleyen (sıradaki adım, bekleyen, komut) maddeler girmez", () => {
    const items = [
      note({}),
      note({ kind: "pending", headline: "Bekleyen" }),
      note({ kind: "next_step", headline: "Onay bekliyor" }),
      note({ headline: "Komut", action: { type: "run_cmd", label: "x", commandId: "plan", spendsMoney: false } }),
    ];
    const fresh = buildWeeklyReport({ ...base, plan: makePlan(), briefing: briefing("2026-10-04T10:00:00.000Z", items) });
    expect(fresh.notes).toEqual([{ headline: "Soru açılışı tutuyor", body: "Son videolarında soruyla başlayanlar daha çok izlendi." }]);
    const stale = buildWeeklyReport({ ...base, plan: makePlan(), briefing: briefing("2026-09-01T10:00:00.000Z", items) });
    expect(stale.notes).toEqual([]);
    expect(buildWeeklyReport({ ...base, plan: makePlan(), briefing: null }).notes).toEqual([]);
  });

  it("başlık bilgisi çalışma alanı verisinden gelir; düşük güvenli plan 'örnek az' işareti taşır", () => {
    const report = buildWeeklyReport({ ...base, plan: makePlan({ confidence: "low" }) });
    expect(report).toMatchObject({ workspaceName: "Deneme Çalışma Alanı", handle: "deneme", weekStart: "2026-10-05", fewSamples: true });
    expect(buildWeeklyReport({ ...base, plan: makePlan({ confidence: "high" }) }).fewSamples).toBe(false);
  });

  it("müşteri raporunda panel jargonu yok (tam model, jargonlu serbest metinler dahil girdi)", () => {
    // Fikir metinleri (açılış cümlesi, metin) kullanıcının kendi içeriğidir ve süzülmez; sabit kısımlar ve süzülen alanlar sınanır.
    const item = makeItem(1, 1);
    item.idea = makeIdea(1, { hooks: ["Açılış cümlesi"], rationale: "Medyan lift yüksek." });
    const report = buildWeeklyReport({
      ...base,
      plan: makePlan({ summary: "Hook lift özeti", items: [item] }),
      review: review([reviewItem({ checkpoints: [checkpoint({ day: 7, status: "measured", lift: 2.3 })] })]),
      briefing: briefing("2026-10-04T10:00:00.000Z", [note({})]),
    });
    expect(JSON.stringify(report)).not.toMatch(PANEL_JARGON);
  });
});
