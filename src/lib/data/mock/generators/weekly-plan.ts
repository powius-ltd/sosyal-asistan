/**
 * Mock üreteci: haftalık plan (şimdiki hafta + geçen hafta) ve ses profili. Her şey mock verinin KENDİSİNDEN türetilir
 * (gerçek rakip tutanları, analizler, içgörüler, fikirler) — uydurma rakam yok; sayılabilen her şey düz kod (`views/insights`).
 * Plan fikirleri yeni üretilmez: mevcut 15 fikirden seçilir ve `source = weekly_plan`, script/alıntı ayrıntıları ve plan
 * bağıyla zenginleştirilir (Fikirler ekranında plan rozeti). Plan öğeleri okuma anında `state.ideas`'tan kurulur (durum
 * değişimleri plana yansır), bu yüzden burada yalnız fikir kimliği saklanır (`StoredWeeklyPlan`).
 */
import { fromZonedTime } from "date-fns-tz";

import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { LiftGroupStat } from "@/lib/domain/insights";
import { RIVAL_QUOTE_MAX, TAXONOMY_VERSION, type ContentAnalysis, type Idea, type RivalQuote, type Transcript } from "@/lib/domain/intel";
import type { Workspace } from "@/lib/domain/run";
import { CTA_TYPE_LABEL, DURATION_BUCKET_LABEL, durationBucketOf } from "@/lib/domain/taxonomy";
import type { VoiceProfile, VoiceTrait } from "@/lib/domain/voice-profile";
import {
  plannedPostCount,
  weekDayKeys,
  weekStartOf,
  type AvoidEntry,
  type FocusDirection,
  type FocusGroup,
  type PlanWinner,
  type ScheduleSlot,
  type SlotBasis,
  type WeeklyPlan,
  type WeeklyPlanSections,
} from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { buildInsights } from "@/lib/data/views/insights";
import { classifyCta } from "@/lib/data/views/insights-cta";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { offNicheAvoidEntries } from "@/lib/data/mock/generators/weekly-plan-niche";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";
import { median } from "@/lib/metrics/stats";
import { liftPhrase } from "@/lib/plain-language";
import { AVOID_PLAIN } from "@/lib/plain-language-plan";
import { winnerWhy } from "@/lib/data/mock/generators/plan-wording";
import { truncateText } from "@/lib/text";
import { DAY_MS } from "@/lib/time";

/** Plan öğeleri: fikir kimliği + sıra (plana girdi) ya da sırasız (aday). Fikir kartı okuma anında eklenir. */
export interface StoredWeeklyPlan extends Omit<WeeklyPlan, "items" | "alternatives"> {
  itemRefs: { ideaId: string; position?: number; slotAt?: string; slotNote?: string }[];
}

export interface WeeklyPlanInput {
  clock: MockClock;
  workspace: Workspace;
  ownAccounts: readonly OwnAccount[];
  competitors: readonly Competitor[];
  content: readonly ContentItem[];
  analyses: readonly ContentAnalysis[];
  transcripts: readonly Transcript[];
  /** Fikirler: plana alınanlar yerinde zenginleştirilir (kaynak, ayrıntı, plan bağı). */
  ideas: Idea[];
  /** Konu eleğinin niş dışı bulduğu içerikler: tutan/yön hesabından çıkar, "Kaçın"da listelenir. */
  offNicheContentIds?: readonly string[];
}

