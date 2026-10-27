/**
 * Kreatif Anatomisi toplu raporu (`buildAnatomy`): mock ve Supabase AYNI fonksiyonu çağırır (yalnız girdi yükleme ayrı). Saf; LLM yok,
 * saat `input.now`. Kapsam `buildInsights` ile aynı kuraldır: yalnız kısa videolar, pencere = `now`dan geriye `days` gün, kendi taraf
 * `accountId`'ye daralabilir, rakip tarafı yalnız izlenen (`tracked`), niş dışı içerik girmez. Rapora yalnız `ok` + kanıtı doğrulanmış
 * analizi olan video girer. Boyut tabloları `groupedLift` (→ `summarizeLiftSamples`) ile hesaplanır: olgunlaşmamış (<3 gün) lift özete
 * girmez, güven örnek sayısı + baz çizgisi tavanından gelir; n < 3 kohort değeri `undefined` + sebep (`recipe.ts`).
 * Hook/CTA türü ve süre kovası burada YOK: `getInsights`'tan okunur (yeniden hesaplanmaz).
 */
import { firstSectionBucket, hookLengthBucket, tempoBucket } from "@/lib/anatomy/buckets";
import { buildRecipe, MIN_RECIPE_N, type AnatomyEntry } from "@/lib/anatomy/recipe";
import { deriveVideoAnatomy } from "@/lib/anatomy/video";
import {
  ANATOMY_SCHEMA_VERSION,
  CTA_POSITIONS,
  emptyAnatomyReport,
  FIRST_SECTION_BUCKETS,
  HOOK_LENGTH_BUCKETS,
  TEMPO_BUCKETS,
  type AnatomyBodyMixRow,
  type AnatomyDimension,
  type AnatomyReport,
  type AnatomyScope,
  type AnatomySection,
  type AnatomyVideoRef,
  type VideoAnatomy,
} from "@/lib/domain/anatomy";
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER, type ContentItem } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import type { GroupedLift } from "@/lib/domain/insights";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { SECTION_TYPES } from "@/lib/domain/taxonomy";
import type { AnatomyQuery } from "@/lib/data/queries";
import { groupedLift, usableLift } from "@/lib/data/views/insights-groups";
import { insightsDays } from "@/lib/data/views/insights";
import { DAY_MS } from "@/lib/time";

export interface AnatomyInput {
  workspaceId: string;
  own: readonly OwnAccount[];
  competitors: readonly Competitor[];
  /** Kendi + rakip içerikleri (pencere dışı/başka sahip/kısa video olmayan süzülür). */
  items: readonly ContentItem[];
  /** Video analizleri; yalnız `status = ok` ve `evidenceVerified` olan sayılır. */
  analyses: readonly ContentAnalysis[];
  /** Konu eleğinin niş dışı bulduğu içerikler: rapora hiç girmez. */
  offNicheContentIds?: readonly string[];
  /** Tek saat (pencerenin sonu). */
  now: Date;
}

const ms = (iso: string | undefined) => (iso === undefined ? undefined : Date.parse(iso));

/** İçerik başına en yeni doğrulanmış `ok` analiz. */
function verifiedAnalysisById(analyses: readonly ContentAnalysis[]): Map<string, ContentAnalysis> {
  const byId = new Map<string, ContentAnalysis>();
  for (const a of analyses) {
    if (a.status !== "ok" || !a.evidenceVerified) continue;
    const current = byId.get(a.contentItemId);
    if (current === undefined || a.createdAt > current.createdAt) byId.set(a.contentItemId, a);
  }
  return byId;
}

/** Bir boyutun tablosu; boş taraf için sebep yazılır (boş tablo yerine açıklama). */
function dimension<K extends string>(grouped: GroupedLift<K>, what: string, counts: { own: number; rivals: number }): AnatomyDimension<K> {
  const ownEmpty = grouped.own.length === 0;
  const rivalEmpty = grouped.competitors.length === 0;
  let unmeasuredReason: string | undefined;
  if (ownEmpty && rivalEmpty) unmeasuredReason = `${what} ölçülebilen incelenmiş video yok.`;
  else if (ownEmpty) unmeasuredReason = `Kendi videolarında ${what} ölçülemedi (incelenmiş kendi video: ${counts.own}).`;
  else if (rivalEmpty) unmeasuredReason = `Rakip videolarında ${what} ölçülemedi (incelenmiş rakip video: ${counts.rivals}).`;
  return { grouped, unmeasuredReason };
}

/** Gövde tipleri: taksonomi sırası, taksonomide olmayanlar sona alfabetik. */
function orderedTypes(types: readonly string[]): string[] {
  const known = SECTION_TYPES.filter((t) => types.includes(t));
  const extra = types.filter((t) => !(SECTION_TYPES as readonly string[]).includes(t)).sort();
  return [...known, ...extra];
}

function videoRef(entry: AnatomyEntry, analysis: ContentAnalysis): AnatomyVideoRef {
  const { item } = entry;
  return {
    ...summarizeContent(item, analysis),
    isOwn: entry.anatomy.isOwn,
    durationSec: item.durationSec,
    liftTier: item.score.liftTier,
    publishedAt: item.publishedAt,
  };
}

/** Lift'e göre azalan (ölçülemeyen sonda), eşitlikte kimlik. */
function byLiftDesc(a: AnatomyVideoRef, b: AnatomyVideoRef): number {
  return (b.currentLift ?? Number.NEGATIVE_INFINITY) - (a.currentLift ?? Number.NEGATIVE_INFINITY) || (a.contentItemId < b.contentItemId ? -1 : 1);
}

