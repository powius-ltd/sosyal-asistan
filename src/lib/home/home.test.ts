import { describe, expect, it } from "vitest";

import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { buildDayStrip } from "@/lib/home/day-strip";
import { dueView } from "@/lib/home/due";
import { pendingVideos } from "@/lib/home/pending-videos";
import { buildStoryTiles } from "@/lib/home/story-tiles";
import type { PlanItemStatus } from "@/lib/overview/plan-item-status";

const ZONE = "Europe/Istanbul";

const item = (ideaId: string, title: string, slotAt?: string) => ({ ideaId, slotAt, idea: { title } }) as unknown as WeeklyPlan["items"][number];
const planOf = (items: WeeklyPlan["items"], extra: Partial<WeeklyPlan> = {}): WeeklyPlan =>
  ({
    weekStart: "2026-10-12",
    items,
    alternatives: [],
    sections: { focus: { directions: [] }, schedule: { audienceTimeZone: "America/New_York" } },
    ...extra,
  }) as unknown as WeeklyPlan;

describe("buildDayStrip", () => {
  it("7 gün Pazartesi'den; maddeler saat dilimine göre günlerine düşer, boş gün boş kalır, günü belirsiz madde sayılır", () => {
    const plan = planOf([
      item("a", "Birinci", "2026-10-12T18:00:00Z"), // Pzt 21:00 İstanbul
      item("b", "İkinci", "2026-10-13T18:00:00Z"),
      item("c", "Saatsiz"),
      item("d", "Hafta dışı", "2026-10-30T18:00:00Z"),
    ]);
    const statuses: PlanItemStatus[] = [{ kind: "next" }, { kind: "to_shoot" }, { kind: "to_shoot" }, { kind: "to_shoot" }];
    const strip = buildDayStrip(plan, statuses, ZONE);
    expect(strip.days.map((day) => day.weekday)).toEqual(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]);
    expect(strip.days.map((day) => day.dayNumber)).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(strip.days[0].items).toMatchObject([{ ideaId: "a", time: "21:00", status: "next", statusLabel: "Sırada" }]);
    expect(strip.days[0].isNext).toBe(true);
    expect(strip.days[1].isNext).toBe(false);
    expect(strip.days.slice(2).every((day) => day.items.length === 0)).toBe(true);
    expect(strip.unplaced).toBe(2);
  });

  it("gün sınırı çalışma alanı saat dilimine göredir (UTC'de akşam, İstanbul'da ertesi gün)", () => {
    const strip = buildDayStrip(planOf([item("a", "Gece", "2026-10-12T22:30:00Z")]), [{ kind: "to_shoot" }], ZONE);
    expect(strip.days[0].items).toHaveLength(0);
    expect(strip.days[1].items[0]).toMatchObject({ time: "01:30" });
  });
});

describe("dueView", () => {
  it("saat, gün adı ve tarih; hedef kitle saati farklıysa not; okunamayan zaman → undefined", () => {
    expect(dueView("2026-10-12T18:00:00Z", ZONE)).toEqual({ time: "21:00", weekday: "Pazartesi", date: "12 Eki", audienceNote: undefined });
    expect(dueView("2026-10-12T18:00:00Z", ZONE, "America/New_York")?.audienceNote).toBe("hedef kitle için 14:00 ET");
    expect(dueView("2026-10-12T18:00:00Z", ZONE, ZONE)?.audienceNote).toBeUndefined();
    expect(dueView(undefined, ZONE)).toBeUndefined();
    expect(dueView("bozuk", ZONE)).toBeUndefined();
  });
});

