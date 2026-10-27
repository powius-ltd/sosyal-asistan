/**
 * Kreatif Matris (`getCreativeMatrix`; açı × farkındalık katmanı): hangi (açı, katman) hücresinde kim ne denedi, ne tuttu, nerede
 * boşluk var. Eksenler kullanıcının KENDİ taksonomisidir (`rakip analiz/referans/taksonomi.json`: `aci`, `funnel_katmani`,
 * `aci_x_funnel`); değerler buraya birebir kopyalıdır, çalışma zamanında o dosya okunmaz. Taksonomi değişirse bu dosya (ve
 * `content_creative_labels` check'leri, migration 0011) birlikte güncellenir.
 *
 * İçerik etiketi (`ContentCreativeLabel`) LLM işidir (`label:angles`; her etiket birebir alıntılı); hücre sayıları, lift, güven, hook
 * türleri ve DURUM kodla hesaplanır (`lib/matrix`; LLM yok). `CreativeMatrix` UI'dan BAĞIMSIZ, serileştirilebilir düz veridir
 * (Date/Map/fonksiyon yok). Ölçülemeyen değer `undefined`'dır (0 değil); BOŞ hücre ≠ lift 0: medyan lift `undefined`, durum `empty`.
 */
import type { AdCellStat } from "@/lib/domain/ads";
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { LiftGroupStat } from "@/lib/domain/insights";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

export const CREATIVE_MATRIX_SCHEMA_VERSION = 1;

/** Alıntı sınırı (karakter): `content_creative_labels.*_evidence` check'i ve zod şeması (`lib/data/creative-label-schema.ts`). */
export const CREATIVE_EVIDENCE_MAX_CHARS = 300;

// ------------------------------------------------------------------- Eksenler

/** Açı (`aci`): videonun izleyiciye hangi gerekçeyle seslendiği. Sıra = matris sütun sırası. */
export const CREATIVE_ANGLE_IDS = ["sonuc-kazanim", "aci-korku", "kimlik", "sosyal-kanit"] as const;
export type CreativeAngle = (typeof CREATIVE_ANGLE_IDS)[number];

export const CREATIVE_ANGLE_LABEL: Record<CreativeAngle, string> = {
  "sonuc-kazanim": "Sonuç / kazanım",
  "aci-korku": "Acı / korku",
  kimlik: "Kimlik",
  "sosyal-kanit": "Sosyal kanıt",
};

export interface CreativeAngleInfo {
  id: CreativeAngle;
  label: string;
}

export const CREATIVE_ANGLES: readonly CreativeAngleInfo[] = CREATIVE_ANGLE_IDS.map((id) => ({ id, label: CREATIVE_ANGLE_LABEL[id] }));

/** Farkındalık katmanı (`funnel_katmani`, Schwartz). Sıra = matris satır sırası (1 → 5). */
export const FUNNEL_STAGE_IDS = ["hic-farkinda-degil", "sorunu-biliyor", "cozum-ariyor", "urunu-biliyor", "sicak-musteri"] as const;
export type FunnelStage = (typeof FUNNEL_STAGE_IDS)[number];

export interface FunnelStageInfo {
  id: FunnelStage;
  /** 1..5 (matris satırı). */
  order: number;
  /** Schwartz'ın katman adı. */
  name: string;
  /** Türkçe etiket. */
  label: string;
  /** İzleyicinin o katmandaki zihinsel durumu (taksonomideki cümle). */
  mindset: string;
}

const STAGE_INFO: Record<FunnelStage, Omit<FunnelStageInfo, "id" | "order">> = {
  "hic-farkinda-degil": { name: "Unaware", label: "Hiç farkında değil", mindset: "Böyle bir sorun mu var?" },
  "sorunu-biliyor": { name: "Problem aware", label: "Sorunu biliyor", mindset: "Evet bu var ama ne yapacağımı bilmiyorum" },
  "cozum-ariyor": { name: "Solution aware", label: "Çözüm arıyor", mindset: "Böyle bir şey olabilir, ama hangisi?" },
  "urunu-biliyor": { name: "Product aware", label: "Ürünü biliyor", mindset: "Bunlar arasından hangisini seçmeliyim?" },
  "sicak-musteri": { name: "Most aware", label: "Sıcak müşteri", mindset: "Nerede, ne zaman, nasıl?" },
};