export interface WeeklyPlanResult {
  plans: StoredWeeklyPlan[];
  voiceProfiles: VoiceProfile[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const quoteOf = (text: string) => truncateText(text, RIVAL_QUOTE_MAX);
const ageDays = (clock: MockClock, item: ContentItem) => (item.publishedAt ? clock.ageDays(item.publishedAt) : Number.POSITIVE_INFINITY);

interface Group {
  group: FocusGroup;
  value: string;
  label: string;
  items: ContentItem[];
}

function groupsOf(items: readonly ContentItem[], analysisById: ReadonlyMap<string, ContentAnalysis>): Group[] {
  const map = new Map<string, Group>();
  const add = (group: FocusGroup, value: string | undefined, label: (v: string) => string, item: ContentItem) => {
    if (value === undefined) return;
    const key = `${group}:${value}`;
    const entry = map.get(key) ?? { group, value, label: label(value), items: [] };
    entry.items.push(item);
    map.set(key, entry);
  };
  for (const item of items) {
    const analysis = analysisById.get(item.id);
    if (analysis?.status === "ok" && analysis.evidenceVerified) add("hook_type", analysis.hookType, hookTypeLabel, item);
    const bucket = durationBucketOf(item.durationSec);
    add("duration_bucket", bucket, (v) => DURATION_BUCKET_LABEL[v as keyof typeof DURATION_BUCKET_LABEL], item);
    const cta = classifyCta(item.caption);
    add("cta_type", cta, (v) => CTA_TYPE_LABEL[v as keyof typeof CTA_TYPE_LABEL], item);
  }
  return [...map.values()];
}

/** Grup özeti: gerçek hesapla AYNI kural (`summarizeLiftSamples`): güven örnek sayısından + baz çizgisi tavanı. */
function statOf(items: readonly ContentItem[]): Pick<LiftGroupStat, "n" | "liftN" | "medianLift" | "outlierCount" | "confidence"> {
  const summary = summarizeLiftSamples(items.map((c) => ({ lift: c.score.lift, lowBaseline: c.score.lowConfidence })));
  return { n: items.length, liftN: summary.n, medianLift: summary.medianLift, outlierCount: summary.outlierCount, confidence: summary.confidence };
}

/** Yönün gerekçe alıntısı: kanıt içeriklerinden, analizi `ok` + doğrulanmış ilk videonun hook'u (kalıcı kısa rakip alıntısı). */
function rationaleQuoteOf(evidence: readonly ContentItem[], analysisById: ReadonlyMap<string, ContentAnalysis>): RivalQuote | undefined {
  for (const item of evidence) {
    const analysis = analysisById.get(item.id);
    if (analysis?.status === "ok" && analysis.evidenceVerified && analysis.hookText) {
      return { contentItemId: item.id, ownerHandle: item.owner.handle, text: quoteOf(analysis.hookText) };
    }
  }
  return undefined;
}

function winnerOf(item: ContentItem, analysis: ContentAnalysis | undefined): PlanWinner {
  const analyzed = analysis?.status === "ok" && analysis.hookText !== undefined && analysis.hookType !== undefined;
  const lift = item.score.lift ?? 0;
  return {
    contentItemId: item.id,
    ownerHandle: item.owner.handle,
    isOwn: item.owner.kind === "own",
    lift,
    views: item.metrics.views,
    publishedAt: item.publishedAt,
    durationSec: item.durationSec,
    hookType: analysis?.hookType,
    analyzed,
    why: analyzed
      ? winnerWhy(analysis?.hookType ?? "", lift)
      : undefined,
    quote: analyzed && analysis?.hookText ? { contentItemId: item.id, ownerHandle: item.owner.handle, text: quoteOf(analysis.hookText) } : undefined,
  };
}

function buildSections(input: WeeklyPlanInput, weekStart: string, planIdeaCount: number): WeeklyPlanSections {
  const { clock, workspace, ownAccounts, competitors, content, analyses } = input;
  const analysisById = new Map(analyses.map((a) => [a.contentItemId, a]));
  const trackedIds = new Set(competitors.filter((c) => c.status === "tracked").map((c) => c.id));
  // Niş dışı içerik (konu eleği) tutanlara ve gruplara girmez; "Kaçın"da sahibine göre özetlenir.
  const offNiche = new Set(input.offNicheContentIds ?? []);
  const videos = content.filter((c) => c.format === "short_video" && c.score.lift !== undefined && !offNiche.has(c.id));
  const rivals = videos.filter((c) => c.owner.kind === "competitor" && trackedIds.has(c.owner.id));
  const mine = videos.filter((c) => c.owner.kind === "own");

  // 1 — Ne tuttu: rakip son 30 gün ≥ 3x (azsa ≥ 2x, işaretli) en çok 5; kendi son 90 gün ≥ 1,5x en çok 3.
  const recentRivals = rivals.filter((c) => ageDays(clock, c) <= 30).sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0));
  const strong = recentRivals.filter((c) => (c.score.lift ?? 0) >= 3);
  const relaxed = strong.length < 3;
  const pickedRivals = (relaxed ? recentRivals.filter((c) => (c.score.lift ?? 0) >= 2) : strong).slice(0, 5);
  const pickedOwn = mine.filter((c) => ageDays(clock, c) <= 90 && (c.score.lift ?? 0) >= 1.5).sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0)).slice(0, 3);

  // 2 — Neye yüklen / 5 — Kaçın: hook türü, süre kovası ve CTA türü grupları (rakip, son 90 gün).
  const rivalGroups = groupsOf(rivals.filter((c) => ageDays(clock, c) <= 90), analysisById);
  const ownGroupKeys = new Set(groupsOf(mine, analysisById).map((g) => `${g.group}:${g.value}`));
  const scored = rivalGroups
    .map((g) => ({ g, stat: statOf(g.items), ownTried: ownGroupKeys.has(`${g.group}:${g.value}`) }))
    .filter((x) => x.stat.medianLift !== undefined && x.stat.liftN >= 2);
  const directions: FocusDirection[] = scored
    .map(({ g, stat, ownTried }): FocusDirection => {
      const impact = stat.medianLift ?? 0;
      const novelty = ownTried ? 1 : 1.5;
      const evidence = [...g.items].sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0)).slice(0, 3);
      return {
        group: g.group,
        value: g.value,
        label: g.label,
        impact,
        novelty,
        score: impact * novelty,
        sampleSize: stat.liftN,
        confidence: stat.confidence,
        ownTried,
        rationale: `${g.label}: rakiplerde tipik video ${liftPhrase(impact)} (${stat.liftN} video); ${ownTried ? "sen bunu denedin." : "sen bunu henüz denemedin."}`,
        rationaleQuote: rationaleQuoteOf(evidence, analysisById),
        evidenceContentIds: evidence.map((c) => c.id),
      };
    })
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, 3);
  const avoid: AvoidEntry[] = scored
    .filter(({ stat }) => (stat.medianLift ?? 1) < 1)
    .sort((a, b) => (a.stat.medianLift ?? 0) - (b.stat.medianLift ?? 0))
    .slice(0, 2)
    .map(({ g, stat }) => ({
      kind: "low_lift",
      group: g.group,
      value: g.value,
      label: g.label,
      medianLift: stat.medianLift,
      sampleSize: stat.liftN,
      confidence: stat.confidence,
      reason: AVOID_PLAIN.lowSentence(g.label, stat.liftN, stat.medianLift),
    }));

  // 4 — Takvim: adet = clamp(rakip medyan haftalık / 2, 3, 5); saatler kendi iyi saatleri, yoksa rakip sabit saatleri.
  const tz = workspace.audienceTimeZone;
  const insights = buildInsights({ workspace, own: ownAccounts, competitors: [...competitors], items: content, now: new Date(clock.nowMs) }, { days: 90 });
  const rivalRows = insights.rows.filter((r) => r.subjectKind === "competitor");
  const rivalWeekly = median(rivalRows.flatMap((r) => (r.posting.postsPerWeek === undefined ? [] : [r.posting.postsPerWeek])));
  const ownSlots = insights.rows.filter((r) => r.subjectKind === "own").flatMap((r) => r.posting.commonSlots);
  const rivalSlots = rivalRows.flatMap((r) => r.posting.commonSlots);
  const basis: SlotBasis = ownSlots.length > 0 ? "own_good" : rivalSlots.length > 0 ? "rival_fixed" : "default";
  const hours = (ownSlots.length > 0 ? ownSlots : rivalSlots).map((s) => s.hour);
  const days = weekDayKeys(weekStart);
  const weekdays = [2, 3, 4, 5, 6];
  const postsPerWeek = Math.min(plannedPostCount(rivalWeekly), planIdeaCount);
  const slots: ScheduleSlot[] = Array.from({ length: postsPerWeek }, (_, i) => {
    const weekday = weekdays[i % weekdays.length];
    const hour = Math.max(hours.length > 0 ? hours[i % hours.length] : 19, weekday === 2 ? 15 : 0);
    const at = fromZonedTime(`${days[weekday]}T${pad2(hour)}:00:00`, tz).toISOString();
    return { position: i + 1, at, weekday, hour, basis, note: basis === "default" ? "Yeterli saat verisi yok; varsayılan akşam saati." : undefined };
  });

  return {
    winners: {
      rivals: pickedRivals.map((c) => winnerOf(c, analysisById.get(c.id))),
      own: pickedOwn.map((c) => winnerOf(c, analysisById.get(c.id))),
      relaxedThreshold: relaxed,
      unmeasuredReason: pickedRivals.length === 0 ? "Son 30 günde lift'i ölçülmüş tutan rakip videosu yok." : undefined,
    },
    focus: { directions, unmeasuredReason: directions.length === 0 ? "Yönler için yeterli (≥ 2 videolu) grup yok." : undefined },
    schedule: { postsPerWeek, audienceTimeZone: tz, slots, rivalMedianPostsPerWeek: rivalWeekly },
    avoid: { entries: [...avoid, ...offNicheAvoidEntries(content.filter((c) => c.format === "short_video"), offNiche, trackedIds)] },
    review: { status: "awaiting_publish_data", note: "Geçen haftanın yayın sonuçları F3'te (resmi API ölçümü) gelecek." },
  };
}

