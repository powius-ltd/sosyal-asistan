/**
 * "Otomatik" ekranının SABİT metinleri (tek dosya). Panel jargonu yok (`lib/plain-language.ts` `PANEL_JARGON`; `automation/model.test.ts` tarar).
 */
export const AUTOMATION_COPY = {
  title: "Otomatik işler",
  description: "Panelin senin yerine kendiliğinden yaptığı işler. Her birini açıp kapatabilirsin.",
  rows: {
    weekly_plan: { name: "Haftalık plan", does: "Yeni videolarını toplar, inceler ve yeni haftanın planını çıkarır.", money: "Veri toplama para harcar; aylık tavanın içinde kalır." },
    daily_measure: { name: "Günlük ölçüm", does: "Bağlı hesabından videolarının sayılarını okur.", money: "Para harcamaz." },
    produce: { name: "Onayladığın fikri üret", does: "Planı onaylayınca fişi stüdyoya gönderir ve videoyu üretir.", money: "Seslendirme için para harcar." },
    share: { name: "Onayladığın videoyu paylaş", does: "Onayladığın video seçtiğin saatte kendiliğinden paylaşılır.", money: "Para harcamaz." },
  },
  state: { on: "Açık", off: "Kapalı", always: "Hep açık", soon: "Yakında" },
  last: { label: "Son çalışma", never: "Henüz çalışmadı.", running: "Şu an çalışıyor.", queued: "Sırada bekliyor." },
  next: {
    label: "Sıradaki",
    off: "Kapalı · açarsan",
    nextDailyRun: "Bir sonraki günlük turda.",
    dueAt: "Günlük turda, en erken",
    tomorrow: "Yarın, günlük turda.",
    today: "Bugün, günlük turda.",
    afterPlanApproval: "Planı onaylayınca.",
    atScheduledTime: "Onayladığın videonun saatinde.",
    soon: "Bu özellik yakında gelecek.",
  },
  notes: {
    noCap: "Aylık harcama tavanı onaylı değil; plan için veri toplanamaz. Tavanı Ayarlar'dan ver.",
  },
  toggle: { on: "Aç", off: "Kapat", failed: "Ayar kaydedilemedi.", saved: "Ayar kaydedildi." },
  summary: { plan: "Plan", planNext: "sıradaki turda", measure: "ölçüm her gün", produce: "üretim plan onayında", allOff: "Hepsi kapalı" },
  last2: { prefix: "Son:", sep: "·" },
  closed: "Bu ortamda ayarlar değiştirilemez; yalnız görebilirsin.",
} as const;
