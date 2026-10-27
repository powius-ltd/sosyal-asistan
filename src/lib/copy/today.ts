/**
 * "Bugün" ekranının SABİT metinleri (tek dosya: ileride çeviri buradan yapılır). Verilerle kurulan cümleler (sayı, ad) `lib/home`
 * ve `lib/today`'dedir ve metinlerini buradan alır; panel jargonu yok (`lib/plain-language.ts` sözlüğü geçerli).
 */
export const TODAY_COPY = {
  /** Karar bloğunun etiketi: sarı yalnız bu. */
  turnLabel: "Sıra sende",
  /** Zamanı olan kartta saatin altındaki açıklama. */
  dueCaption: { shoot_next: "yayın saati", approve_publish: "planlanan yayın" } as Record<string, string>,
  dueFallbackCaption: "planlanan zaman",
  /** Karar bloğunda "neden" bağlantısı satırı. */
  whyLabel: "Neden?",
  /** Sessiz liste. */
  laterHeading: "Sonra",
  /** Karar yok. */
  clearHeading: "Bugünlük bu kadar",
  /** Hafta şeridi. */
  weekHeading: "Bu hafta",
  weekOpenPlan: "Planı aç",
  weekAria: "Haftanın günleri",
  weekNoPlan: "Bu hafta için plan henüz yok.",
  weekUnreadable: "Planı şu an okuyamadım.",
  weekUnplaced: (count: number) => `${count} içeriğin günü belli değil; Plan'da görürsün.`,
  weekEmptyDay: "boş gün",
  weekNextChip: "Sırada",
  /** Cümleli rakamlar. */
  tilesHeading: "Senin için baktıklarım",
  tilesAria: "Senin için baktıklarım",
  /** Videolar kartı. */
  videosHeading: "Videoların",
  videosWaiting: (count: number) => (count === 1 ? "1 video onayını bekliyor" : `${count} video onayını bekliyor`),
  videoWaitingChip: "Onayını bekliyor",
  videoFallbackTitle: "Yayın bekleyen video",
  videoRoadLabel: "Videonun yolu",
  videoRoad: ["Hazırlandı", "Onayın", "Yayın"] as const,
  videoHint: "izle, uygunsa onayla",
  /** Ayrıntılara geçiş. */
  detailsLink: "Sayılar, grafikler ve son tutan videolar",
  detailsAria: "Ayrıntılar",
} as const;
