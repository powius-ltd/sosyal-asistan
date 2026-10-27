/**
 * Giriş ekranının (müşteri kopyasının açılış sayfası) SABİT metinleri: 7 adımlı hat + haftanın videoları. Panel jargonu yok
 * (`lib/plain-language.ts` `PANEL_JARGON`; `entry.test.ts` tarar). Sohbet mesajları Asistan'a kullanıcı yerine yazılır: doğal cümledir.
 */
export const ENTRY_COPY = {
  title: "Bugün",
  lineHeading: "Bu haftanın yolu",
  stepNames: { analyze: "Analiz", plan: "Plan", approve: "Onayın", script: "Senaryo", produce: "Üretim", share: "Paylaşım", track: "Takip" },
  /** Dar ekrandaki kısa ad (7 sütuna sığsın); verilmeyen adım tam adla yazılır. */
  stepShort: { share: "Paylaş" } as Partial<Record<string, string>>,
  stateLabels: { done: "Tamamlandı", active: "Sıra sende", running: "Arka planda sürüyor", waiting: "Bekliyor" },
  reasons: {
    analyze: { done: "Rakipler ve senin videoların incelendi.", running: (detail: string) => `Kendiliğinden sürüyor: ${detail}` },
    plan: { done: "Bu haftanın planı hazır.", running: "Plan hazırlanıyor.", missing: "Bu hafta için plan henüz yok." },
    approve: { active: (count: number) => `${count} videoya karar ver: sen mi çekersin, biz mi yapalım?`, waiting: "Önce plan hazır olsun." },
    script: { active: "Senaryoyu oku; değişiklik varsa Asistan'a söyle.", waiting: "Önce videolara karar ver." },
    produce: { active: "Video hazırlanıyor.", waiting: "Önce senaryo hazır olsun." },
    share: { active: "Video hazır; paylaşabilirsin.", waiting: "Önce video hazırlansın." },
    track: { running: "Paylaşılan videoların sonucu izleniyor.", waiting: "Paylaşınca sonucu biz izleriz." },
  },
  /** Asistan'a gönderilecek doğal cümleler. */
  chat: {
    plan: "Bu haftanın planını çıkar",
    change: "Bu haftanın planında değiştirmek istediğim bir şey var.",
    discuss: (title: string) => `"${title}" fikrini konuşalım: neden bu, nasıl çekerim?`,
    script: (title: string) => `"${title}" senaryosunda değişiklik istiyorum.`,
  },
  card: {
    heading: "Bu haftanın videoları",
    lead: "Planı senin ve rakiplerinin tutan videolarına bakarak kurdum. Her videonun nedeni altında.",
    empty: "Bu hafta için henüz video yok.",
    change: "Değiştirmek istediğin bir şey var mı?",
    changeButton: "Asistan'a söyle",
    why: "Planın tüm nedenleri",
    when: "Paylaşım",
    stage: { approve: "Kararını bekliyor", script: "Senaryo", produce: "Üretimde", share: "Paylaşıma hazır", track: "Paylaşıldı" },
    actions: {
      ugc: "Ben çekerim",
      studio: "Siz yapın",
      discuss: "Konuşalım",
      openScript: "Senaryoyu aç",
      changeScript: "Değiştir",
      openTicket: "Fişi aç",
      results: "Sonucu gör",
    },
    choiceHint: "Ben çekerim: kendin kameraya çekersin. Siz yapın: animasyonla biz hazırlarız.",
    chosen: { ugc: "Sen çekeceksin", studio: "Biz yapacağız" },
    failed: "Kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
    chatUnavailable: "Asistan şu an kapalı; birazdan yeniden dene.",
  },
  details: { heading: "Ayrıntılar", plan: "Planın tamamı", ideas: "Tüm fikirler", results: "Sonuçlar" },
} as const;
