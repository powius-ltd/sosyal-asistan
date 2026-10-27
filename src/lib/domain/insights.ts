/**
 * "Karşılaştırma" ekranının verisi (`getInsights`): LLM'siz, mevcut veriden hesaplanan içgörüler (docs/FAZ2-PLAN.md §2a).
 * Kendi hesap ↔ izlenen rakipler yan yana: karşılaştırma tablosu, süre kovası × lift, CTA türü × lift, paylaşım saati/
 * sıklık, hashtag imzası, marka sesi ön istatistiği, veri kalitesi rozetleri ve benzer boy havuzu. Hesap `lib/data/views/
 * insights.ts` (ve `lib/insights/**`) içindedir; her değer ölçülemezse `undefined` (0 değil) ve sebebi `unmeasured`'dadır.
 */
import type { HookType } from "@/lib/domain/hook-types";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { CtaType, DurationBucket } from "@/lib/domain/taxonomy";
import type { VoiceStats } from "@/lib/domain/voice-profile";
import type { Platform } from "@/lib/platforms/types";

/** Bir grup (süre kovası, CTA türü …) için lift özeti. Kendi ve rakip grupları AYRI tutulur (`GroupedLift`). */
export interface LiftGroupStat<K extends string = string> {
  key: K;
  /** Gruptaki video sayısı. */
  n: number;
  /** Lift'i ölçülmüş video sayısı (`medianLift` bunlar üzerinden). */
  liftN: number;
  /** Medyan lift; hiçbirinin lift'i yoksa undefined. */
  medianLift?: number;
  /** ≥ 3x (`OUTLIER_MIN_TIER`) tutan video sayısı (lift ölçülenler arasında). */
  outlierCount: number;
  /** Grubun medyan izlenmesi (kendi görüntüleme türünde). */
  medianViews?: number;
  /**
   * `liftN`'den: ≥ 10 yüksek, ≥ 5 orta, aksi düşük; baz çizgisi tavanı uygulanmış (`lowBaselineShare` ≥ %50 ise en çok orta,
   * `capConfidenceForBaseline`).
   */
  confidence: ConfidenceLevel;
  /**
   * Lift'i ölçülmüş videoların, baz çizgisi düşük güvenli (`ContentScore.lowConfidence`) olanlarının payı (0..1): güvenin neden
   * orta ile sınırlandığını açıklar. Ölçülmüş video ya da baz çizgisi bilgisi yoksa undefined (0 değil).
   */
  lowBaselineShare?: number;
}

export interface GroupedLift<K extends string = string> {
  /** Kapsamdaki kendi hesap(lar)ın videoları. */
  own: LiftGroupStat<K>[];
  /** İzlenen rakiplerin videoları. */
  competitors: LiftGroupStat<K>[];
}

/** Veri kalitesi rozeti türü: hesabın sayısına neden fazla güvenilmemeli. */
export type DataQualityKind = "hidden_likes" | "too_young" | "low_sample" | "no_baseline" | "off_niche";

export const DATA_QUALITY_LABEL: Record<DataQualityKind, string> = {
  hidden_likes: "Beğeni sayısı gizli",
  too_young: "3 günden yeni video",
  low_sample: "Az video",
  no_baseline: "Normali hesaplanamadı",
  off_niche: "Konu dışı video",
};

export interface DataQualityBadge {
  kind: DataQualityKind;
  /** Etkilenen video sayısı. */
  count: number;
  /** Değerlendirilen toplam video sayısı ("8/10 beğeni gizli"). */
  total: number;
}

/** Paylaşım dilimi (hedef kitle saat diliminde; Pzt = 0). */
export interface PostingSlot {
  weekday: number;
  hour: number;
  /** Bu dilimde paylaşılan video sayısı. */
  n: number;
  /** Dilimin medyan izlenmesi; ölçülemiyorsa undefined. */
  medianViews?: number;
}

/** Paylaşım saati (hedef kitle saat diliminde, gün ayrımı yok): "10 videonun 10'u 07:00 ET". */
export interface PostingHour {
  hour: number;
  /** Bu saatte paylaşılan video sayısı. */
  n: number;
  /** Tarihli videoların bu saate düşen payı (0..1). */
  share: number;
  /** Saatin medyan izlenmesi (hesabın en sık görüntüleme türünde); ölçülemiyorsa undefined. */
  medianViews?: number;
  /** Lift'i ölçülmüş olgun video sayısı (`n`'nin alt kümesi): `medianLift` bunlardan. */
  liftN: number;
  /** Bu saatteki olgun videoların medyan lift'i; hiçbirinin lift'i ölçülemediyse undefined (0 değil). */
  medianLift?: number;
}

