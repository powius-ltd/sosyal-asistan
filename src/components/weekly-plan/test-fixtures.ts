/** Bileşen testleri için elle kurulmuş plan verisi (mock'a bağlı değil; yalnız test dosyaları import eder). */
import type { Idea } from "@/lib/domain/intel";
import type { WeeklyPlan, WeeklyPlanItem, WeeklyPlanSections } from "@/lib/domain/weekly-plan";

/** 2026-10-08 (Perşembe) 23:00 UTC = New York 19:00 = İstanbul Cuma 02:00. */
export const SLOT_AT = "2026-10-08T23:00:00.000Z";
const STAMP = "2026-10-04T10:00:00.000Z";

export function makeIdea(n: number, patch: Partial<Idea> = {}): Idea {
  return {
    id: `idea-${n}`,
    workspaceId: "ws",
    status: "new",
    title: `Fikir ${n}`,
    rationale: `Gerekçe ${n}`,
    platform: "instagram",
    format: "short_video",
    source: "weekly_plan",
    hooks: [`Cümle ${n}-a`, `Cümle ${n}-b`, `Cümle ${n}-c`],
    hookType: "question",
    scriptOutline: ["Adım 1", "Adım 2"],
    details: {
      script: `Script ${n} birinci satır\nikinci satır`,
      captionDraft: `Açıklama ${n}`,
      ownTried: false,
      quotes: [{ contentItemId: `c-${n}`, ownerHandle: "rakip", text: `Alıntı ${n}` }],
    },
    rankScore: 1.5,
    evidence: [
      {
        contentItemId: `c-${n}`,
        ownerHandle: "rakip",
        platform: "instagram",
        format: "short_video",
        caption: `Alt yazı ${n}`,
        currentLift: 4.2,
        liftAtCreation: 4,
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...patch,
  };
}

export function makeItem(n: number, position?: number): WeeklyPlanItem {
  return { ideaId: `idea-${n}`, position, slotAt: position ? SLOT_AT : undefined, idea: makeIdea(n) };
}

export function makeSections(): WeeklyPlanSections {
  return {
    winners: {
      rivals: [
        {
          contentItemId: "c-1",
          ownerHandle: "rakip",
          isOwn: false,
          lift: 4.2,
          views: 120_000,
          durationSec: 45,
          hookType: "question",
          analyzed: true,
          why: "Net bir soruyla açılıyor.",
          quote: { contentItemId: "c-1", ownerHandle: "rakip", text: "Kanıt alıntısı" },
        },
        // Analiz yok, izlenme/süre/hook ölçülemedi.
        { contentItemId: "c-2", ownerHandle: "rakip2", isOwn: false, lift: 3.1, analyzed: false },
      ],
      own: [],
      relaxedThreshold: false,
    },
    focus: {
      directions: [
        {
          group: "hook_type",
          value: "question",
          label: "Soru",
          impact: 4.2,
          novelty: 1.5,
          score: 6.3,
          sampleSize: 12,
          confidence: "medium",
          ownTried: false,
          rationale: "Yön gerekçesi metni.",
          rationaleQuote: { contentItemId: "c-1", ownerHandle: "rakip", text: "Yön alıntısı" },
          evidenceContentIds: ["c-1", "c-2"],
        },
        {
          group: "cta_type",
          value: "dm",
          label: "DM'e çağrı",
          impact: undefined,
          novelty: 1,
          score: 0,
          sampleSize: 3,
          confidence: "low",
          ownTried: true,
          evidenceContentIds: [],
        },
      ],
    },
    schedule: {
      postsPerWeek: 3,
      audienceTimeZone: "America/New_York",
      slots: [{ position: 1, at: SLOT_AT, weekday: 3, hour: 19, basis: "own_good" }],
    },
    avoid: {
      entries: [
        {
          kind: "low_lift",
          group: "duration_bucket",
          value: "15_30",
          label: "15–30 sn",
          medianLift: 0.8,
          sampleSize: 5,
          confidence: "medium",
          reason: "Zayıf kalan grup.",
        },
      ],
    },
    review: { status: "awaiting_publish_data" },
  };
}

export function makePlan(patch: Partial<WeeklyPlan> = {}): WeeklyPlan {
  return {
    id: "plan-1",
    workspaceId: "ws",
    platform: "instagram",
    weekStart: "2026-10-05",
    status: "ready",
    summary: "Plan özeti.",
    confidence: "medium",
    sections: makeSections(),
    items: [makeItem(1, 1), makeItem(2, 2), makeItem(3, 3), makeItem(4, 4)],
    alternatives: [makeItem(5)],
    taxonomyVersion: "2026-10-v1",
    promptVersion: "test",
    runIds: [],
    generatedAt: STAMP,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...patch,
  };
}
