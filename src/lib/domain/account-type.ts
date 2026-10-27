/**
 * Hesap türü (`workspaces.account_type`, migration 0015): çalışma alanının AMACI. Tür; hangi kreatif matrislerin kullanıldığını, açı ×
 * farkındalık etiketlemesinin uygulanıp uygulanmadığını, hangi CTA'ların önerildiğini, plan içerik karmasını ve plan/brifing dilinin amacını
 * belirler. Tür yalnız bu tabloda dallanır: ekranlar ve görevler `accountTypeProfile(type)` alanlarına bakar, `type === "creator"` yazmaz.
 *
 *  - `business` (işletme / koç): güven → müşteri → satış. Matris: açı × farkındalık (`angle_funnel`). CTA: yorum anahtar kelimesi, DM, bio
 *    linki, randevu.
 *  - `creator` (içerik üreticisi; tarih, bilim, mitoloji, gizem gibi satışsız hesap): erişim, izlenme süresi, kaydet/paylaş, takipçi.
 *    Matris: konu × hook türü (`topic_hook`). Açı × farkındalık etiketlenmez (içerik bu çerçeveye uymaz: çoğu video "belirsiz" çıkar).
 *  - `mixed` (karma): bir şey satar ama içeriği hem erişim hem satış odaklıdır. İKİ matris birden, açı etiketlemesi VAR, CTA'lar iki kümenin
 *    birleşimi, plan karması varsayılan erişim %60 / satış %40 (`MIXED_CONTENT_MIX`; ayardan değiştirme sonraki iş).
 *
 * DB kontrolü (`workspaces_account_type_check`) aynı listedir: yeni tür = kontrol + bu tablo birlikte genişler. Saf; veri okumaz.
 */
import type { CtaType } from "@/lib/domain/taxonomy";