/** Plana girecek fikirlerin ayrıntıları: script, açıklama taslağı, kalıcı kısa rakip alıntıları, ses özelliği bağı. */
function enrichIdea(idea: Idea, itemsById: ReadonlyMap<string, ContentItem>, analysisById: ReadonlyMap<string, ContentAnalysis>, traitKeys: string[]): void {
  const quotes: RivalQuote[] = idea.evidence.flatMap((e) => {
    const hook = analysisById.get(e.contentItemId)?.hookText;
    return hook ? [{ contentItemId: e.contentItemId, ownerHandle: itemsById.get(e.contentItemId)?.owner.handle, text: quoteOf(hook) }] : [];
  });
  const rotation = [idea.hookType ?? "question", "bold_claim", "callout", "story_open", "question"];
  idea.source = "weekly_plan";
  idea.details = {
    ...idea.details,
    script: idea.details.script ?? idea.scriptOutline.join(" "),
    scriptLanguage: "tr",
    captionDraft: idea.details.captionDraft ?? `${idea.title}\n\n${idea.hooks[0] ?? ""}`.trim(),
    targetDurationSec: 75,
    durationBucket: "60_90",
    hookTypes: idea.hooks.map((_, i) => rotation[i % rotation.length]),
    quotes,
    voiceTraitKeys: traitKeys.slice(0, 3),
    ownTried: !idea.rationale.includes("henüz denenmedi"),
    maxSharedWords: 3,
  };
}