export const FUNNEL_STAGES: readonly FunnelStageInfo[] = FUNNEL_STAGE_IDS.map((id, index) => ({ id, order: index + 1, ...STAGE_INFO[id] }));

// ----------------------------------------------------------------- Ön matris

/** Ön matrisin uygunluk seviyesi (`aci_x_funnel`): açı o katmana ne kadar yakışır. ÖNSELDİR, kanun değil: veri aksini gösterebilir. */
export const PRIOR_FITS = ["birincil", "ikincil", "aykiri"] as const;
export type PriorFit = (typeof PRIOR_FITS)[number];

/** Beklenen uyum, düz dille ("Beklenen uyum: iyi"); ekran bunu küçük harfle cümleye gömer. */
export const PRIOR_FIT_LABEL: Record<PriorFit, string> = { birincil: "İyi", ikincil: "Orta", aykiri: "Zayıf" };

/** Katman → açı → uygunluk (20 hücre, taksonomideki `aci_x_funnel` ile birebir). */
export const ANGLE_FUNNEL_PRIOR: Readonly<Record<FunnelStage, Readonly<Record<CreativeAngle, PriorFit>>>> = {
  "hic-farkinda-degil": { "sonuc-kazanim": "aykiri", "aci-korku": "birincil", kimlik: "ikincil", "sosyal-kanit": "aykiri" },
  "sorunu-biliyor": { "sonuc-kazanim": "ikincil", "aci-korku": "birincil", kimlik: "birincil", "sosyal-kanit": "aykiri" },
  "cozum-ariyor": { "sonuc-kazanim": "birincil", "aci-korku": "ikincil", kimlik: "aykiri", "sosyal-kanit": "ikincil" },
  "urunu-biliyor": { "sonuc-kazanim": "ikincil", "aci-korku": "aykiri", kimlik: "ikincil", "sosyal-kanit": "birincil" },
  "sicak-musteri": { "sonuc-kazanim": "ikincil", "aci-korku": "aykiri", kimlik: "birincil", "sosyal-kanit": "ikincil" },
};

export function priorFitOf(angle: CreativeAngle, stage: FunnelStage): PriorFit {
  return ANGLE_FUNNEL_PRIOR[stage][angle];
}

// -------------------------------------------------------------- İçerik etiketi

/**
 * İçeriğin GÜNCEL açı + katman etiketi (`content_creative_labels`; yeniden etiketleme üzerine yazar). Etiketin YOKLUĞU "etiketlenmedi"
 * demektir (karar verilemeyen içerik rastgele bir hücreye düşmez). `evidenceVerified = false` etiket matrise GİRMEZ: kanıtı kaynakta
 * bulunamayan etiketten hücre dolmaz (hook türüyle aynı kural).
 */
export interface ContentCreativeLabel {
  contentItemId: string;
  angle: CreativeAngle;
  funnelStage: FunnelStage;
  /** Açıyı doğrulayan birebir alıntı (1..`CREATIVE_EVIDENCE_MAX_CHARS`). */
  angleEvidence: string;
  /** Katmanı doğrulayan birebir alıntı (1..`CREATIVE_EVIDENCE_MAX_CHARS`). */
  funnelEvidence: string;
  evidenceVerified: boolean;
  promptVersion: string;
  model?: string;
  /** Etiketlemeyi üreten koşu (abonelik çağrı sayacı). */
  runId?: string;
  labeledAt: string;
}

// ----------------------------------------------------------------- Hücre durumu

/**
 * Hücre durumu (kodla türetilir, `cellStatusOf`): "kanıtlı fırsat" (rakipte tuttu, kendi denemedi), "denendi" (kendi hesap denedi;
 * sonucu hücrenin `own` özetinde), "zayıf" (rakipte de tutmadı), "ölçülemedi" (video var, hiçbirinin lift'i ölçülemedi), "boş"
 * (kimse denemedi).
 */
export const CELL_STATUS = ["proven_opportunity", "tried", "weak", "unmeasured", "empty"] as const;
export type CellStatus = (typeof CELL_STATUS)[number];

export const CELL_STATUS_LABEL: Record<CellStatus, string> = {
  proven_opportunity: "Rakipte tutuyor, sen denemedin",
  tried: "Sen denedin",
  weak: "Rakipte de pek tutmadı",
  unmeasured: "Videolar var ama normaline göre sonucunu ölçemedim",
  empty: "Kimse denemedi",
};