export const ACCOUNT_TYPES = ["business", "creator", "mixed"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Varsayılan tür (DB varsayılanı): ayarlanmamış ya da tanınmayan değer işletme sayılır. */
export const DEFAULT_ACCOUNT_TYPE: AccountType = "business";

/** Kreatif matris türü: `angle_funnel` = açı × farkındalık katmanı (`getCreativeMatrix`) · `topic_hook` = konu kümesi × hook türü (`getTopicHookMatrix`). */
export const MATRIX_KINDS = ["angle_funnel", "topic_hook"] as const;
export type MatrixKind = (typeof MATRIX_KINDS)[number];

/**
 * Plan içerik karması: haftalık plan slotlarının hangi payı ERİŞİM (konu × hook; izlenme, kaydet/paylaş, takip) ve hangisi SATIŞ (açı ×
 * farkındalık; yorum/DM/bio/randevu) odaklı. Oranlar 0..1 ve toplamı 1'dir; slot dağıtımı `splitPlanSlots` ile.
 */
export interface ContentMix {
  reach: number;
  sales: number;
}

/** Karma hesabın varsayılan içerik karması: erişim %60 / satış %40. */
export const MIXED_CONTENT_MIX: Readonly<ContentMix> = { reach: 0.6, sales: 0.4 };

export interface AccountTypeProfile {
  /** Ekranda görünen ad (ayar alanı, oluşturma formu, rozet). */
  label: string;
  /** Tek cümle açıklama (form/ayar ipucu). */
  description: string;
  /** Plan ve brifing dili için kısa amaç metni ("hesabın amacı bu; öneriler buna göre değerlendirilir"). */
  purpose: string;
  /** Bu türün kullandığı kreatif matrisler (tek değer değil LİSTE: karma ikisini de gösterir). Sıra = ekranda sıra. */
  matrices: readonly MatrixKind[];
  /** Açı × farkındalık etiketlemesi (`label:angles`) uygulanır mı. `false` ise etiketleme koşulmaz, matris ve brifing açı bilgisine yaslanmaz. */
  appliesAngleLabeling: boolean;
  /** Plan içerik karması (erişim / satış payı). `business` tümü satış, `creator` tümü erişim, `mixed` `MIXED_CONTENT_MIX`. */
  contentMix: Readonly<ContentMix>;
  /**
   * Önerilecek CTA türleri (`CTA_TYPES`'tan alt küme, sıra = öncelik). `none` (CTA yok) öneri değildir, listede yer almaz.
   * Taksonomide karşılığı olmayan çağrılar `ctaExtras`'tadır.
   */
  ctaTypes: readonly CtaType[];
  /**
   * Taksonomide (`CTA_TYPES`) türü olmayan ama bu hesap türüne önerilen çağrılar (serbest Türkçe metin; sınıflayıcı/analiz etiketi DEĞİL, yalnız
   * öneri/istem metni). Taksonomiye eklenmedi: `CTA_TYPES` LLM çıktı şemasını, içgörü gruplarını ve sözleşme testlerini besler (versiyonlu).
   */
  ctaExtras: readonly string[];
}

const BUSINESS_CTA_TYPES: readonly CtaType[] = ["comment_keyword", "dm", "link_in_bio", "book_call"];
const CREATOR_CTA_TYPES: readonly CtaType[] = ["follow", "save_share"];
const CREATOR_CTA_EXTRAS: readonly string[] = ["Seri / “2. bölüm” vaadi", "Sohbet amaçlı yorum (izleyiciye soru)"];

export const ACCOUNT_TYPE_PROFILE: Readonly<Record<AccountType, AccountTypeProfile>> = {
  business: {
    label: "İşletme / koç",
    description: "Güven kurup müşteriye ve satışa ulaşmak isteyen işletme ya da koç hesabı.",
    purpose: "Güven → müşteri → satış: içerik güven kurmalı ve izleyiciyi yoruma, mesaja, bağlantıya ya da randevuya taşımalı.",
    matrices: ["angle_funnel"],
    appliesAngleLabeling: true,
    contentMix: { reach: 0, sales: 1 },
    ctaTypes: BUSINESS_CTA_TYPES,
    ctaExtras: [],
  },
  creator: {
    label: "İçerik üreticisi",
    description: "Satış yapmayan, erişim ve takipçi büyütmeyi amaçlayan içerik hesabı (tarih, bilim, mitoloji, gizem gibi).",
    purpose: "Erişim ve izlenme süresi: içerik sonuna kadar izletmeli, kaydettirmeli, paylaştırmalı ve takipçi kazandırmalı; satış hedefi yoktur.",
    matrices: ["topic_hook"],
    appliesAngleLabeling: false,
    contentMix: { reach: 1, sales: 0 },
    ctaTypes: CREATOR_CTA_TYPES,
    ctaExtras: CREATOR_CTA_EXTRAS,
  },
  mixed: {
    label: "Karma: hem erişim hem satış",
    description: "Bir şey satan ama içeriği hem erişim hem satış odaklı olan hesap: erişim içerikleri büyütür, satış içerikleri müşteriye taşır.",
    purpose:
      "Hem erişim hem satış: bir kısım içerik izlenme, kaydet/paylaş ve takipçi için (konu × hook), bir kısmı güven → müşteri → satış için (açı × farkındalık); her öneri hangi amaca hizmet ettiğini söylemeli.",
    matrices: ["angle_funnel", "topic_hook"],
    appliesAngleLabeling: true,
    contentMix: MIXED_CONTENT_MIX,
    ctaTypes: [...BUSINESS_CTA_TYPES, ...CREATOR_CTA_TYPES],
    ctaExtras: CREATOR_CTA_EXTRAS,
  },
};

/** Tür koruyucu: ham metin (DB sütunu, form değeri) desteklenen bir tür mü. */
export function isAccountType(value: unknown): value is AccountType {
  return ACCOUNT_TYPES.some((type) => type === value);
}

/** Ham değeri türe çevirir; boş/tanınmayan → `DEFAULT_ACCOUNT_TYPE` (DB sütunu zorunlu ve kontrollüdür: bu yalnız savunmadır). */
export function toAccountType(value: string | undefined | null): AccountType {
  return isAccountType(value) ? value : DEFAULT_ACCOUNT_TYPE;
}

export function accountTypeProfile(type: AccountType): AccountTypeProfile {
  return ACCOUNT_TYPE_PROFILE[type];
}

/** Ekran adı ("İşletme / koç", "İçerik üreticisi", "Karma: hem erişim hem satış"). */
export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_PROFILE[type].label;
}

/** Bu tür açı × farkındalık etiketlemesi uygular mı (`creator` → hayır; `business` ve `mixed` → evet). */
export function appliesAngleLabeling(type: AccountType): boolean {
  return ACCOUNT_TYPE_PROFILE[type].appliesAngleLabeling;
}

/** Bu türün kreatif matrisleri (ekran sırasıyla; karma ikisini de içerir). */
export function matrixKindsOf(type: AccountType): readonly MatrixKind[] {
  return ACCOUNT_TYPE_PROFILE[type].matrices;
}

/** Bu tür verilen matrisi kullanıyor mu (ör. konu kümeleme yalnız `topic_hook` kullanan türlerde koşar). */
export function usesMatrix(type: AccountType, kind: MatrixKind): boolean {
  return ACCOUNT_TYPE_PROFILE[type].matrices.includes(kind);
}

/**
 * `total` plan slotunu türün içerik karmasına böler (`reach + sales = total`): erişim payı yuvarlanır, kalan satışa gider. Tek amaçlı
 * türlerde tüm slotlar o amaca gider (`business` → hepsi satış). `total` negatif ya da tam sayı değilse programlama hatasıdır → fırlatır.
 */
export function splitPlanSlots(type: AccountType, total: number): { reach: number; sales: number } {
  if (!Number.isInteger(total) || total < 0) throw new RangeError(`Slot sayısı sıfır ya da pozitif tam sayı olmalı: ${total}`);
  const reach = Math.round(total * ACCOUNT_TYPE_PROFILE[type].contentMix.reach);
  return { reach, sales: total - reach };
}
