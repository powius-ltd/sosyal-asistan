/** "Bugün" testleri için elle kurulmuş girdiler (mock'a bağlı değil; yalnız test dosyaları import eder). */
import type { Briefing, BriefingItem } from "@/lib/domain/briefing";
import type { IdeaLink } from "@/lib/domain/outcomes";
import { makeInput } from "@/lib/overview/test-fixtures";
import type { OverviewSummaryInput } from "@/lib/overview/types";
import type { TodayInput, TodayPublishJob } from "@/lib/today/types";

/** Pazartesi 5 Eki 2026 09:00 UTC: `makePlan` haftasının (5 Eki) başı; plan slotu (8 Eki) henüz gelmedi. */
export const NOW = new Date("2026-10-05T09:00:00.000Z");

export const WORKSPACE: NonNullable<TodayInput["workspace"]> = {
  timezone: "Europe/Istanbul",
  nicheBrief: "Koçluk",
  accountType: "business",
  complianceRegion: "TR",
};

/** Veri olan, hiçbir karar beklemeyen çalışma alanı; `summary` yaması Genel bakış girdisini değiştirir. */
export function makeToday(patch: Partial<Omit<TodayInput, "summary">> = {}, summary: Partial<OverviewSummaryInput> = {}): TodayInput {
  return { now: NOW, summary: makeInput(summary), workspace: WORKSPACE, briefing: null, suggestedLinks: [], pendingJobs: [], ...patch };
}

export function makeLink(patch: Partial<IdeaLink> = {}): IdeaLink {
  return {
    id: "link-1",
    workspaceId: "ws",
    ideaId: "idea-1",
    shortcode: "Cabc",
    status: "suggested",
    origin: "auto_match",
    contentItemId: "ci-9",
    content: { contentItemId: "ci-9", ownerHandle: "hesap", platform: "instagram", format: "short_video", caption: "Sabah rutini" },
    score: 0.8,
    reasons: [],
    createdAt: "2026-10-04T10:00:00.000Z",
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...patch,
  };
}

export function makeJob(patch: Partial<TodayPublishJob> = {}): TodayPublishJob {
  return { id: "job-1", caption: "Yeni video", paidPartnership: false, aiGenerated: false, ...patch };
}

export function makeBriefingItem(patch: Partial<BriefingItem> = {}): BriefingItem {
  return {
    kind: "worked",
    headline: "Soruyla açılan videolar tuttu",
    body: "Soruyla açtığın videolar daha çok izlendi.",
    evidence: ["c:ci-1"],
    confidence: "medium",
    ...patch,
  };
}

export function makeBriefing(items: BriefingItem[] = [makeBriefingItem()], generatedAt = "2026-10-04T12:00:00.000Z"): Briefing {
  return {
    id: "b-1",
    agent: "analyst",
    generatedAt,
    items,
    basis: { analyzedCount: 6, labeledCount: 4 },
    promptVersion: "test",
    personaVersion: "persona-v1",
  };
}
