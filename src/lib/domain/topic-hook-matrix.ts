/**
 * Konu × hook türü matrisi (`getTopicHookMatrix`; `creator` ve `mixed` hesapların kreatif çerçevesi, bkz. `account-type.ts`): SATIR = konu
 * kümesi (`content_topic_clusters`: `cluster_key` + `cluster_label`; LLM kümeler, tek kayıt), SÜTUN = hook türü (`HOOK_TYPES`; yalnız
 * `ok` + kanıtı doğrulanmış analizden). Hücre: o konuda o hook türüyle yapılmış kendi / rakip videolar, medyan lift, güven, tutan sayısı,
 * örnekler ve DURUM. Her sayı düz koddur (LLM yok); ölçülemeyen değer `undefined`'dır (0 değil), BOŞ hücre ≠ lift 0.
 *
 * Açı × farkındalık matrisinden (`creative-matrix.ts`) farkı: etiket LLM'den gelmez (hook türü analizde zaten var; küme kalıcıdır), RAKİP
 * OLMAYABİLİR. Rakip yoksa hücre durumu kendi verisinden türer (`topicCellStatusOf`: tutan / denendi / zayıf / boş) ve `winners` listesi
 * kendi tutanlarını sıralar; rakip varsa `cellStatusOf` (kanıtlı fırsat / zayıf / ölçülemedi / boş) AYNEN yeniden kullanılır.
 * `TopicHookMatrix` UI'dan BAĞIMSIZ, serileştirilebilir düz veridir (Date/Map/fonksiyon yok); taraf özeti `CreativeCellStat`, örnek
 * `CreativeMatrixSample` (`ContentSummary` + `isOwn`), eşikler (`EFFECT_LIFT_MIN`, `CELL_SAMPLES_MAX`) açı matrisiyle ORTAKTIR.
 */
import {
  CELL_SAMPLES_MAX,
  CONFIDENCE_RANK,
  EFFECT_LIFT_MIN,
  cellStatusOf,
  emptyCellStat,
  type CellStatus,
  type CreativeCellStat,
  type CreativeMatrixSample,
  type CreativeMatrixScope,
} from "@/lib/domain/creative-matrix";
import { HOOK_TYPES, type HookType } from "@/lib/domain/hook-types";

export const TOPIC_HOOK_MATRIX_SCHEMA_VERSION = 1;

/** Konu kümesi anahtarı: taksonomi anahtar biçimi (`content_topic_clusters.cluster_key` check'i ile aynı, ≤ 40). */
export const CLUSTER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
/** Küme etiketi sınırı (karakter): `content_topic_clusters.cluster_label` check'i. */
export const CLUSTER_LABEL_MAX_CHARS = 80;

/** Hücrenin örnek sayısı sınırı: açı matrisiyle ortak (`CELL_SAMPLES_MAX`). */
export const TOPIC_CELL_SAMPLES_MAX = CELL_SAMPLES_MAX;

// ----------------------------------------------------------------- Hücre durumu

/**
 * Hücre durumu (kodla türetilir, `topicCellStatusOf`): kendi hesap hücreyi denediyse `worked` (tutan: medyan lift > 1), `weak` (denendi, tutmadı)
 * ya da `tried` (denendi, lift ölçülemedi); denemediyse açı matrisindeki kural: `proven_opportunity` (rakipte tuttu), `weak` (rakipte de tutmadı),
 * `unmeasured` (rakip video var, lift ölçülemedi), `empty` (kimse denemedi / rakip yoksa hücre boş).
 */
export const TOPIC_CELL_STATUS = ["proven_opportunity", "worked", "tried", "weak", "unmeasured", "empty"] as const;
export type TopicCellStatus = (typeof TOPIC_CELL_STATUS)[number];

export const TOPIC_CELL_STATUS_LABEL: Record<TopicCellStatus, string> = {
  proven_opportunity: "Kanıtlı fırsat",
  worked: "Tutan",
  tried: "Denendi",
  weak: "Zayıf",
  unmeasured: "Ölçülemedi",
  empty: "Boş (kimse denemedi)",
};

