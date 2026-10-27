/**
 * Kreatif Anatomisi (`getAnatomy`, `/anatomi`; docs/FAZ2-KAPANIS-PLAN.md §2): bir videonun zaman çizelgesi (faz çubukları) ve
 * kendi ↔ rakip ↔ tutan karşılaştırması. LLM'siz: analizdeki bölümlerden (`ContentAnalysis.sections`, `editMetrics`) kodla türetilir
 * (`lib/anatomy/**`; mock ve Supabase AYNI `buildAnatomy` fonksiyonunu çağırır, yalnız yükleme ayrı).
 *
 * `AnatomyReport` UI'dan BAĞIMSIZ, tek ve SERİLEŞTİRİLEBİLİR bir nesnedir (düz veri: Date/Map/fonksiyon yok; hesap, tarih, n ve güven
 * içerir): "Reels Kreatif Röntgeni" PDF'i ileride bundan üretilir (PDF bu planda yok; müşteriye gideceği için biçimi önce sorulur).
 *
 * Kurallar: ölçülemeyen değer `undefined`'dır (0 değil) ve sebebi yanında durur; grup/kohort n < 3 ise değer `undefined` + sebep;
 * lift ve güven tek kuraldan gelir (`summarizeLiftSamples`, `lib/metrics/hook-lift.ts`; kopya yok).
 */
import type { LiftTier } from "@/lib/domain/content";
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { GroupedLift } from "@/lib/domain/insights";
import type { EditMetrics } from "@/lib/domain/intel";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

export const ANATOMY_SCHEMA_VERSION = 1;

// ------------------------------------------------------------------- Fazlar

/**
 * Video fazları (türetilir; taksonomide "giriş" bölüm tipi YOKTUR): Hook = `hook` bölümleri · Giriş = hook sonrası ilk gövde
 * bölümünden önceki `story/problem` · Gövde = `insight/proof/practice` (ve sonrası) · CTA = `cta`. Bölüm bitişi = sonraki
 * `startSec`, sonuncuda `durationSec`. CTA videonun ortasında olabilir: CTA'dan sonraki gövde AYRI parçadır.
 */
export const ANATOMY_PHASES = ["hook", "intro", "body", "cta"] as const;
export type AnatomyPhase = (typeof ANATOMY_PHASES)[number];

export const ANATOMY_PHASE_LABEL: Record<AnatomyPhase, string> = {
  hook: "Açılış",
  intro: "Giriş",
  body: "Gövde",
  cta: "Harekete çağrı",
};

/** Bir bölümün alıntısı (analizdeki birebir alıntı). */
export interface AnatomyQuote {
  /** Taksonomiden bölüm tipi (`hook`, `problem`, `insight` …). */
  type: string;
  quote: string;
  startSec?: number;
}

/** Zaman çizelgesindeki bir faz parçası; `startSec`/`endSec` bölüm zamanı yoksa undefined (süre 0 değil, ölçülemedi). */
export interface PhaseSpan {
  phase: AnatomyPhase;
  startSec?: number;
  endSec?: number;
  /** `endSec − startSec`; hesaplanamıyorsa undefined. */
  durationSec?: number;
  sections: AnatomyQuote[];
}

// ------------------------------------------------------------------ Kovalar

/** Hook uzunluğu (kelime): 1–6 / 7–12 / 13+. */
export const HOOK_LENGTH_BUCKETS = ["1_6", "7_12", "13_plus"] as const;
export type HookLengthBucket = (typeof HOOK_LENGTH_BUCKETS)[number];
export const HOOK_LENGTH_LABEL: Record<HookLengthBucket, string> = { "1_6": "1–6 kelime", "7_12": "7–12 kelime", "13_plus": "13+ kelime" };

/** İlk bölüme geçiş (sn; hook'un kendi süresi değil, hook sonrası ilk bölümün başlangıcı): <5 / 5–10 / 10–20 / 20+. */
export const FIRST_SECTION_BUCKETS = ["under_5", "5_10", "10_20", "over_20"] as const;
export type FirstSectionBucket = (typeof FIRST_SECTION_BUCKETS)[number];
export const FIRST_SECTION_LABEL: Record<FirstSectionBucket, string> = {
  under_5: "5 sn altı",
  "5_10": "5–10 sn",
  "10_20": "10–20 sn",
  over_20: "20 sn ve üstü",
};

/** CTA konumu: videonun son 5 sn'si / 6–15 sn kala / daha önce / CTA yok. */
export const CTA_POSITIONS = ["last_5s", "6_15s", "earlier", "none"] as const;
export type CtaPosition = (typeof CTA_POSITIONS)[number];
export const CTA_POSITION_LABEL: Record<CtaPosition, string> = {
  last_5s: "Son 5 sn",
  "6_15s": "Sondan 6–15 sn",
  earlier: "Daha önce",
  none: "Çağrı yok",
};