/** "Rakipte etki": medyan lift bunun ÜSTÜNDE (1 = baz çizgisi; yalnız > 1 etkidir, = 1 değil). */
export const EFFECT_LIFT_MIN = 1;

/** Bir hücrenin bir tarafı (kendi ya da rakipler): `LiftGroupStat`'tan anahtarsız. Boş taraf → `emptyCellStat()`. */
export type CreativeCellStat = Omit<LiftGroupStat, "key">;

/** Boş taraf: video yok. `n = 0`, medyan lift `undefined` (0 değil), güven düşük. */
export function emptyCellStat(): CreativeCellStat {
  return { n: 0, liftN: 0, outlierCount: 0, confidence: "low" };
}

/**
 * Durum kuralı (ilk eşleşen kazanır):
 *  1. kendi hesap denedi (`own.n > 0`)                        → `tried`
 *  2. rakipte de video yok (`rivals.n = 0`)                   → `empty`
 *  3. rakip videolarının hiçbirinin lift'i ölçülemedi         → `unmeasured`
 *  4. rakip medyan lift > `EFFECT_LIFT_MIN`                   → `proven_opportunity`
 *  5. aksi                                                    → `weak`
 * Güven (örnek sayısı) durumu DEĞİŞTİRMEZ, hücrede ayrıca durur (`rivals.confidence`): tek videolu "fırsat" düşük güvenle işaretlenir.
 */
export function cellStatusOf(sides: { own: Pick<CreativeCellStat, "n">; rivals: Pick<CreativeCellStat, "n" | "medianLift"> }): CellStatus {
  if (sides.own.n > 0) return "tried";
  if (sides.rivals.n === 0) return "empty";
  if (sides.rivals.medianLift === undefined) return "unmeasured";
  return sides.rivals.medianLift > EFFECT_LIFT_MIN ? "proven_opportunity" : "weak";
}

// ----------------------------------------------------------------------- Hücre

/** En sık hook türü satırı (hücredeki kendi + rakip videolar birlikte). */
export interface CellHookType {
  hookType: string;
  /** Bu hook türündeki video sayısı. */
  n: number;
  /** Bu hook türündeki videoların medyan lift'i; ölçülemediyse undefined. */
  medianLift?: number;
}

/** Hücrede gösterilen örnek video: içerik özeti (içerik başına okuma yok) + kendi mi. */
export interface CreativeMatrixSample extends ContentSummary {
  isOwn: boolean;
}

/** Hücrede en çok gösterilen hook türü / örnek video sayısı. */
export const CELL_TOP_HOOK_TYPES_MAX = 3;
export const CELL_SAMPLES_MAX = 5;

export interface CreativeMatrixCell {
  angle: CreativeAngle;
  stage: FunnelStage;
  /** Ön matristen uygunluk (`priorFitOf`). */
  prior: PriorFit;
  /** Kendi hesap(lar)ın bu hücredeki videoları: `n` = hücredeki doğrulanmış etiketli video, `liftN` = lift'i ölçülenler. */
  own: CreativeCellStat;
  /** İzlenen rakiplerin bu hücredeki videoları (kendi ile AYRI tutulur). */
  rivals: CreativeCellStat;
  /** Hücredeki en sık hook türleri: `n` azalan, eşitlikte tür adı artan; en çok `CELL_TOP_HOOK_TYPES_MAX`. Video yoksa []. */
  topHookTypes: CellHookType[];
  /** Kendi hesap bu hücreyi denedi mi (`own.n > 0`). */
  ownTried: boolean;
  /** `cellStatusOf({ own, rivals })`. */
  status: CellStatus;
  /** Örnek videolar: lift'e göre azalan (ölçülemeyen sonda), eşitlikte içerik kimliği; en çok `CELL_SAMPLES_MAX`. Video yoksa []. */
  samples: CreativeMatrixSample[];
  /**
   * Reklam tarafı (üçüncü kaynak; `domain/ads.ts`). Reklam hesabı YOKSA alan yoktur (rozet çizilmez); hesap varsa 20 hücrenin hepsinde vardır.
   * `status`, `own`, `rivals` ve sıralamayı ETKİLEMEZ.
   */
  ads?: AdCellStat;
}