function buildVoiceProfile(input: WeeklyPlanInput, account: OwnAccount, stats: VoiceProfile["stats"]): VoiceProfile {
  const { analyses, transcripts, content, clock } = input;
  const ownIds = new Set(content.filter((c) => c.owner.id === account.id).map((c) => c.id));
  const textById = new Map(transcripts.map((t) => [t.contentItemId, t.text]));
  const own = analyses.filter((a) => ownIds.has(a.contentItemId) && a.status === "ok");
  const examplesOf = (pick: (a: ContentAnalysis) => string | undefined) =>
    own.flatMap((a) => {
      const quote = pick(a);
      return quote ? [{ contentItemId: a.contentItemId, quote }] : [];
    }).slice(0, 2);
  const sectionQuote = (type: string) => (a: ContentAnalysis) => a.sections.find((s) => s.type === type)?.quote;
  const defs: [string, string, string, (a: ContentAnalysis) => string | undefined][] = [
    ["quick-hook", "Hızlı açılış", "İlk cümlede doğrudan sorunu ya da vaadi söyler.", (a) => a.hookText],
    ["concrete-problem", "Somut sorun tarifi", "Soyut değil, günlük iş akışından bir durumu adlandırır.", sectionQuote("problem")],
    ["practical-step", "Uygulanabilir adım", "Anlattığını hemen denenebilecek bir adıma çevirir.", sectionQuote("value")],
    ["soft-cta", "Yumuşak çağrı", "Baskı yapmadan tek bir net eylemle kapatır.", sectionQuote("cta")],
    ["calm-tone", "Sakin güven tonu", "Abartısız, öğretici bir ses tonu.", (a) => a.labels.find((l) => l.key === "tone")?.evidence],
    ["topic-focus", "Tek konuya odak", "Videonun tamamı tek bir konuda kalır.", (a) => a.labels.find((l) => l.key === "topic")?.evidence],
  ];
  const traits: VoiceTrait[] = defs.map(([key, label, description, pick]) => {
    const examples = examplesOf(pick);
    // Doğrulama: alıntı kendi transcript'inde birebir geçiyor mu (metin süresi dolmuşsa doğrulanamaz).
    const verified = examples.length > 0 && examples.every((e) => textById.get(e.contentItemId)?.includes(e.quote) === true);
    return { key, label, description, verified, examples };
  });
  const ctas = [...new Set(own.flatMap((a) => a.sections.filter((s) => s.type === "cta").map((s) => s.quote)))].slice(0, 3);
  return {
    id: `vp_${account.id}`,
    workspaceId: account.workspaceId,
    accountId: account.id,
    platform: account.platform,
    language: "tr",
    summary: "Sakin, net ve uygulamaya dönük; kısa cümleler, somut komut örnekleri ve yumuşak bir çağrıyla kapanır.",
    traits,
    lexicon: { signaturePhrases: ctas, avoidPhrases: ["kesinlikle garanti", "mucize", "hemen zengin ol"] },
    stats,
    sampleSize: own.length,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: "voice-v1",
    model: "mock-llm",
    generatedAt: clock.daysAgo(2),
  };
}