/** Tempo (kesme/dk): <2 / 2–4 / 4+. */
export const TEMPO_BUCKETS = ["under_2", "2_4", "over_4"] as const;
export type TempoBucket = (typeof TEMPO_BUCKETS)[number];
export const TEMPO_BUCKET_LABEL: Record<TempoBucket, string> = {
  under_2: "Dakikada 2'den az kesme",
  "2_4": "Dakikada 2–4 kesme",
  over_4: "Dakikada 4'ten çok kesme",
};

// -------------------------------------------------------------- Tek video

/** `VideoAnatomy` alanlarından ölçülemeyenin adı (sebep `unmeasured`'da). */
export type VideoAnatomyField = "phases" | "hookWords" | "firstSectionAtSec" | "ctaPosition" | "cutsPerMinute" | "screenText";

/**
 * Tek videonun anatomisi (`deriveVideoAnatomy`: saf, analizden). Analiz yoksa/başarısızsa üretilmez (sayfa "analiz yok" der).
 * Hook/CTA/süre türleri Karşılaştırma verisindedir (`getInsights`); burada yalnız yeni boyutlar vardır.
 */
export interface VideoAnatomy {
  contentItemId: string;
  ownerHandle: string;
  isOwn: boolean;
  durationSec?: number;
  lift?: number;
  liftTier?: LiftTier;
  /** Zaman sıralı faz parçaları (CTA ortadaysa gövde iki parçadır); bölüm yoksa boş. */
  phases: PhaseSpan[];
  /** Hook'un kelime sayısı (`hookText`); hook yoksa undefined. */
  hookWords?: number;
  /** İlk bölüme geçiş (sn): hook sonrası ilk bölümün `startSec`'i. */
  firstSectionAtSec?: number;
  ctaPosition?: CtaPosition;
  /** Gövdede bulunan bölüm tipleri (tekrarsız; sıra çizelgedeki gibi). */
  bodyTypes: string[];
  /** Kurgu özeti (analizin `editMetrics`'i; ölçülmediyse undefined). */
  editMetrics?: EditMetrics;
  /**
   * Ekran yazılarının başlangıç saniyeleri (transcript `segments`, kanal "screen"); transcript yoksa/süresi dolduysa undefined
   * ("—, süresi doldu"; sayı için `editMetrics.onScreenTextCount` kalır).
   */
  screenTextAtSec?: number[];
  /** Ölçülemeyen alan → sebep. */
  unmeasured: Partial<Record<VideoAnatomyField, string>>;
}

// ------------------------------------------------------------- Toplu rapor

/** Video seçici satırı: analizli video + lift (seçici lift'e göre sıralar; `ContentLink` ile `/video/[id]`). */
export interface AnatomyVideoRef extends ContentSummary {
  isOwn: boolean;
  durationSec?: number;
  liftTier?: LiftTier;
  publishedAt?: string;
}

/** Bir boyutun kendi ↔ rakip lift tablosu (`GroupedLift` biçimi: `n`, güven, medyan lift). Hesaplanamazsa sebep yazılır. */
export interface AnatomyDimension<K extends string = string> {
  grouped: GroupedLift<K>;
  unmeasuredReason?: string;
}

/** Gövde türü karışımı: her bölüm tipi için "videoda var / yok" × lift. */
export interface AnatomyBodyMixRow {
  /** Bölüm tipi (`insight`, `proof`, `practice` …). */
  type: string;
  presence: GroupedLift<"with" | "without">;
}

/** Tutan reçetesi kohortları: tutanlar (≥3x) · diğer rakipler · Ornek (kendi hesap). */
export const RECIPE_COHORTS = ["winners", "other_rivals", "own"] as const;
export type RecipeCohortKey = (typeof RECIPE_COHORTS)[number];
export const RECIPE_COHORT_LABEL: Record<RecipeCohortKey, string> = {
  winners: "Tutan videolar",
  other_rivals: "Diğer rakipler",
  own: "Kendi hesap",
};

/** Kohort metriği: kohort medyanı/payı; kohortta ölçülmüş örnek n < 3 ise `value` undefined + `reason` (0 değil). */
export interface RecipeValue {
  value?: number;
  /** Değerin dayandığı ölçülmüş video sayısı. */
  n: number;
  reason?: string;
}

/** Reçete metrikleri: kohort başına bir `RecipeValue` (medyan) ya da pay (0..1). */
export type RecipeMetric =
  | "hookWords"
  | "firstSectionSec"
  | "durationSec"
  | "sectionCount"
  | "cutsPerMinute"
  | "screenTextCount"
  | "onCameraShare"
  | "ctaShare";

