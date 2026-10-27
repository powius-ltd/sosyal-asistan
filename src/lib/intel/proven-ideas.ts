/**
 * Kanıtlanmış fikir kartları (`buildProvenIdeas`): saf, LLM yok. Fikir = hücre (konu kümesi × hook türü; kümeleme hiç koşmamışsa süre kovası ×
 * hook türü). Hücrede lift ≥ 3x videolar ≥ 2 FARKLI hesapta (ya da ≥ 2 platformda) varsa `proven`; yalnız tek hesapta lift ≥ 5x video varsa
 * `single`; gerisi kart değildir. Hesap = `owner.id` (kendi ve rakip ayrı hesaptır). Kanıta yalnız ölçülmüş, olgun lift girer (`usableLift`;
 * ölçülemeyen video sayılmaz, 0 sayılmaz); niş dışı içerik, kanıtı doğrulanmamış / hook türsüz analiz ve kısa video olmayan içerik girmez.
 * Anatomi özeti kanıt videolarının baskın kovalarıdır (`anatomy/buckets.ts`); güven `summarizeLiftSamples` (tek kural).
 */
import { firstSectionBucket, hookLengthBucket, tempoBucket } from "@/lib/anatomy/buckets";
import { deriveVideoAnatomy } from "@/lib/anatomy/video";
import type { VideoAnatomy } from "@/lib/domain/anatomy";
import type { ContentItem } from "@/lib/domain/content";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { usableLift } from "@/lib/data/views/insights-groups";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";
import { median } from "@/lib/metrics/stats";
import { CONFIDENCE_RANK } from "@/lib/domain/creative-matrix";
import {
  DURATION_BUCKET_LABEL,
  PROVEN_MIN_ACCOUNTS,
  PROVEN_MIN_LIFT,
  SINGLE_MIN_LIFT,
  type DurationBucket,
  type ModalBucket,
  type ProvenAnatomy,
  type ProvenBasis,
  type ProvenEvidence,
  type ProvenIdea,
} from "@/lib/intel/proven-ideas-types";

/** Bir içeriğin güncel konu kümesi (`content_topic_clusters` satırı). */
export interface ProvenClusterRow {
  contentItemId: string;
  clusterKey: string;
  clusterLabel: string;
  clusteredAt: string;
}

export interface ProvenIdeasInput {
  items: readonly ContentItem[];
  analyses: readonly ContentAnalysis[];
  clusters: readonly ProvenClusterRow[];
  /** Konu eleğinin niş dışı bulduğu içerikler: hiç girmez. */
  offNicheContentIds?: readonly string[];
}

export function durationBucketOf(sec: number | undefined): DurationBucket | undefined {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return undefined;
  if (sec < 15) return "under_15";
  if (sec < 30) return "15_30";
  if (sec < 60) return "30_60";
  return "over_60";
}

interface Member {
  item: ContentItem;
  hookType: string;
  anatomy: VideoAnatomy | undefined;
}

/** İçerik başına en yeni küme (eşitlikte küçük anahtar). */
function newestClusters(rows: readonly ProvenClusterRow[]): Map<string, ProvenClusterRow> {
  const map = new Map<string, ProvenClusterRow>();
  for (const row of rows) {
    const cur = map.get(row.contentItemId);
    if (cur === undefined || row.clusteredAt > cur.clusteredAt || (row.clusteredAt === cur.clusteredAt && row.clusterKey < cur.clusterKey)) map.set(row.contentItemId, row);
  }
  return map;
}

function modal<K extends string>(values: readonly (K | undefined)[]): ModalBucket<K> {
  const counts = new Map<K, number>();
  for (const v of values) if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  const measured = [...counts.values()].reduce((a, b) => a + b, 0);
  let best: K | undefined;
  for (const [k, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0) || (n === counts.get(best) && k < best)) best = k;
  return { bucket: best, count: best === undefined ? 0 : (counts.get(best) ?? 0), measured };
}

function anatomyOf(members: readonly Member[]): ProvenAnatomy {
  const anatomies = members.flatMap((m) => (m.anatomy === undefined ? [] : [m.anatomy]));
  const bodyCounts = new Map<string, number>();
  for (const a of anatomies) for (const type of a.bodyTypes) bodyCounts.set(type, (bodyCounts.get(type) ?? 0) + 1);
  const durations = members.flatMap((m) => (m.item.durationSec === undefined ? [] : [m.item.durationSec]));
  return {
    hookLength: modal(anatomies.map((a) => hookLengthBucket(a.hookWords))),
    firstSection: modal(anatomies.map((a) => firstSectionBucket(a.firstSectionAtSec))),
    tempo: modal(anatomies.map((a) => tempoBucket(a.editMetrics?.cutsPerMinute))),
    ctaPosition: modal(anatomies.map((a) => a.ctaPosition)),
    medianDurationSec: median(durations),
    bodyTypes: [...bodyCounts].map(([type, videos]) => ({ type, videos })).sort((a, b) => b.videos - a.videos || a.type.localeCompare(b.type)),
  };
}