describe("buildStoryTiles", () => {
  const focusPlan = (impact: number | undefined) =>
    planOf([item("a", "Bir"), item("b", "İki")], {
      alternatives: [item("c", "Yedek")],
      sections: { focus: { directions: [{ group: "hook_type", value: "question", label: "Soru", impact, sampleSize: 8 }] }, schedule: { audienceTimeZone: "UTC" } },
    } as unknown as Partial<WeeklyPlan>);

  it("ölçülenler cümle + rakam; çarpan 'normalin X katı'; fikir sayısı ve plan/yedek dağılımı", () => {
    const [found, times, result] = buildStoryTiles({ plan: focusPlan(2.84), newIdeas: 6, statuses: [{ kind: "next" }, { kind: "to_shoot" }] });
    expect(found).toMatchObject({ figure: "3", sentence: "Senin için 3 fikir buldum.", detail: "Bu haftanın planında 2, yedekte 1." });
    expect(times).toMatchObject({ figure: "2,8", unit: "katı", sentence: "Bu tür videolar normalin 2,8 katı izleniyor.", detail: "Soru ile açılan videolar · 8 videoya baktım." });
    expect(times.ratio).toBeCloseTo(2.84);
    // Sonuç yok: rakam yok (tire), 0 değil.
    expect(result.figure).toBeUndefined();
    expect(result.sentence).toBe("Sonuçlar henüz ölçülmedi.");
  });

  it("plan/yedek açıklaması sayıya Türkçe ek getirmez (\"1'ü\" gibi yanlış ek çıkmaz); yedek yoksa 'Hepsi planda'", () => {
    const [withSpare] = buildStoryTiles({ plan: planOf([item("a", "Bir")], { alternatives: [item("b", "Yedek")] }) });
    expect(withSpare.detail).toBe("Bu haftanın planında 1, yedekte 1.");
    const [noSpare] = buildStoryTiles({ plan: planOf([item("a", "Bir")], { alternatives: [] }) });
    expect(noSpare.detail).toBe("Hepsi bu haftanın planında.");
    expect(`${withSpare.detail}${noSpare.detail}`).not.toMatch(/\d'/);
  });

  it("ölçülemeyen (undefined) değer rakam yazmaz: 0 ya da uydurma cümle çıkmaz", () => {
    const [found, times, result] = buildStoryTiles({ plan: focusPlan(undefined), newIdeas: undefined, statuses: undefined });
    expect(found.figure).toBe("3");
    expect(times.figure).toBeUndefined();
    expect(times.sentence).toContain("henüz ölçemedim");
    expect(result.figure).toBeUndefined();
    const none = buildStoryTiles({ plan: null, newIdeas: 0 });
    expect(none[0].figure).toBe("0");
    expect(none[0].detail).toBeUndefined();
    const unreadable = buildStoryTiles({ plan: undefined, newIdeas: undefined })[0];
    expect(unreadable.figure).toBeUndefined();
    expect(unreadable.sentence).toBe("Fikirleri şu an sayamadım.");
  });

  it("yönün tarifi düz dildir: 'CTA' gibi panel terimi çıkmaz", () => {
    const plan = planOf([], {
      sections: { focus: { directions: [{ group: "cta_type", value: "none", label: "CTA yok", impact: 1.1, sampleSize: 9 }] }, schedule: { audienceTimeZone: "UTC" } },
    } as unknown as Partial<WeeklyPlan>);
    expect(buildStoryTiles({ plan })[1].detail).toBe("Sonunda izleyiciden bir şey istenmeyen videolar · 9 videoya baktım.");
    const dm = planOf([], {
      sections: { focus: { directions: [{ group: "cta_type", value: "dm", label: "DM'e çağrı", impact: 2, sampleSize: 4 }] }, schedule: { audienceTimeZone: "UTC" } },
    } as unknown as Partial<WeeklyPlan>);
    expect(buildStoryTiles({ plan: dm })[1].detail).toContain("mesaj atma");
  });

  it("sonucu gelen videolar sayılır; sonuç bekleyenler söylenir", () => {
    const withResult = buildStoryTiles({
      plan: null,
      statuses: [{ kind: "result", resultPhrase: "normalinin 2,3 katı izlendi", strongResult: false }, { kind: "published" }],
    })[2];
    expect(withResult).toMatchObject({ figure: "1", detail: "Videon normalinin 2,3 katı izlendi." });
    const waiting = buildStoryTiles({ plan: null, statuses: [{ kind: "awaiting_result", waitingDay: 7 }] })[2];
    expect(waiting.figure).toBeUndefined();
    expect(waiting.detail).toBe("1 videonun ilk sayımını bekliyorum.");
  });
});

describe("pendingVideos", () => {
  it("plandaki fikrin başlığı, yoksa açıklamanın başı, ikisi de yoksa sabit ad; okunamadıysa boş", () => {
    const plan = planOf([item("i1", "Planlı fikir")]);
    const jobs = [
      { id: "j1", ideaId: "i1", caption: "x" },
      { id: "j2", ideaId: undefined, caption: "  Açıklama metni  " },
      { id: "j3", ideaId: undefined, caption: "" },
    ] as unknown as Parameters<typeof pendingVideos>[0];
    expect(pendingVideos(jobs, plan).map((video) => video.title)).toEqual(["Planlı fikir", "Açıklama metni", "Yayın bekleyen video"]);
    expect(pendingVideos(undefined, plan)).toEqual([]);
  });
});