export function buildWeeklyPlans(input: WeeklyPlanInput): WeeklyPlanResult {
  const { clock, workspace, ownAccounts, content, analyses, ideas } = input;
  const thisWeek = weekStartOf(toDayKey(clock.nowIso, workspace.timezone) ?? clock.nowIso.slice(0, 10)) ?? clock.nowIso.slice(0, 10);
  const previousWeek = new Date(Date.parse(`${thisWeek}T00:00:00.000Z`) - 7 * DAY_MS).toISOString().slice(0, 10);

  // Ses profili: ilk Instagram hesabı (kendi videoların analizlerinden; istatistik `views/insights` ile); tek platformlu çeşitte tek hesap.
  const account = ownAccounts.find((a) => a.platform === "instagram") ?? ownAccounts[0];
  const insights = buildInsights({ workspace, own: ownAccounts, competitors: [], items: content, now: new Date(clock.nowMs) }, { accountId: account?.id });
  const voice = account ? buildVoiceProfile(input, account, insights.rows[0]?.voice ?? { sampleSize: 0 }) : undefined;
  const traitKeys = voice ? voice.traits.filter((t) => t.verified).map((t) => t.key) : [];

  // Şimdiki hafta: 3 yeni + 1 senaryolu + 1 kayıtlı fikir plana girer (sıra 1..5); 2 kayıtlı fikir yedekte kalır.
  const currentIndexes = [0, 1, 2, 7, 3];
  const candidateIndexes = [4, 5];
  const previousIndexes = [9, 10, 11, 12];
  const itemsById = new Map(content.map((c) => [c.id, c]));
  const analysisById = new Map(analyses.map((a) => [a.contentItemId, a]));

  const link = (index: number, planId: string, weekStart: string, position?: number) => {
    const idea = ideas[index];
    if (!idea) return undefined;
    idea.weeklyPlan = { planId, weekStart, position };
    return idea;
  };

  const currentId = `wp_${thisWeek}`;
  const currentIdeas = currentIndexes.flatMap((i, k) => {
    const idea = link(i, currentId, thisWeek, k + 1);
    return idea ? [idea] : [];
  });
  const candidates = candidateIndexes.flatMap((i) => {
    const idea = link(i, currentId, thisWeek);
    return idea ? [idea] : [];
  });
  for (const idea of [...currentIdeas, ...candidates]) enrichIdea(idea, itemsById, analysisById, traitKeys);

  const sections = buildSections(input, thisWeek, currentIdeas.length);
  const slotAt = (position: number) => sections.schedule.slots.find((s) => s.position === position)?.at;
  const current: StoredWeeklyPlan = {
    id: currentId,
    workspaceId: workspace.id,
    accountId: account?.id,
    platform: account?.platform ?? "instagram",
    weekStart: thisWeek,
    status: "ready",
    summary: "Bu hafta rakiplerde tutan, kendi hesabında henüz denenmemiş yönlere yüklen: daha uzun, tek fikirli videolar ve net bir yorum çağrısı.",
    confidence: sections.focus.directions[0]?.confidence ?? "low",
    sections,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: "plan-v1",
    model: "mock-llm",
    runIds: ["run_33", "run_34"],
    generatedAt: clock.daysAgo(0.4),
    createdAt: clock.daysAgo(0.4),
    updatedAt: clock.daysAgo(0.4),
    itemRefs: [
      ...currentIdeas.map((idea, k) => ({ ideaId: idea.id, position: k + 1, slotAt: slotAt(k + 1), slotNote: sections.schedule.slots[k]?.note })),
      ...candidates.map((idea) => ({ ideaId: idea.id })),
    ],
  };

  // Geçen hafta: yayına giden fikirler; bölümler şimdikiyle aynı kaynaktan, durum arşiv.
  const previousId = `wp_${previousWeek}`;
  const previousIdeas = previousIndexes.flatMap((i, k) => {
    const idea = link(i, previousId, previousWeek, k + 1);
    return idea ? [idea] : [];
  });
  for (const idea of previousIdeas) idea.source = "weekly_plan";
  const previousSections = buildSections(input, previousWeek, previousIdeas.length);
  const previous: StoredWeeklyPlan = {
    ...current,
    id: previousId,
    weekStart: previousWeek,
    status: "archived",
    summary: "Geçen haftanın planı: dört içerik yayına alındı.",
    sections: { ...previousSections, review: { status: "awaiting_publish_data", note: "Yayın sonrası ölçüm F3'te gelecek." } },
    runIds: ["run_31", "run_32"],
    generatedAt: clock.daysAgo(7.3),
    createdAt: clock.daysAgo(7.3),
    updatedAt: clock.daysAgo(7.3),
    itemRefs: previousIdeas.map((idea, k) => ({ ideaId: idea.id, position: k + 1, slotAt: previousSections.schedule.slots[k]?.at })),
  };

  return { plans: [current, previous], voiceProfiles: voice ? [voice] : [] };
}