export const RECIPE_METRIC_LABEL: Record<RecipeMetric, string> = {
  hookWords: "Açılış uzunluğu (kelime)",
  firstSectionSec: "İlk bölüme geçiş (sn)",
  durationSec: "Süre (sn)",
  sectionCount: "Bölüm sayısı",
  cutsPerMinute: "Dakikadaki kesme sayısı",
  screenTextCount: "Ekran yazısı sayısı",
  onCameraShare: "Kamerada konuşmacı payı",
  ctaShare: "İzleyiciden bir şey isteyen video payı",
};

export interface RecipeCohort {
  key: RecipeCohortKey;
  label: string;
  /** Kohorttaki analizli video sayısı. */
  videoCount: number;
  /** Örnek sayısından güven (baz çizgisi tavanı dahil, `summarizeLiftSamples`). */
  confidence: ConfidenceLevel;
  lowBaselineShare?: number;
  metrics: Record<RecipeMetric, RecipeValue>;
  /** Gövde tipi → kohortta o tipi taşıyan video payı (0..1). */
  bodyShares: Record<string, RecipeValue>;
  /** CTA konumu → video sayısı (CTA'sız `none`). */
  ctaPositionCounts: Partial<Record<CtaPosition, number>>;
}

/** Kendi ↔ tutan farkı; metin KODLA üretilir ("Ornek 14 sn, tutanlar 92 sn"), güven rozetiyle gösterilir. */
export interface RecipeDifference {
  metric: RecipeMetric;
  label: string;
  ownValue?: number;
  winnersValue?: number;
  /** İki taraf da ölçülmüşse fark cümlesi; değilse undefined (sebep `reason`). */
  text?: string;
  reason?: string;
  /** İki kohortun güveninin zayıfı. */
  confidence: ConfidenceLevel;
}

export type AnatomySection =
  | "videos"
  | "hook_length"
  | "first_section"
  | "body_mix"
  | "cta_position"
  | "tempo"
  | "recipe";

export interface AnatomyScope {
  workspaceId: string;
  /** Kendi hesaba daraltıldıysa (`social_accounts.id`). */
  accountId?: string;
  /** Kapsamdaki kendi hesap(lar)ın kullanıcı adları ("@" yok). */
  ownHandles: string[];
  days: number;
  since: string;
  until: string;
  /** "Tutan" eşiği (lift); varsayılan 3. */
  winnerMinLift: number;
}

export interface AnatomyCounts {
  /** Kapsamdaki analizli (`ok` + doğrulanmış) video sayısı. */
  analyzed: number;
  own: number;
  rivals: number;
  /** Tutan (≥ `winnerMinLift`) analizli video sayısı. */
  winners: number;
}

/** `getAnatomy` sonucu: tek, serileştirilebilir nesne (PDF "Reels Kreatif Röntgeni"nin kaynağı). */
export interface AnatomyReport {
  schemaVersion: typeof ANATOMY_SCHEMA_VERSION;
  /** Raporun üretildiği an (çağıranın saati). */
  generatedAt: string;
  scope: AnatomyScope;
  counts: AnatomyCounts;
  /** Analizli videolar, lift'e göre azalan (ölçülemeyen sonda); video seçici bunu kullanır. */
  videos: AnatomyVideoRef[];
  hookLength: AnatomyDimension<HookLengthBucket>;
  firstSection: AnatomyDimension<FirstSectionBucket>;
  bodyMix: AnatomyBodyMixRow[];
  ctaPosition: AnatomyDimension<CtaPosition>;
  tempo: AnatomyDimension<TempoBucket>;
  recipe: {
    cohorts: RecipeCohort[];
    differences: RecipeDifference[];
  };
  /** Hesaplanamayan bölümler ve sebepleri (boş tablo yerine açıklama gösterilir). */
  unmeasured: { section: AnatomySection; reason: string }[];
}

/**
 * Boş rapor (analiz yok): her tablo boş, her bölüm sebebiyle `unmeasured`'da. Mock depo ve testler kullanır; gerçek hesap
 * `lib/anatomy/aggregate.ts` (B).
 */
export function emptyAnatomyReport(scope: AnatomyScope, generatedAt: string, reason = "Analizli video yok."): AnatomyReport {
  const emptyDimension = <K extends string>(): AnatomyDimension<K> => ({ grouped: { own: [], competitors: [] }, unmeasuredReason: reason });
  const sections: AnatomySection[] = ["videos", "hook_length", "first_section", "body_mix", "cta_position", "tempo", "recipe"];
  return {
    schemaVersion: ANATOMY_SCHEMA_VERSION,
    generatedAt,
    scope,
    counts: { analyzed: 0, own: 0, rivals: 0, winners: 0 },
    videos: [],
    hookLength: emptyDimension(),
    firstSection: emptyDimension(),
    bodyMix: [],
    ctaPosition: emptyDimension(),
    tempo: emptyDimension(),
    recipe: { cohorts: [], differences: [] },
    unmeasured: sections.map((section) => ({ section, reason })),
  };
}
