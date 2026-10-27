/**
 * Karar kuralı eşikleri: `DEFAULT_AD_RULES` (domain) + domain'de henüz olmayan R1 eşikleri (`EXTRA_AD_RULES`; domain dosyası R1'in değil,
 * bu yüzden burada adlandırılmış sabit olarak durur). Hepsi [V] başlangıç değeridir, veriyle sınanmadı. `rules?` ile ezilebilir.
 */
import { DEFAULT_AD_RULES } from "@/lib/domain/ads";

export const EXTRA_AD_RULES = {
  /** Öğrenme [V]: yayına gireli bu kadar günden azsa karar `learning`. */
  learningMinDays: 7,
  /** Öğrenme [V]: bu kadar sonuçtan azsa karar `learning`. */
  learningMinResults: 50,
  /** Sonuç kapısı [V]: harcama, hedef sonuç maliyetinin bu katından azsa (ve sonuç az) `stop` verilmez. */
  stopMinSpendTargetMultiple: 3,
  /** Güven [V]: yüksek için en az sonuç / gün. */
  confidenceHighResults: 50,
  confidenceHighDays: 14,
  /** Güven [V]: orta için en az sonuç / gün. */
  confidenceMediumResults: 10,
  confidenceMediumDays: 7,
  /** Güven [V]: bundan az gösterimle güven düşük. */
  confidenceMinImpressions: 1000,
  /**
   * Yorgunluk [V]: GÜNLÜK görülme sıklığının (gösterim ağırlıklı, son 7 gün) eşiği. `fatigueFrequencyMin` (3,0) dönem sıklığının (erişim
   * tabanlı, kümülatif) eşiğidir; günlük satırda sıklık = o günün gösterimi / erişimi ve sağlıklı reklamda ~1,0–1,3 çıkar, 3,0 hiç aşılmaz.
   * Erişim günler arasında toplanamaz (aynı kişi tekrar sayılır), dönem sıklığı günlük satırdan KURULAMAZ; bu yüzden ayrı, düşük eşik.
   * Değer (1,5) veriyle sınanmadı: gerçek hesap verisiyle ayarlanmalı. Yorgunluk yine tıklama oranı düşüşüyle birlikte aranır.
   */
  fatigueDailyFrequency: 1.5,
} as const;

export type AdRules = { [K in keyof typeof DEFAULT_AD_RULES | keyof typeof EXTRA_AD_RULES]: number };

/** Varsayılan eşikler üstüne hesap başına ezmeler. */
export function resolveAdRules(overrides?: Partial<AdRules>): AdRules {
  return { ...DEFAULT_AD_RULES, ...EXTRA_AD_RULES, ...overrides };
}