/**
 * Durum kuralı (ilk eşleşen kazanır):
 *  1. kendi hesap denedi (`own.n > 0`): medyan lift yok → `tried` · medyan lift > `EFFECT_LIFT_MIN` → `worked` · aksi `weak`
 *  2. denemedi → `cellStatusOf` (açı matrisiyle AYNI kural: rakip yok → `empty`, lift ölçülemedi → `unmeasured`, > 1 → `proven_opportunity`, aksi `weak`)
 * Güven (örnek sayısı) durumu DEĞİŞTİRMEZ, hücrede ayrıca durur (`own.confidence`, `rivals.confidence`): tek videolu "tutan" düşük güvenle işaretlenir.
 */
export function topicCellStatusOf(sides: { own: Pick<CreativeCellStat, "n" | "medianLift">; rivals: Pick<CreativeCellStat, "n" | "medianLift"> }): TopicCellStatus {
  if (sides.own.n > 0) {
    if (sides.own.medianLift === undefined) return "tried";
    return sides.own.medianLift > EFFECT_LIFT_MIN ? "worked" : "weak";
  }
  const status: CellStatus = cellStatusOf(sides);
  // Kendi denemediği için `tried` dönmez; tür darlığı için açıkça süz.
  return status === "tried" ? "empty" : status;
}

// ----------------------------------------------------------------------- Hücre

export interface TopicHookCell {
  /** Satırın küme anahtarı (`TopicHookRow.key`). */
  clusterKey: string;
  /** Sütun: hook türü (`TopicHookMatrix.hookTypes`'tan). */
  hookType: HookType;
  /** Kendi hesap(lar)ın bu hücredeki videoları: `n` = hücredeki video, `liftN` = lift'i ölçülenler. */
  own: CreativeCellStat;
  /** İzlenen rakiplerin bu hücredeki videoları (kendi ile AYRI tutulur). Rakip yoksa hep boş taraf. */
  rivals: CreativeCellStat;
  /** Kendi hesap bu hücreyi denedi mi (`own.n > 0`). */
  ownTried: boolean;
  /** `topicCellStatusOf({ own, rivals })`. */
  status: TopicCellStatus;
  /** Örnek videolar: lift'e göre azalan (ölçülemeyen sonda), eşitlikte içerik kimliği; en çok `TOPIC_CELL_SAMPLES_MAX`. Video yoksa []. */
  samples: CreativeMatrixSample[];
}

/** Boş hücre: video yok, durum `empty`. */
export function emptyTopicHookCell(clusterKey: string, hookType: HookType): TopicHookCell {
  const own = emptyCellStat();
  const rivals = emptyCellStat();
  return { clusterKey, hookType, own, rivals, ownTried: false, status: topicCellStatusOf({ own, rivals }), samples: [] };
}

// ----------------------------------------------------------------------- Satır

export interface TopicHookRow {
  /** Küme anahtarı (`content_topic_clusters.cluster_key`). */
  key: string;
  /** Kısa Türkçe ad (kümenin en yeni satırındaki etiket). */
  label: string;
  /** Satırın TOPLAMI: kümedeki tüm hook türlerinin kendi videoları (`n` = satırdaki kendi video sayısı). */
  own: CreativeCellStat;
  /** Satırın toplamı: kümedeki izlenen rakip videoları. */
  rivals: CreativeCellStat;
  /** HER ZAMAN `TopicHookMatrix.hookTypes.length` hücre, `hookTypes` sırasıyla (boş hücreler dahil). */
  cells: TopicHookCell[];
}

// ---------------------------------------------------------------------- Sıralama

/**
 * Fırsat sırası (en iyi önce; yalnız `proven_opportunity` hücreler): rakip güveni (yüksek → düşük), rakip medyan lift azalan, sonra
 * deterministik (küme anahtarı, hook türü sütun sırası). Açı matrisindeki `compareOpportunities` ile aynı güven/lift kuralı.
 */
