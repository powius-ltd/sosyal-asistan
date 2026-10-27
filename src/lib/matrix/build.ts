/**
 * Kreatif Matris (`buildCreativeMatrix`): mock ve Supabase AYNI fonksiyonu çağırır (yalnız girdi yükleme ayrı). Saf; LLM yok, saat
 * `input.now`. Etiket (açı × katman) LLM işidir (`label:angles`), buradaki her şey koddur: hücre sayıları, lift, güven, hook türleri, durum,
 * fırsat sırası. Kapsam `buildAnatomy` ile aynı: yalnız kısa videolar, pencere = `now`dan geriye `days` gün, rakip tarafı yalnız izlenen
 * (`tracked`), niş dışı içerik girmez, yalnız `ok` + kanıtı doğrulanmış analizi olan video etiketlenebilir sayılır.
 *
 * Etiket kuralları: yalnız `evidenceVerified = true` etiket hücre doldurur (kanıtsız etiketten hücre dolmaz); etiketi olmayan ya da
 * doğrulanmamış etiketli video hücreye girmez, `unlabeledCount`'a sayılır (rastgele hücre yok). Her zaman 20 hücre döner (boş hücre dahil).
 */
import { adCellKey, buildAdCellStats } from "@/lib/matrix/ad-cells";
import { buildCell, type CellMembers } from "@/lib/matrix/cell";
import { emptyAdCellStat, type AdMatrixSource } from "@/lib/domain/ads";
import {
  CREATIVE_ANGLE_IDS,
  CREATIVE_MATRIX_SCHEMA_VERSION,
  FUNNEL_STAGE_IDS,
  compareOpportunities,
  emptyCreativeMatrix,
  type ContentCreativeLabel,
  type CreativeMatrix,
  type CreativeMatrixScope,
} from "@/lib/domain/creative-matrix";
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import type { CreativeMatrixQuery } from "@/lib/data/queries";
import { insightsDays } from "@/lib/data/views/insights";
import type { AnalysisRef } from "@/lib/insights/types";
import { DAY_MS } from "@/lib/time";

export interface CreativeMatrixInput {
  workspaceId: string;
  /** Kendi hesaplar (yalnız kimlik gerekir). */
  own: readonly Pick<OwnAccount, "id">[];
  /** Rakipler; yalnız `tracked` olanın videoları sayılır. */
  competitors: readonly Pick<Competitor, "id" | "status">[];
  /** Kendi + rakip içerikleri (pencere dışı/başka sahip/kısa video olmayan süzülür). */
  items: readonly ContentItem[];
  /** Video analizleri (kimlik, durum, kanıt doğrulaması, hook türü); yalnız `ok` + `evidenceVerified` olan sayılır. */
  analyses: readonly AnalysisRef[];
  /** İçerik etiketleri; yalnız `evidenceVerified` olan hücre doldurur. */
  labels: readonly ContentCreativeLabel[];
  /** Konu eleğinin niş dışı bulduğu içerikler: matrise hiç girmez. */
  offNicheContentIds?: readonly string[];
  /** Reklam kreatifleri; reklam hesabı yoksa verilmez (hücrelerde `ads` alanı çıkmaz). Hücre durumunu etkilemez. */
  ads?: AdMatrixSource;
  /** Tek saat (pencerenin sonu). */
  now: Date;
}

const ms = (iso: string | undefined) => (iso === undefined ? undefined : Date.parse(iso));
const cellKey = (stage: string, angle: string) => `${stage}|${angle}`;

/** İçerik başına `ok` + doğrulanmış analiz. */
function verifiedAnalysisById(analyses: readonly AnalysisRef[]): Map<string, AnalysisRef> {
  const byId = new Map<string, AnalysisRef>();
  for (const a of analyses) if (a.status === "ok" && a.evidenceVerified) byId.set(a.contentItemId, a);
  return byId;
}

/** İçerik başına en yeni DOĞRULANMIŞ etiket (DB'de içerik başına tek satır; yine de yinelenen girdide en yenisi kazanır). */
function verifiedLabelById(labels: readonly ContentCreativeLabel[]): Map<string, ContentCreativeLabel> {
  const byId = new Map<string, ContentCreativeLabel>();
  for (const label of labels) {
    if (!label.evidenceVerified) continue;
    const current = byId.get(label.contentItemId);
    if (current === undefined || label.labeledAt > current.labeledAt) byId.set(label.contentItemId, label);
  }
  return byId;
}

export function buildCreativeMatrix(input: CreativeMatrixInput, query: CreativeMatrixQuery = {}): CreativeMatrix {
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
  const analyses = verifiedAnalysisById(input.analyses);
  const labels = verifiedLabelById(input.labels);

  const members = new Map<string, CellMembers>();
  let eligible = 0;
  let labeled = 0;
  for (const item of input.items) {
    const at = ms(item.publishedAt);
    if (item.format !== "short_video" || at === undefined || at < sinceMs || at > untilMs || offNiche.has(item.id)) continue;
    const isOwn = item.owner.kind === "own";
    if (!(isOwn ? ownIds.has(item.owner.id) : trackedIds.has(item.owner.id)) || !analyses.has(item.id)) continue;
    eligible += 1;
    const label = labels.get(item.id);
    if (label === undefined) continue;
    labeled += 1;
    const key = cellKey(label.funnelStage, label.angle);
    const cell = members.get(key) ?? { own: [], rivals: [] };
    (isOwn ? cell.own : cell.rivals).push(item);
    members.set(key, cell);
  }

  if (labeled === 0) {
    const reason =
      eligible === 0
        ? "Kapsamda analizli (kanıtı doğrulanmış) video yok; matris için önce videolar analiz edilmeli."
        : `Kapsamdaki ${eligible} analizli videonun hiçbiri etiketlenmedi (ya da kanıtı doğrulanamadı).`;
    const empty = emptyCreativeMatrix(scope, generatedAt, eligible, reason);
    if (input.ads === undefined) return empty;
    return { ...empty, cells: empty.cells.map((cell) => ({ ...cell, ads: emptyAdCellStat() })), unlabeledAdCount: input.ads.creatives.length + input.ads.unlabeledAdCount };
  }

  const adStats =
    input.ads === undefined
      ? undefined
      : buildAdCellStats(input.ads, (id) => {
          const label = labels.get(id);
          return label === undefined ? undefined : { stage: label.funnelStage, angle: label.angle, hookType: analyses.get(id)?.hookType };
        });

  const cells = FUNNEL_STAGE_IDS.flatMap((stage) =>
    CREATIVE_ANGLE_IDS.map((angle) => {
      const cell = buildCell(angle, stage, members.get(cellKey(stage, angle)), (id) => analyses.get(id));
      return adStats === undefined ? cell : { ...cell, ads: adStats.cells.get(adCellKey(stage, angle)) ?? emptyAdCellStat() };
    }),
  );
  return {
    schemaVersion: CREATIVE_MATRIX_SCHEMA_VERSION,
    generatedAt,
    scope,
    cells,
    labeledCount: labeled,
    unlabeledCount: eligible - labeled,
    opportunities: cells.filter((c) => c.status === "proven_opportunity").sort(compareOpportunities),
    ...(adStats === undefined || input.ads === undefined ? {} : { unlabeledAdCount: adStats.unlabeled + input.ads.unlabeledAdCount }),
  };
}
