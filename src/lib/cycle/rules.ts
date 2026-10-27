/** Halka eşikleri: tek yerde. Değişirse yalnız burası değişir (`derive.test.ts` sınırları sınar). */
export const CYCLE_RULES = {
  /** Toplama bundan eskiyse (gün) yeniden toplama gerekir. */
  collectFreshDays: 7,
  /** Ölçüm bundan eskiyse (gün) yeniden ölçülür. */
  measureFreshDays: 1,
  /** Rakipsiz plana izin veren hesap türleri: izlenen rakip yoksa "rakip" adımı tamamdır (plan kendi tutanlarından öğrenir). */
  rivallessAccountTypes: ["creator"],
  /** Okuyucunun son iş geçmişi sınırı. */
  jobHistoryLimit: 60,
  /** Zincir: çalışma alanı başına günde en çok bu kadar zincir işi (UTC günü; zincirin açtığı işler sayılır). */
  chainDailyMax: 8,
} as const;
