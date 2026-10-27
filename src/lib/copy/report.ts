/**
 * Haftalık yol haritası raporunun (yazdırılabilir sayfa) SABİT metinleri; tek dosya, ileride çeviri buradan yapılır. Veriyle kurulan
 * cümleler (sayı, ad, gün) `lib/report`'tadır ve düz dil sözlüğünü (`lib/plain-language.ts`) kullanır. Panel jargonu yok; hesap/marka
 * adı gömülmez (ad ve @kullanıcıadı çalışma alanı verisinden gelir).
 */
export const REPORT_COPY = {
  documentTitle: "Haftalık yol haritası",
  /** Üst satırdaki tarih: "Hazırlandı: 12 Eki 2026". */
  preparedOn: (date: string) => `Hazırlandı: ${date}`,

  leadLabel: "Kısaca:",
  leadFallback: (count: string) => `Bu hafta ${count} video planlandı.`,

  directionsHeading: "Neye baktık, ne gördük",
  directionsIntro: "Son videolara baktık ve bu yönleri öne çıkardık.",
  directionRivals: (phrase: string) => `Benzer hesaplarda bu tarz videolar ${phrase}`,
  directionSample: (count: string) => `(${count} video)`,
  directionTried: "Sen bunu denedin.",
  directionNotTried: "Sen bunu henüz denemedin.",
  directionConfidence: (phrase: string) => `Ne kadar emin: ${phrase}.`,
  /** Süre grubu başlığı: "30–60 sn uzunluğunda videolar". */
  durationDirection: (label: string) => `${label} uzunluğunda videolar`,
  /** Videonun sonundaki adım grubu başlığı: "Sonunda yoruma kelime yazma". */
  endStepDirection: (phrase: string) => `Sonunda ${phrase}`,

  calendarHeading: "Haftanın takvimi",
  columnDay: "Gün",
  columnTime: "Saat",
  columnVideo: "Video",
  columnEndStep: "Sonundaki adım",
  slotMissing: "Saat belirlenmedi",
  nextDay: "ertesi gün",
  previousDay: "önceki gün",

  avoidHeading: "Şimdilik uzak dur",
  avoidSentence: (phrase: string, count: string) => `Bu tarz videolar ${phrase} (${count} video).`,

  reviewHeading: "Geçen hafta nasıl geçti",
  reviewIntro: (range: string) => `${range} haftasının planı:`,
  reviewNotMeasured: "Yayınlandı; sonuç henüz ölçülmedi.",
  reviewNotPublished: "Yayınlandığı henüz bilinmiyor.",
  reviewViews: (label: string, views: string) => `${label}: ${views} izlenme`,
  reviewDirectionLine: (title: string, held: string, missed: string) => `${title}: ${held} videoda tuttu, ${missed} videoda tutmadı.`,

  notesHeading: "Güncel notlar",

  videosHeading: "Videolar ve metinler",
  videoDuration: (text: string) => `yaklaşık ${text}`,
  labelOpening: "Açılış cümlesi",
  labelOtherOpenings: "Diğer seçenekler",
  labelScript: "Metin",
  labelOutline: "Çekim adımları",
  labelCaption: "Açıklama",

  footnote:
    "Bu öneriler gerçek izlenme verisine dayanır ama garanti değildir. Videolar yayınlandıktan bir hafta sonra sonuçlara bakıp sonraki haftanın planını ona göre güncelleriz. Metinler bir başlangıçtır; kendi sözlerinle değiştirmekte özgürsün.",
  footnoteFewSamples: "Elimizdeki örnek sayısı henüz az.",

  /** İki ekranda (Bu hafta, rapor sayfası) TEK ad: "PDF olarak kaydet". */
  printButton: "PDF olarak kaydet",
  printHint: "Açılan yazdırma penceresinde hedefi “PDF olarak kaydet” yap.",
  backToPanel: "Panele dön",
  pdfButton: "PDF olarak kaydet",
  pdfOpensNewTab: "(yeni sekmede açılır)",

  emptyTitle: "Bu hafta için plan henüz yok",
  emptyBody: "Planı yöneticin hazırlar; hazır olunca bu sayfada yazdırılabilir yol haritası olarak görünür.",
} as const;
