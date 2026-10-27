/**
 * Kanıtlanmış fikir kartı tipleri (yerel; `domain/**` sıralı dosyadır, ona dokunulmaz). 07 kreatif direktör bu tipi buradan alır.
 * Düz, serileştirilebilir veri: Date/Map/fonksiyon yok. Kart düz kodla kurulur (LLM yok); ölçülemeyen değer `undefined`'dır (0 değil).
 */
import type { CtaPosition, FirstSectionBucket, HookLengthBucket, TempoBucket } from "@/lib/domain/anatomy";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { Platform } from "@/lib/platforms/types";

/** `proven`: ≥ 2 FARKLI hesapta (ya da ≥ 2 platformda) lift ≥ 3x · `single`: tek hesapta lift ≥ 5x ("tek kanıtlı"). */
export type ProvenKind = "proven" | "single";

/** Hücre tabanı: konu kümesi × hook türü; kümeleme hiç koşmamışsa süre kovası × hook türü (SPEC açık soru a). */
export type ProvenBasis = "topic" | "duration";

/** Süre kovası (yedek hücre için): 15 sn altı / 15–30 / 30–60 / 60+. */
export const DURATION_BUCKETS = ["under_15", "15_30", "30_60", "over_60"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];
export const DURATION_BUCKET_LABEL: Record<DurationBucket, string> = {
  under_15: "15 sn altı",
  "15_30": "15–30 sn",
  "30_60": "30–60 sn",
  over_60: "60 sn ve üstü",
};

/** Kartı kanıtlayan bir video. */
export interface ProvenEvidence {
  contentItemId: string;
  /** `content_items.owner.id` (kendi hesap ya da rakip kimliği): "aynı hesap" kuralı bununla sayılır. */
  accountId: string;
  handle: string;
  isOwn: boolean;
  platform: Platform;
  lift: number;
  url?: string;
}

/** Bir anatomi boyutunun kanıt videolarındaki baskın kovası; hiçbir kanıt videosunda ölçülemediyse `bucket` undefined. */
export interface ModalBucket<K extends string> {
  bucket?: K;
  /** Baskın kovada kaç video. */
  count: number;
  /** Boyutu ölçülebilen kanıt videosu sayısı. */
  measured: number;
}

/** Kanıt videolarının anatomi özeti (kovalar `anatomy/buckets.ts`; kanıt sayısı düşükse tek video da özet olabilir: `measured` söyler). */
export interface ProvenAnatomy {
  hookLength: ModalBucket<HookLengthBucket>;
  firstSection: ModalBucket<FirstSectionBucket>;
  tempo: ModalBucket<TempoBucket>;
  ctaPosition: ModalBucket<CtaPosition>;
  /** Kanıt videolarının süre medyanı (sn); süre bilinmiyorsa undefined. */
  medianDurationSec?: number;
  /** Gövde türü (hangi bölüm tipi kaç kanıt videosunda): kısa bir kayıt, sıra sayıya göre azalan. */
  bodyTypes: { type: string; videos: number }[];
}

export interface ProvenIdea {
  /** Kararlı kimlik: `<taban>:<hücre anahtarı>:<hook türü>`. */
  id: string;
  kind: ProvenKind;
  basis: ProvenBasis;
  /** Hücre: konu kümesi (`basis = topic`) ya da süre kovası (`basis = duration`). */
  cellKey: string;
  cellLabel: string;
  hookType: string;
  /** Kanıt videoları (lift ≥ 3x), lift'e göre azalan. */
  evidence: ProvenEvidence[];
  /** Kanıtın FARKLI hesap / platform sayısı. */
  accountCount: number;
  platformCount: number;
  /** Kanıt videolarının lift medyanı. */
  medianLift: number;
  /** Kanıt videolarından `summarizeLiftSamples` güveni (örnek sayısı + baz çizgisi tavanı). */
  confidence: ConfidenceLevel;
  anatomy: ProvenAnatomy;
  /** Kendi hesap bu hücreyi (konu × hook) denedi mi: hücrede kendi bir video var (lift'i ölçülmese de). */
  ownTried: boolean;
}

/** Eşikler tek yerde. */
export const PROVEN_MIN_LIFT = 3;
export const PROVEN_MIN_ACCOUNTS = 2;
export const SINGLE_MIN_LIFT = 5;
