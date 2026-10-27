/**
 * Konu × hook türü matrisi (`buildTopicHookMatrix`): mock ve Supabase AYNI fonksiyonu çağırır (yalnız girdi yükleme ayrı). Saf; LLM yok, saat
 * `input.now`. Küme (`content_topic_clusters`) LLM işidir, hook türü analizde zaten var; buradaki her şey koddur: hücre sayıları, lift, güven,
 * durum, tutanlar, fırsatlar. Kapsam açı matrisiyle aynı: yalnız kısa videolar, pencere = `now`dan geriye `days` gün, rakip tarafı yalnız izlenen
 * (`tracked`), niş dışı içerik girmez.
 *
 * Kurallar:
 *  - Hook türü YALNIZ `ok` + kanıtı doğrulanmış analizden gelir ve taksonomide (`HOOK_TYPES`) olmalıdır; aksi video matrise giremez (sayıya da girmez).
 *  - Kümesi olmayan video (`content_topic_clusters`'ta satır yok) hücreye girmez, `unclusteredCount`'a sayılır; rastgele küme yok.
 *  - Satırlar en çok `TOPIC_ROWS_MAX`; kalan kümeler "Diğer konular" (`topic-hook-rows.ts`). Sütunlar yalnız verisi olan hook türleri.
 *  - Rakip yoksa rakip taraf boş kalır; durum kendi verisinden (`topicCellStatusOf`), `opportunities` boş, `winners` "kendi tutanların".
 *  - "Diğer konular" satırı birden çok kümenin toplamıdır: `opportunities`/`winners` listelerine girmez (konu olarak aksiyona çevrilemez).
 *  - Kümesiz workspace (plan/kümeleme koşmadı) çökmez: satırsız matris + `unmeasuredReason`.
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import type { CreativeMatrixScope } from "@/lib/domain/creative-matrix";
import { HOOK_TYPES, type HookType } from "@/lib/domain/hook-types";
import {
  TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
  compareTopicOpportunities,
  compareTopicWinners,
  emptyTopicHookMatrix,
  type TopicHookMatrix,
  type TopicHookRow,
} from "@/lib/domain/topic-hook-matrix";
import type { TopicHookMatrixQuery } from "@/lib/data/queries";
import { insightsDays } from "@/lib/data/views/insights";
import type { AnalysisRef } from "@/lib/insights/types";
import { buildRowTotals, buildTopicCell, type TopicMembers } from "@/lib/matrix/topic-hook-cell";
import { clusterLabels, selectRows, usedHookTypes, type TopicClusterAssignment, type TopicGroups } from "@/lib/matrix/topic-hook-rows";
import { DAY_MS } from "@/lib/time";

export type { TopicClusterAssignment } from "@/lib/matrix/topic-hook-rows";

export interface TopicHookInput {
  workspaceId: string;
  /** Kendi hesaplar (yalnız kimlik gerekir). */
  own: readonly Pick<OwnAccount, "id">[];
  /** Rakipler; yalnız `tracked` olanın videoları sayılır. */
  competitors: readonly Pick<Competitor, "id" | "status">[];
  /** Kendi + rakip içerikleri (pencere dışı/başka sahip/kısa video olmayan süzülür). */
  items: readonly ContentItem[];
  /** Video analizleri (kimlik, durum, kanıt doğrulaması, hook türü); yalnız `ok` + `evidenceVerified` + bilinen hook türü olan sayılır. */
  analyses: readonly AnalysisRef[];
  /** İçerik başına güncel konu kümesi (`content_topic_clusters`); satırı olmayan içerik kümesizdir. */
  clusters: readonly TopicClusterAssignment[];
  /** Konu eleğinin niş dışı bulduğu içerikler: matrise hiç girmez. */
  offNicheContentIds?: readonly string[];
  /** Tek saat (pencerenin sonu). */
  now: Date;
}

const ms = (iso: string | undefined) => (iso === undefined ? undefined : Date.parse(iso));

/** İçerik başına `ok` + doğrulanmış + taksonomide hook türü olan analiz (hook türsüz analiz matrise giremez). */
function usableAnalysisById(analyses: readonly AnalysisRef[]): Map<string, AnalysisRef & { hookType: HookType }> {
  const byId = new Map<string, AnalysisRef & { hookType: HookType }>();
  for (const a of analyses) {
    if (a.status === "ok" && a.evidenceVerified && a.hookType !== undefined && HOOK_TYPES.includes(a.hookType)) byId.set(a.contentItemId, { ...a, hookType: a.hookType });
  }
  return byId;
}