const evidenceOf = (m: Member, lift: number): ProvenEvidence => ({
  contentItemId: m.item.id,
  accountId: m.item.owner.id,
  handle: m.item.owner.handle,
  isOwn: m.item.owner.kind === "own",
  platform: m.item.platform,
  lift,
  url: m.item.url,
});

export function buildProvenIdeas(input: ProvenIdeasInput): ProvenIdea[] {
  const off = new Set(input.offNicheContentIds ?? []);
  const analysisById = new Map<string, ContentAnalysis>();
  for (const a of input.analyses) if (a.status === "ok" && a.evidenceVerified && a.hookType !== undefined && HOOK_TYPES.includes(a.hookType)) analysisById.set(a.contentItemId, a);
  const clusterById = newestClusters(input.clusters);
  // Kümeleme hiç koşmadıysa (bu içeriklerin hiçbirine küme yok) yedek hücre: süre kovası.
  const eligible = input.items.filter((i) => i.format === "short_video" && !off.has(i.id) && analysisById.has(i.id));
  const basis: ProvenBasis = eligible.some((i) => clusterById.has(i.id)) ? "topic" : "duration";

  const labelOf = new Map<string, string>();
  const labelAt = new Map<string, string>();
  const cells = new Map<string, { key: string; hookType: string; members: Member[] }>();
  for (const item of eligible) {
    const analysis = analysisById.get(item.id)!;
    let key: string | undefined;
    if (basis === "topic") {
      const cluster = clusterById.get(item.id);
      if (cluster !== undefined) {
        key = cluster.clusterKey;
        const prevAt = labelAt.get(key);
        if (prevAt === undefined || cluster.clusteredAt > prevAt) {
          labelOf.set(key, cluster.clusterLabel);
          labelAt.set(key, cluster.clusteredAt);
        }
      }
    } else {
      key = durationBucketOf(item.durationSec);
      if (key !== undefined) labelOf.set(key, DURATION_BUCKET_LABEL[key as DurationBucket]);
    }
    if (key === undefined) continue;
    const hookType = analysis.hookType!;
    const cellId = `${key}\u0000${hookType}`;
    const cell = cells.get(cellId) ?? { key, hookType, members: [] };
    cell.members.push({ item, hookType, anatomy: deriveVideoAnatomy({ item, analysis }) });
    cells.set(cellId, cell);
  }

  const ideas: ProvenIdea[] = [];
  for (const cell of cells.values()) {
    const strong = cell.members.flatMap((m) => {
      const lift = usableLift(m.item);
      return lift !== undefined && Number.isFinite(lift) && lift >= PROVEN_MIN_LIFT ? [{ m, lift }] : [];
    });
    if (strong.length === 0) continue;
    const accounts = new Set(strong.map(({ m }) => m.item.owner.id));
    const platforms = new Set(strong.map(({ m }) => m.item.platform));
    let kind: ProvenIdea["kind"] | undefined;
    if (accounts.size >= PROVEN_MIN_ACCOUNTS || platforms.size >= 2) kind = "proven";
    else if (strong.some(({ lift }) => lift >= SINGLE_MIN_LIFT)) kind = "single";
    if (kind === undefined) continue;
    strong.sort((a, b) => b.lift - a.lift || a.m.item.id.localeCompare(b.m.item.id));
    const summary = summarizeLiftSamples(strong.map(({ m, lift }) => ({ lift, lowBaseline: m.item.score.lowConfidence })));
    ideas.push({
      id: `${basis}:${cell.key}:${cell.hookType}`,
      kind,
      basis,
      cellKey: cell.key,
      cellLabel: labelOf.get(cell.key) ?? cell.key,
      hookType: cell.hookType,
      evidence: strong.map(({ m, lift }) => evidenceOf(m, lift)),
      accountCount: accounts.size,
      platformCount: platforms.size,
      medianLift: median(strong.map((s) => s.lift)) ?? 0,
      confidence: summary.confidence,
      anatomy: anatomyOf(strong.map((s) => s.m)),
      ownTried: cell.members.some((m) => m.item.owner.kind === "own"),
    });
  }
  return ideas.sort(
    (a, b) =>
      Number(b.kind === "proven") - Number(a.kind === "proven") ||
      b.accountCount - a.accountCount ||
      b.medianLift - a.medianLift ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      a.id.localeCompare(b.id),
  );
}
