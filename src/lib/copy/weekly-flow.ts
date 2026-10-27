/**
 * Haftalık akış şeridinin SABİT metinleri (tek dosya: ileride çeviri buradan yapılır). Panel jargonu yok
 * (`lib/plain-language.ts` `PANEL_JARGON`; `weekly-flow.test.ts` tarar). Sohbet mesajları Asistan'a kullanıcı yerine yazılır:
 * doğal cümledir.
 */
export const WEEKLY_FLOW_COPY = {
  heading: "Bu haftanın işi",
  stepNames: { collect: "Topla", analyze: "İncele", plan: "Plan", select: "Seç", ticket: "Fiş" },
  /** Asistan'a gönderilecek doğal cümleler. */
  chat: {
    collect: "Yeni verileri topla",
    analyze: "Yeni videoları incele",
    plan: "Bu haftanın planını çıkar",
    select: "Bu hafta hangi fikri çekmeliyim?",
    ticket: "Seçtiğim fikrin fişini hazırla",
  },
  actionLabels: { openPlan: "Planı aç", askAssistant: "Asistan'a sor" },
  chatUnavailable: "Asistan şu an kapalı; birazdan yeniden dene.",
  stateLabels: { done: "Tamamlandı", active: "Sıra sende", waiting: "Bekliyor", blocked: "Okunamadı" },
  reasons: {
    collect: {
      done: "Veriler yeni.",
      running: "Yeni veriler toplanıyor.",
      stale: "Veriler eskidi; yenisini toplayalım.",
      never: "Henüz veri toplanmadı.",
      unreadable: "Verilerin ne kadar yeni olduğunu şu an okuyamadım.",
    },
    analyze: {
      done: "Videolar incelendi.",
      running: "Videolar inceleniyor.",
      pending: (count: number) => `${count} video inceleme bekliyor.`,
      waiting: "Önce yeni veriler gelsin.",
      unreadable: "İnceleme durumunu şu an okuyamadım.",
    },
    plan: {
      done: "Bu haftanın planı hazır.",
      running: "Plan hazırlanıyor.",
      missing: "Bu hafta için plan henüz yok.",
      waiting: "Önce videolar incelensin.",
      unreadable: "Planı şu an okuyamadım.",
    },
    select: {
      done: (count: number) => (count === 1 ? "1 fikir seçildi." : `${count} fikir seçildi.`),
      missing: "Bu hafta hangi fikri çekeceğini seç.",
      waiting: "Önce plan hazır olsun.",
    },
    ticket: {
      done: "Seçtiğin fikirlerin fişi hazır.",
      missing: (count: number) => (count === 1 ? "Seçtiğin fikrin fişi henüz yok." : `Seçtiğin ${count} fikrin fişi henüz yok.`),
      waiting: "Önce bir fikir seç.",
      unreadable: "Fişleri şu an okuyamadım.",
    },
  },
} as const;