/** İçerik başına güncel küme (DB'de içerik başına tek satır; yinelenen girdide en yeni `clusteredAt`, eşitlikte küçük anahtar kazanır). */
function clusterKeyById(assignments: readonly TopicClusterAssignment[]): Map<string, string> {
  const newest = new Map<string, TopicClusterAssignment>();
  for (const a of assignments) {
    const current = newest.get(a.contentItemId);
    if (current === undefined || a.clusteredAt > current.clusteredAt || (a.clusteredAt === current.clusteredAt && a.clusterKey < current.clusterKey)) {
      newest.set(a.contentItemId, a);
    }
  }
  return new Map([...newest].map(([id, a]) => [id, a.clusterKey]));
}

/** Kümesiz matrisin sebebi: analiz yok / kümeleme hiç koşmadı / kümeler var ama bu kapsamdaki videolara değmiyor. */
function unmeasuredReasonOf(eligible: number, anyAssignment: boolean): string {
  if (eligible === 0) return "Kapsamda analizli (kanıtı doğrulanmış) video yok; matris için önce videolar analiz edilmeli.";
  if (!anyAssignment) return "Konu kümesi yok: plan ya da kümeleme koşmadı.";
  return `Kapsamdaki ${eligible} analizli videonun hiçbiri bir konu kümesine girmedi.`;
}

export function buildTopicHookMatrix(input: TopicHookInput, query: TopicHookMatrixQuery = {}): TopicHookMatrix {
  const days = insightsDays(query.days);
  const untilMs = input.now.getTime();
  const sinceMs = untilMs - days * DAY_MS;
  const generatedAt = input.now.toISOString();
  const scope: CreativeMatrixScope = {
    workspaceId: input.workspaceId,
    days,
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
  };

  const ownIds = new Set(input.own.map((a) => a.id));
  const trackedIds = new Set(input.competitors.filter((c) => c.status === "tracked").map((c) => c.id));
  const offNiche = new Set(input.offNicheContentIds ?? []);
  const analyses = usableAnalysisById(input.analyses);
  const clusterOf = clusterKeyById(input.clusters);

  const groups: TopicGroups = new Map();
  let eligible = 0;
  let clustered = 0;
  for (const item of input.items) {
    const at = ms(item.publishedAt);
    if (item.format !== "short_video" || at === undefined || at < sinceMs || at > untilMs || offNiche.has(item.id)) continue;
    const isOwn = item.owner.kind === "own";
    const analysis = analyses.get(item.id);
    if (analysis === undefined || !(isOwn ? ownIds.has(item.owner.id) : trackedIds.has(item.owner.id))) continue;
    eligible += 1;
    const clusterKey = clusterOf.get(item.id);
    if (clusterKey === undefined) continue;
    clustered += 1;
    const byHook = groups.get(clusterKey) ?? new Map<HookType, TopicMembers>();
    const members = byHook.get(analysis.hookType) ?? { own: [], rivals: [] };
    (isOwn ? members.own : members.rivals).push(item);
    byHook.set(analysis.hookType, members);
    groups.set(clusterKey, byHook);
  }

  if (clustered === 0) {
    // Sütun yok: hiç veri olmayan matriste boş hook türü listesi göstermek kalabalıktır (`emptyTopicHookMatrix` tüm sözlüğü koyar).
    return { ...emptyTopicHookMatrix(scope, generatedAt, eligible, unmeasuredReasonOf(eligible, input.clusters.length > 0)), hookTypes: [] };
  }

  const selected = selectRows(groups, clusterLabels(input.clusters));
  const hookTypes = usedHookTypes(selected);
  const analysisOf = (id: string) => analyses.get(id);
  const rows: TopicHookRow[] = selected.map((row) => ({
    key: row.key,
    label: row.label,
    ...buildRowTotals([...row.byHook.values()]),
    cells: hookTypes.map((hookType) => buildTopicCell(row.key, hookType, row.byHook.get(hookType), analysisOf)),
  }));

  // "Diğer konular" birden çok kümenin toplamıdır: konu olarak aksiyona çevrilemez, listelere girmez.
  const topicCells = rows.filter((_, i) => !selected[i]?.isOther).flatMap((row) => row.cells);
  return {
    schemaVersion: TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
    generatedAt,
    scope,
    hookTypes,
    rows,
    clusteredCount: clustered,
    unclusteredCount: eligible - clustered,
    opportunities: topicCells.filter((c) => c.status === "proven_opportunity").sort(compareTopicOpportunities),
    winners: topicCells.filter((c) => c.status === "worked").sort(compareTopicWinners),
  };
}