/** Boş hücre: video yok, durum `empty`, ön matris uygunluğu dolu. */
export function emptyCreativeCell(angle: CreativeAngle, stage: FunnelStage): CreativeMatrixCell {
  const own = emptyCellStat();
  const rivals = emptyCellStat();
  return { angle, stage, prior: priorFitOf(angle, stage), own, rivals, topHookTypes: [], ownTried: false, status: cellStatusOf({ own, rivals }), samples: [] };
}

export const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 2, medium: 1, low: 0 };
const PRIOR_RANK: Record<PriorFit, number> = { birincil: 2, ikincil: 1, aykiri: 0 };

/**
 * Fırsat sırası (en iyi fırsat önce): rakip güveni (yüksek → düşük; tek videonun şansı ile 12 videonun tutarlılığı eşit değildir),
 * sonra rakip medyan lift azalan, sonra ön matris uygunluğu (birincil → aykırı), sonra matris sırası (katman, açı): deterministik.
 */
export function compareOpportunities(a: CreativeMatrixCell, b: CreativeMatrixCell): number {
  return (
    CONFIDENCE_RANK[b.rivals.confidence] - CONFIDENCE_RANK[a.rivals.confidence] ||
    (b.rivals.medianLift ?? Number.NEGATIVE_INFINITY) - (a.rivals.medianLift ?? Number.NEGATIVE_INFINITY) ||
    PRIOR_RANK[b.prior] - PRIOR_RANK[a.prior] ||
    FUNNEL_STAGE_IDS.indexOf(a.stage) - FUNNEL_STAGE_IDS.indexOf(b.stage) ||
    CREATIVE_ANGLE_IDS.indexOf(a.angle) - CREATIVE_ANGLE_IDS.indexOf(b.angle)
  );
}

// ---------------------------------------------------------------------- Matris

export interface CreativeMatrixScope {
  workspaceId: string;
  /** Geriye bakış (gün; `getInsights` ile aynı sınırlar). */
  days: number;
  since: string;
  until: string;
}

/** `getCreativeMatrix` sonucu: tek, serileştirilebilir nesne. */
export interface CreativeMatrix {
  schemaVersion: typeof CREATIVE_MATRIX_SCHEMA_VERSION;
  /** Üretildiği an (çağıranın saati). */
  generatedAt: string;
  scope: CreativeMatrixScope;
  /**
   * HER ZAMAN 20 hücre (hiç etiket olmasa da, boş hücreler dahil), sıralı: katman 1 → 5, her katmanda açı sırasıyla
   * (`FUNNEL_STAGE_IDS` × `CREATIVE_ANGLE_IDS`; dizin = katman × 4 + açı).
   */
  cells: CreativeMatrixCell[];
  /** Hücrelere giren video sayısı (kapsamda, doğrulanmış etiketli; `own.n + rivals.n` toplamı). */
  labeledCount: number;
  /** Etiketlenebilir (kapsamdaki analizli, niş dışı olmayan) ama etiketi olmayan ya da kanıtı doğrulanmamış video sayısı. */
  unlabeledCount: number;
  /** Matris hesaplanamıyorsa sebep (`labeledCount = 0`); aksi halde undefined. Boş tablo yerine bu gösterilir. */
  unmeasuredReason?: string;
  /** Durumu `proven_opportunity` olan hücreler, `compareOpportunities` sırasıyla (`cells`'ten kopya). */
  opportunities: CreativeMatrixCell[];
  /** Etiketsiz (hücresi çözülemeyen) reklam kreatifi sayısı; reklam hesabı yoksa alan yok. */
  unlabeledAdCount?: number;
}

/** Hiç etiket yokken matris: 20 boş hücre + sebep. Depolar etiketsiz workspace'te bunu döndürür. */
export function emptyCreativeMatrix(
  scope: CreativeMatrixScope,
  generatedAt: string,
  unlabeledCount = 0,
  reason = "Henüz etiketlenmiş video yok.",
): CreativeMatrix {
  return {
    schemaVersion: CREATIVE_MATRIX_SCHEMA_VERSION,
    generatedAt,
    scope,
    cells: FUNNEL_STAGE_IDS.flatMap((stage) => CREATIVE_ANGLE_IDS.map((angle) => emptyCreativeCell(angle, stage))),
    labeledCount: 0,
    unlabeledCount,
    unmeasuredReason: reason,
    opportunities: [],
  };
}