export function compareTopicOpportunities(a: TopicHookCell, b: TopicHookCell): number {
  return (
    CONFIDENCE_RANK[b.rivals.confidence] - CONFIDENCE_RANK[a.rivals.confidence] ||
    (b.rivals.medianLift ?? Number.NEGATIVE_INFINITY) - (a.rivals.medianLift ?? Number.NEGATIVE_INFINITY) ||
    tieBreak(a, b)
  );
}

/**
 * Kendi tutanların sırası (en iyi önce; yalnız `worked` hücreler): kendi güveni (yüksek → düşük), kendi medyan lift azalan, tutan video
 * sayısı azalan, sonra deterministik. Rakipsiz hesapta "ne tuttu" listesi budur.
 */
export function compareTopicWinners(a: TopicHookCell, b: TopicHookCell): number {
  return (
    CONFIDENCE_RANK[b.own.confidence] - CONFIDENCE_RANK[a.own.confidence] ||
    (b.own.medianLift ?? Number.NEGATIVE_INFINITY) - (a.own.medianLift ?? Number.NEGATIVE_INFINITY) ||
    b.own.outlierCount - a.own.outlierCount ||
    tieBreak(a, b)
  );
}

function tieBreak(a: TopicHookCell, b: TopicHookCell): number {
  if (a.clusterKey !== b.clusterKey) return a.clusterKey < b.clusterKey ? -1 : 1;
  return HOOK_TYPES.indexOf(a.hookType) - HOOK_TYPES.indexOf(b.hookType);
}

// ---------------------------------------------------------------------- Matris

/** `getTopicHookMatrix` sonucu: tek, serileştirilebilir nesne. */
export interface TopicHookMatrix {
  schemaVersion: typeof TOPIC_HOOK_MATRIX_SCHEMA_VERSION;
  /** Üretildiği an (çağıranın saati). */
  generatedAt: string;
  scope: CreativeMatrixScope;
  /** Sütunlar: hook türleri (`HOOK_TYPES` sırasıyla; her satırın hücreleri bu sırayla). */
  hookTypes: HookType[];
  /**
   * Satırlar: kapsamda en az bir videosu olan konu kümeleri; video sayısı (kendi + rakip) azalan, eşitlikte küme anahtarı artan. Küme yoksa [].
   * Kümesi olmayan video satıra girmez (`unclusteredCount`).
   */
  rows: TopicHookRow[];
  /** Hücrelere giren video sayısı (kapsamda, doğrulanmış hook türlü, kümeli; satırların `own.n + rivals.n` toplamı). */
  clusteredCount: number;
  /** Matrise girebilecek (kapsamdaki analizli, niş dışı olmayan) ama kümesi olmayan video sayısı. */
  unclusteredCount: number;
  /** Matris hesaplanamıyorsa sebep (`clusteredCount = 0`); aksi halde undefined. Boş tablo yerine bu gösterilir. */
  unmeasuredReason?: string;
  /** Durumu `proven_opportunity` olan hücreler (rakipte tuttu, kendi denemedi), `compareTopicOpportunities` sırasıyla. Rakip yoksa []. */
  opportunities: TopicHookCell[];
  /** Durumu `worked` olan hücreler (kendi tuttu), `compareTopicWinners` sırasıyla: rakipsiz hesapta öğrenme kaynağı. */
  winners: TopicHookCell[];
}

/** Hiç kümelenmiş video yokken matris: satır yok + sebep. Depolar kümesiz workspace'te bunu döndürür. */
export function emptyTopicHookMatrix(
  scope: CreativeMatrixScope,
  generatedAt: string,
  unclusteredCount = 0,
  reason = "Henüz konu kümesi yok.",
): TopicHookMatrix {
  return {
    schemaVersion: TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
    generatedAt,
    scope,
    hookTypes: [...HOOK_TYPES],
    rows: [],
    clusteredCount: 0,
    unclusteredCount,
    unmeasuredReason: reason,
    opportunities: [],
    winners: [],
  };
}
