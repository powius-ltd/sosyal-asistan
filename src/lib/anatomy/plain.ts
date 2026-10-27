/**
 * Kreatif anatomisi ekranının MÜŞTERİYE görünen terimleri (saf; `lib/plain-language-results.ts` ile aynı kurallar): "hook" → "açılış
 * cümlesi", "CTA" → "çağrı (izleyiciden bir şey isteme)", "kohort" → "grup", "reçete" → "tutan videoların ortak özellikleri", "lift" →
 * "normaline göre". Alan etiketleri `domain/anatomy.ts`'te teknik adlarla durur (analist olgu paketi vb. onları okur); ekran bunlar yerine
 * bu sözlüğü kullanır. Yeni terim önce buraya girer.
 */
import type { AnatomyPhase, CtaPosition, RecipeCohortKey, RecipeMetric } from "@/lib/domain/anatomy";
import { OUTLIER_PLAIN } from "@/lib/plain-language";

/** Faz adı (zaman çizelgesi). */
export const PHASE_PLAIN: Record<AnatomyPhase, string> = {
  hook: "Açılış",
  intro: "Giriş",
  body: "Gövde",
  cta: "Çağrı",
};

/** Çağrının yeri (videonun bitişine göre). */
export const CTA_POSITION_PLAIN: Record<CtaPosition, string> = {
  last_5s: "Son 5 sn",
  "6_15s": "Sondan 6–15 sn önce",
  earlier: "Daha önce",
  none: "Çağrı yok",
};

/** Tutan videoların ortak özellikleri tablosunun gruplarının adı. */
export const RECIPE_COHORT_PLAIN: Record<RecipeCohortKey, string> = {
  winners: "Tutan videolar",
  other_rivals: "Diğer rakip videoları",
  own: "Kendi videoların",
};

/** Özellik adı (satır başlığı). */
export const RECIPE_METRIC_PLAIN: Record<RecipeMetric, string> = {
  hookWords: "Açılış cümlesi uzunluğu (kelime)",
  firstSectionSec: "Açılıştan sonra konuya geçiş (sn)",
  durationSec: "Süre (sn)",
  sectionCount: "Bölüm sayısı",
  cutsPerMinute: "Dakikadaki kesme sayısı",
  screenTextCount: "Ekran yazısı sayısı",
  onCameraShare: "Kamerada konuşan video payı",
  ctaShare: "İzleyiciden bir şey isteyen video payı",
};

export const ANATOMY_PLAIN = {
  title: "Videoların anatomisi",
  openingLibrary: "Açılış kütüphanesi",
  compare: "Karşılaştırma",
  emptyTitle: "İncelenmiş video yok",
  emptyFallback: "Videolar incelendikçe burada görünür.",
  summary: (days: string, analyzed: string, own: string, rivals: string, minTimes: string, winners: string): string =>
    `Son ${days} günde incelediğim ${analyzed} video (kendi ${own} · rakip ${rivals}); normalinin en az ${minTimes} izlenen (tutan): ${winners}.`,
  timeline: "Video zaman çizelgesi",
  pickerLabel: "İncelenmiş videolar",
  noCaption: "Alt yazı yok",
  own: "Kendi",
  rival: "Rakip",
  selected: {
    notFound: "Bu kimlikle bir video bulunamadı. Soldaki listeden bir video seç.",
    noAnalysis: "Bu videonun anatomisi çıkarılamadı: incelemesi yok ya da başarısız. İnceleme tamamlanınca burada görünür.",
    ownAccount: "Kendi hesap",
    open: "Video analizini aç",
    unverified: "Bu incelemenin alıntıları kaynakta doğrulanamadı; çizelge yine incelemedeki bölümlerden çıkarıldı, genel tablolara bu video dahil değil.",
    dimensionsTitle: "Bu videonun özellikleri",
    dimensionsHint: "Aşağıdaki tablolarda bu videonun hangi gruba girdiği ve o grubun normaline göre sonucu görünür.",
    editTitle: "Kurgu ölçümleri",
    noEdit: "Bu incelemede kurgu ölçümü yok.",
    duration: "Süre:",
    facts: { opening: "Açılış cümlesi uzunluğu", firstSection: "Açılıştan sonra konuya geçiş", cta: "Çağrının yeri", tempo: "Kurgu hızı", body: "Gövde türleri" },
    words: "kelime",
    cuts: "kesme/dk",
    noBody: "Gövde bölümü yok",
  },
  phases: {
    ariaLabel: "Faz çizelgesi",
    unknownTime: "zamanı bilinmiyor",
    unscaled: "Bazı bölümlerin zamanı ölçülemedi; çubuk süreyle orantılı değil, fazlar eşit genişlikte gösteriliyor.",
    noSections: "Bu incelemede bölüm yok.",
    screenText: "Ekran yazıları:",
  },
  recipe: {
    title: "Tutan videoların ortak özellikleri",
    description: (minTimes: string): string =>
      `Normalinin en az ${minTimes} izlenen videoların ortak özellikleri; diğer rakip videolarıyla ve kendi videolarınla yan yana. “Kendi videoların” sütunu kendi tutanlarını da içerir.`,
    empty: "Karşılaştıracak incelenmiş video yok.",
    noDifference: "Senin videoların ile tutan videoların farkını henüz hesaplayamadım: her iki grupta da en az 3 ölçülmüş video gerekir.",
    metric: "Özellik",
    videos: (n: string): string => `${n} video`,
    bodyShare: (type: string): string => `Gövdede ${type} payı`,
    ctaPositions: "Çağrının yeri (video sayısı)",
    ctaUnmeasured: "Çağrının yeri ölçülebilen video yok (süre ya da bölüm zamanı eksik).",
    sampleCount: (n: string): string => ` (${n} video)`,
    outlierDefinition: OUTLIER_PLAIN.definition,
  },
  dimensions: {
    openingLength: { title: "Açılış cümlesi uzunluğu", description: "Açılış cümlesinin kelime sayısı. Kısa mı uzun mu tutuyor?" },
    firstSection: { title: "Açılıştan sonra konuya geçiş", description: "Açılış bittikten sonra ilk bölümün başladığı an (açılışın kendi süresi değil, sonraki bölümün başlangıcı)." },
    body: { title: "Videonun ortası", description: "Videonun ortasında hangi bölümler var; her bölüm için olan ve olmayan videolar yan yana." },
    ctaPosition: { title: "Çağrının yeri", description: "İzleyiciden bir şey istemenin videonun neresinde geldiği (başladığı ana göre, videonun bitişine kaç saniye kala)." },
    tempo: { title: "Kurgu hızı", description: "Dakikadaki kesme sayısı (kurgu ölçümünden)." },
    openingType: { title: "Açılış tarzı", description: "Karşılaştırma ekranındaki açılış tarzı tablosuyla aynı veri (yalnız doğrulanmış incelemelerden)." },
    ctaType: { title: "İzleyiciden istediğin şey", description: "Açıklamadaki çağrının türü (Karşılaştırma ekranıyla aynı veri)." },
    duration: { title: "Süre", description: "Video süresi grupları (Karşılaştırma ekranıyla aynı veri)." },
  },
  present: { with: "var", without: "yok" },
} as const;

/** Gövde türü karışımı satırı: "Fikir / içgörü var". */
export const bodyMixPlain = (typeLabel: string, presence: string | undefined): string =>
  `${typeLabel} ${presence === "with" ? ANATOMY_PLAIN.present.with : ANATOMY_PLAIN.present.without}`;
