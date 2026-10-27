/**
 * Zeka katmanının ortak sözlükleri (taksonomi `TAXONOMY_VERSION`, `domain/intel.ts`): bölüm tipleri, etiket eksenleri,
 * çerçeve (frame), izleyiciden istenen şey (CTA türü) ve süre kovası. Ekranlar, içgörü hesabı ve LLM görevleri (`lib/llm/taxonomy.ts` bunlardan
 * zod enum'u kurar) AYNI listeyi kullanır; hook türleri `domain/hook-types.ts`'tedir. Anahtarlar veride olduğu gibi kalır,
 * yalnız ekran etiketi Türkçe'dir; bilinmeyen anahtar `humanizeKey` ile okunur hale gelir. Etiketler müşteri dilindedir (düz dil kararı:
 * "Hook" → "Açılış", "CTA türü" → "İzleyiciden istenen şey", "DM'e çağrı" → "Mesaj atma çağrısı", "CTA yok" → "Çağrı yok").
 */

/** Video bölümü tipleri (`AnalysisSection.type`). */
export const SECTION_TYPES = ["hook", "story", "problem", "insight", "proof", "practice", "cta"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  hook: "Açılış",
  story: "Hikaye",
  problem: "Problem",
  insight: "Fikir / içgörü",
  proof: "Kanıt",
  practice: "Uygulama",
  cta: "Harekete çağrı",
};

/** Etiket eksenleri (`AnalysisLabel.key`). */
export const LABEL_AXES = ["topic", "tone", "frame", "cta_type"] as const;
export type LabelAxis = (typeof LABEL_AXES)[number];

export const LABEL_AXIS_LABEL: Record<LabelAxis, string> = {
  topic: "Konu",
  tone: "Ton",
  frame: "Çerçeve",
  cta_type: "İzleyiciden istenen şey",
};

/** Çerçeve (`frame` ekseni): içeriğin hangi dilden konuştuğu. */
export const IDEA_FRAMES = ["faith", "science", "personal", "practical"] as const;
export type IdeaFrame = (typeof IDEA_FRAMES)[number];

export const IDEA_FRAME_LABEL: Record<IdeaFrame, string> = {
  faith: "İnanç / maneviyat",
  science: "Bilim",
  personal: "Kişisel hikaye",
  practical: "Pratik",
};

/**
 * CTA (harekete çağrı) türü. Açıklama metninden kural tabanlı sınıflanır (LLM yok, `lib/insights`); video analizinde
 * `cta_type` etiketi aynı listeden gelir. Bir açıklamada birden çok CTA varsa öncelik sırası bu listedeki sıradır.
 */
export const CTA_TYPES = ["comment_keyword", "dm", "book_call", "link_in_bio", "save_share", "follow", "none"] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CTA_TYPE_LABEL: Record<CtaType, string> = {
  comment_keyword: "Yorum anahtar kelimesi",
  dm: "Mesaj atma çağrısı",
  book_call: "Görüşme / randevu",
  link_in_bio: "Biyografideki bağlantı",
  save_share: "Kaydet / paylaş",
  follow: "Takip et",
  none: "Çağrı yok",
};

/** Süre kovaları (sn): rakip tutanları 56–128 sn iken kendi videolar 10–25 sn (docs/FAZ2-PLAN.md §1). */
export const DURATION_BUCKETS = ["under_15", "15_30", "30_60", "60_90", "over_90"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export const DURATION_BUCKET_LABEL: Record<DurationBucket, string> = {
  under_15: "15 sn altı",
  "15_30": "15–30 sn",
  "30_60": "30–60 sn",
  "60_90": "60–90 sn",
  over_90: "90 sn ve üstü",
};

/** Alt sınırlar (sn, dahil): `under_15` 0'dan başlar. */
const DURATION_BUCKET_MIN: Record<DurationBucket, number> = { under_15: 0, "15_30": 15, "30_60": 30, "60_90": 60, over_90: 90 };

/** Süreden kova. Süre bilinmiyor/geçersizse undefined (kovaya 0 sn olarak girmez). */
export function durationBucketOf(durationSec: number | undefined): DurationBucket | undefined {
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec < 0) return undefined;
  let bucket: DurationBucket = "under_15";
  for (const key of DURATION_BUCKETS) if (durationSec >= DURATION_BUCKET_MIN[key]) bucket = key;
  return bucket;
}