export interface PostingPattern {
  /**
   * Haftalık paylaşım sıklığı (`lib/metrics` `computeCadence`: video sayısı ÷ ilk–son paylaşım arası gün × 7). Tarihli video ≥ 2
   * ise değer verir (2 video da yeter: bu kaba bir hızdır, oturmuş bir sıklık değil); < 2 ise undefined.
   */
  postsPerWeek?: number;
  /** Ardışık paylaşımlar arası medyan gün. */
  medianGapDays?: number;
  /** Son paylaşımdan bu yana gün (istek anına göre). */
  daysSinceLastPost?: number;
  /** En sık paylaşım dilimleri (n azalan, en çok 3). */
  commonSlots: PostingSlot[];
  /**
   * En sık paylaşım SAATLERİ (gün ayrımı yok; n azalan, eşitlikte saat artan, en çok 3): "noelle 10/10 videoyu 07–08 ET'de"
   * bulgusu gün×saat diliminde görünmez (her gün ayrı dilime düşer). Tarihli video yoksa [].
   */
  commonHours: PostingHour[];
  /** En sık dilimin paylaşım payı (0..1): "10 videonun 10'u 07–08 ET". */
  topSlotShare?: number;
}

/** Hashtag imzası: hesabın seri/imza etiketi var mı ("#renewyourmind 9/10") yoksa etiketler tekil mi (Ornek: 47/50). */
export interface HashtagSignature {
  /** En çok kullanılan etiket ("#" yok, küçük harf). */
  topTag?: string;
  /** En sık etiketi kullanan videoların, etiketli videolara oranı (0..1). */
  topTagShare?: number;
  /** En sık etiketin kullanıldığı video sayısı. */
  topTagVideos?: number;
  /** Yalnız bir videoda geçen etiketlerin, tüm farklı etiketlere oranı (0..1). */
  singleUseShare?: number;
  /** Video başına medyan etiket sayısı. */
  medianTagCount?: number;
}

/** Karşılaştırma tablosunun bir satırı: kendi hesap ya da izlenen rakip. */
export interface ComparisonRow {
  subjectKind: "own" | "competitor";
  /** `social_accounts.id` ya da `competitors.id`. */
  subjectId: string;
  /** "@" yok. */
  handle: string;
  /** Hesabın platformu: aynı kullanıcı adı farklı platformlarda olabilir (tabloda numara yerine platform rozeti). */
  platform: Platform;
  followers?: number;
  /** Pencerede yayınlanan kısa video sayısı. */
  videoCount: number;
  /** Medyan izlenme (hesabın en sık görüntüleme türünde; türler karışmaz). */
  medianViews?: number;
  /** Medyan izlenme ÷ takipçi (Ornek 0,69 · rakipler 0,06–0,09: takipçi dışına erişim); ölçülemezse undefined. */
  medianViewsPerFollower?: number;
  medianDurationSec?: number;
  medianLift?: number;
  /** ≥ 3x tutan video sayısı; hiçbirinin lift'i ölçülemediyse undefined ("0 tutan" ≠ "ölçülemedi"). */
  outlierCount?: number;
  /** Yorum-anahtar-kelime CTA'lı videoların, açıklaması olan videolara oranı (0..1). */
  commentCtaShare?: number;
  posting: PostingPattern;
  hashtags: HashtagSignature;
  /** Açıklama metninden marka sesi ön istatistiği (LLM'siz). */
  voice: VoiceStats;
  quality: DataQualityBadge[];
}

/** Benzer boy havuzu: kendi takipçi sayının ±3x'inde izlenen rakipler ("benzer boy havuzunda rakip yok"). */
export interface SimilarSizePool {
  ownFollowers?: number;
  /** Havuzdaki izlenen rakip sayısı. */
  count: number;
  handles: string[];
}

export type InsightSection =
  | "comparison"
  | "duration_buckets"
  | "cta_types"
  | "hook_types"
  | "posting"
  | "hashtags"
  | "voice"
  | "similar_size";

export interface UnmeasuredInsight {
  section: InsightSection;
  reason: string;
}

export interface InsightsScope {
  /** Kendi hesaba daraltıldıysa (`social_accounts.id`). */
  accountId?: string;
  /** Geriye bakış (gün). */
  days: number;
  since: string;
  until: string;
  /** Saat/gün hesabının dilimi (`Workspace.audienceTimeZone`). */
  audienceTimeZone: string;
}

export interface Insights {
  scope: InsightsScope;
  /** Önce kendi hesap(lar), sonra rakipler (video sayısına göre azalan). */
  rows: ComparisonRow[];
  durationBuckets: GroupedLift<DurationBucket>;
  ctaTypes: GroupedLift<CtaType>;
  /**
   * Hook türü × lift: YALNIZ `status = ok` ve `evidenceVerified` analizlerden (kanıtı doğrulanmamış etiketten grup çıkmaz);
   * analizi olmayan video gruba girmez ("analiz yok" bir hook türü değildir). Niş dışı içerik girmez. Analiz yoksa iki taraf da
   * boş döner ve sebebi `unmeasured`'da (`hook_types`) yazılır.
   */
  hookTypes: GroupedLift<HookType>;
  similarSize: SimilarSizePool;
  /** Hesaplanamayan bölümler ve sebepleri (boş tablo yerine açıklama gösterilir). */
  unmeasured: UnmeasuredInsight[];
}