export function buildAnatomy(input: AnatomyInput, query: AnatomyQuery = {}): AnatomyReport {
  const days = insightsDays(query.days);
  const untilMs = input.now.getTime();
  const sinceMs = untilMs - days * DAY_MS;
  const generatedAt = input.now.toISOString();
  const ownScope = input.own.filter((a) => query.accountId === undefined || a.id === query.accountId);
  const scope: AnatomyScope = {
    workspaceId: input.workspaceId,
    accountId: query.accountId,
    ownHandles: ownScope.map((a) => a.handle),
    days,
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    winnerMinLift: LIFT_TIER_MIN[OUTLIER_MIN_TIER],
  };

  const ownIds = new Set(ownScope.map((a) => a.id));
  const trackedIds = new Set(input.competitors.filter((c) => c.status === "tracked").map((c) => c.id));
  const offNiche = new Set(input.offNicheContentIds ?? []);
  const analyses = verifiedAnalysisById(input.analyses);

  const entries: AnatomyEntry[] = [];
  const analysisOf = new Map<string, ContentAnalysis>();
  for (const item of input.items) {
    const at = ms(item.publishedAt);
    if (item.format !== "short_video" || at === undefined || at < sinceMs || at > untilMs || offNiche.has(item.id)) continue;
    const inScope = item.owner.kind === "own" ? ownIds.has(item.owner.id) : trackedIds.has(item.owner.id);
    const analysis = analyses.get(item.id);
    if (!inScope || analysis === undefined) continue;
    const anatomy = deriveVideoAnatomy({ item, analysis });
    if (anatomy === undefined) continue;
    entries.push({ item, anatomy });
    analysisOf.set(item.id, analysis);
  }
  if (entries.length === 0) {
    return emptyAnatomyReport(scope, generatedAt, "Kapsamda analizli (kanıtı doğrulanmış) video yok.");
  }

  const byId = new Map(entries.map((e) => [e.item.id, e.anatomy]));
  const own = entries.filter((e) => e.anatomy.isOwn).map((e) => e.item);
  const rivals = entries.filter((e) => !e.anatomy.isOwn).map((e) => e.item);
  const counts = { own: own.length, rivals: rivals.length };
  const groups = <K extends string>(keyOf: (a: VideoAnatomy) => K | undefined, order: readonly K[]) =>
    groupedLift<K>(own, rivals, (c) => {
      const a = byId.get(c.id);
      return a === undefined ? undefined : keyOf(a);
    }, order);

  const hookLength = dimension(groups((a) => hookLengthBucket(a.hookWords), HOOK_LENGTH_BUCKETS), "Açılış cümlesi uzunluğu", counts);
  const firstSection = dimension(groups((a) => firstSectionBucket(a.firstSectionAtSec), FIRST_SECTION_BUCKETS), "İlk bölüme geçiş", counts);
  const ctaPosition = dimension(groups((a) => a.ctaPosition, CTA_POSITIONS), "Çağrının yeri", counts);
  const tempo = dimension(groups((a) => tempoBucket(a.editMetrics?.cutsPerMinute), TEMPO_BUCKETS), "Tempo (kesme/dk)", counts);

  // Gövde türü karışımı: yalnız bölümleri bilinen videolar; her tür için "videoda var / yok".
  const withPhases = entries.filter((e) => e.anatomy.phases.length > 0);
  const ownWithPhases = withPhases.filter((e) => e.anatomy.isOwn).map((e) => e.item);
  const rivalWithPhases = withPhases.filter((e) => !e.anatomy.isOwn).map((e) => e.item);
  const bodyMix: AnatomyBodyMixRow[] = orderedTypes([...new Set(withPhases.flatMap((e) => e.anatomy.bodyTypes))]).map((type) => ({
    type,
    presence: groupedLift<"with" | "without">(ownWithPhases, rivalWithPhases, (c) => (byId.get(c.id)?.bodyTypes.includes(type) ? "with" : "without"), ["with", "without"]),
  }));

  const videos = entries.map((e) => videoRef(e, analysisOf.get(e.item.id) as ContentAnalysis)).sort(byLiftDesc);
  const recipe = buildRecipe(entries, scope);

  const unmeasured: { section: AnatomySection; reason: string }[] = [];
  const note = (section: AnatomySection, reason: string | undefined) => reason !== undefined && unmeasured.push({ section, reason });
  const bothEmpty = (d: AnatomyDimension) => d.grouped.own.length === 0 && d.grouped.competitors.length === 0;
  if (bothEmpty(hookLength)) note("hook_length", hookLength.unmeasuredReason);
  if (bothEmpty(firstSection)) note("first_section", firstSection.unmeasuredReason);
  if (bothEmpty(ctaPosition)) note("cta_position", ctaPosition.unmeasuredReason);
  if (bothEmpty(tempo)) note("tempo", tempo.unmeasuredReason);
  if (bodyMix.length === 0) note("body_mix", "Bölümleri bilinen analizli video yok; gövde türü karışımı ölçülemedi.");
  if (recipe.differences.every((d) => d.text === undefined)) {
    const sizeOf = (key: string) => recipe.cohorts.find((c) => c.key === key)?.videoCount ?? 0;
    note("recipe", `Kendi ↔ tutan kıyası için her grupta en az ${MIN_RECIPE_N} ölçülmüş video gerekir (kendi: ${sizeOf("own")}, tutan: ${sizeOf("winners")}).`);
  }

  return {
    schemaVersion: ANATOMY_SCHEMA_VERSION,
    generatedAt,
    scope,
    counts: {
      analyzed: entries.length,
      own: own.length,
      rivals: rivals.length,
      winners: entries.filter((e) => {
        const lift = usableLift(e.item);
        return lift !== undefined && lift >= scope.winnerMinLift;
      }).length,
    },
    videos,
    hookLength,
    firstSection,
    bodyMix,
    ctaPosition,
    tempo,
    recipe,
    unmeasured,
  };
}
