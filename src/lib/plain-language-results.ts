/**
 * Sonuçlar'ın "Neye dayanıyorum" ekranlarının (Tutanlar, Açılış kütüphanesi, Karşılaştırma) MÜŞTERİYE görünen terimleri — düz dil
 * sözlüğünün (`plain-language.ts`) bu ekranlara ayrılmış bölümü (`plain-language-plan.ts` ile aynı desen; ana dosya 400 satıra yakın
 * olduğundan ayrı dosya). Kural aynıdır: ekranda panel jargonu (`PANEL_JARGON`) yok; cümleler ana sözlükten türer (`liftPhrase`,
 * `CONFIDENCE_PLAIN`, `OUTLIER_PLAIN`, `PLAIN_TERMS`). Kararlar: "Hook" → "açılış cümlesi", lift / baz çizgisi / medyan / kademe →
 * "normalinin N katı", açı → "yaklaşım", farkındalık → "izleyici". Yeni terim önce buraya girer. Anatomi ve harita terimleri
 * `lib/anatomy/plain.ts` ve `lib/matrix/plain.ts`'tedir (bu dosyadan türer). Saf (sunucu/istemci); hesap/marka adı gömülmez.
 */
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER, type LiftTier } from "@/lib/domain/content";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { DATA_QUALITY_LABEL, type DataQualityKind, type InsightSection } from "@/lib/domain/insights";
import { formatCompact, formatDecimal, formatNumber } from "@/lib/format";
import { CONFIDENCE_PLAIN, liftPhrase, OUTLIER_PLAIN, PLAIN_TERMS } from "@/lib/plain-language";
import { upperFirst } from "@/lib/plain-language-plan";

// ------------------------------------------------------------------- Ortak

/** "Normalinin 3 katı" için çarpan: tam sayı tam, değilse tek ondalık ("1,5 katı", "3 katı"). */
export const timesText = (factor: number): string => `${Number.isInteger(factor) ? formatNumber(factor) : formatDecimal(factor, 1)} katı`;

/** Kademenin alt sınırı, çarpan olarak: `tierTimes(1)` → "1,5 katı". */
export const tierTimes = (tier: LiftTier): string => timesText(LIFT_TIER_MIN[tier]);

/** "Lift" sütunu / etiketi yerine: sonucun normaline göre katı. */
export const VS_NORMAL = {
  column: "Normaline göre",
  hint: "Videonun izlenmesi, o hesabın tipik videosunun kaç katı. 1 kat = normal.",
  sortDesc: "Normaline göre (çoktan aza)",
} as const;

/** Lift rozeti balonu: kademenin düz adı. */
export const LIFT_TIER_PLAIN: Record<LiftTier, string> = {
  0: `Normal düzeyde (normalinin ${tierTimes(1)} altında)`,
  1: `Normalin üstünde (${tierTimes(1)} ve üstü)`,
  2: `İyi (${tierTimes(2)} ve üstü)`,
  3: `Tutan (${tierTimes(3)} ve üstü)`,
  4: `Çok tutan (${tierTimes(4)} ve üstü)`,
};

/** Rozet balonu: "Tutan (3 katı ve üstü) · normalde yaklaşık 11,3 B izleniyor". */
export const liftBadgeHint = (tier: LiftTier, baselineViews: number | undefined): string => {
  const baseline = formatCompact(baselineViews);
  return baseline === undefined ? LIFT_TIER_PLAIN[tier] : `${LIFT_TIER_PLAIN[tier]} · normalde yaklaşık ${baseline} izleniyor`;
};

/** Rozetin ekran okuyucu adı: "Normalinin 4,6 katı izlendi". */
export const liftBadgeLabel = (lift: number): string => upperFirst(liftPhrase(lift) ?? "Normaline göre ölçülemedi");

/** Tirenin yanında görünen kısa nedenler (tam sebep balonda). */
export const SHORT_REASON_PLAIN = { noBaseline: "normali yok", noData: "veri yok", platformGaveNone: "platform vermedi", unknown: "bilinmiyor", notComputable: "hesaplanamadı" } as const;

export const LIFT_UNMEASURED_PLAIN = "Normalini hesaplayamadım: bu hesapta yeterli geçmiş video ya da izlenme verisi yok.";

/** Düşük güven ikonunun balonu: "Az örnek, emin değilim: …". */
export const lowConfidenceHint = (baselineN: number | undefined): string =>
  `${upperFirst(CONFIDENCE_PLAIN.low)}: normalini ${baselineN !== undefined ? `yalnız ${formatNumber(baselineN)}` : "az sayıda"} videoya bakarak hesapladım (en az 10 gerekir).`;

export const LOW_CONFIDENCE_LABEL = upperFirst(CONFIDENCE_PLAIN.low);
export const IMMATURE_HINT = "Video çok yeni: izlenmesi henüz oturmadı, bu sayı değişebilir.";
export const IMMATURE_LABEL = "Yeni video";

/** Sayfa gezinmesi (Tutanlar ve Açılış kütüphanesi ortak). */
export const PAGER_PLAIN = { previous: "Önceki sayfa", first: "İlk sayfa", next: "Sonraki sayfa", label: "Sayfalama" } as const;

/** Tablo dar ekranda yana kayıyorsa görünen ipucu. */
export const SCROLL_HINT_PLAIN = "Yana kaydırarak devamını gör";

/** Seçilemeyen (yakında) seçenek eki. */
export const COMING_SOON_PLAIN = "yakında";

// ---------------------------------------------------------------- Tutanlar

/** "İzlenme / takipçi" ipucu: çapraz skor formülü ekrana girmez. */
export const VIEWS_PER_FOLLOWER_PLAIN = {
  label: "İzlenme / takipçi",
  ariaLabel: "İzlenme takipçi oranı nedir",
  hint: "İzlenmenin takipçi sayısına oranı. %100, videonun takipçi sayısı kadar izlendiği demektir; büyük hesapla küçük hesabı kıyaslamayı kolaylaştırır. “Hesabın büyüklüğüne göre” sıralaması bu oranı hesabın boyuyla birlikte tartar.",
} as const;

export const OUTLIERS_PLAIN = {
  title: "Tutan içerikler",
  /** Eşik tutan düzeyinin altına indirilince başlık doğru kalsın ("Tutan içerikler" demez). */
  titleLowered: "Normalinin üstündeki içerikler",
  description: (tier: LiftTier): string =>
    tier >= OUTLIER_MIN_TIER
      ? "Rakiplerin kendi normalinin çok üstünde izlenen videoları."
      : `Rakiplerin normalinin en az ${tierTimes(tier)} izlenen videoları; hepsi “tutan” sayılmaz.`,
  explainer: `${OUTLIER_PLAIN.sentence} “Normali”, o hesabın son 25 videosunun tipik izlenmesidir.`,
  filters: {
    platform: "Platform",
    format: "Biçim",
    tier: "Normalinin en az",
    days: "Tarih",
    sort: "Sıralama",
    similar: "Yalnız benim boyumdaki hesaplar",
    lowConfidence: "Emin olmadığım ölçümleri gizle",
    immature: "3 günden yeni videoları gizle",
  },
  tierOption: (tier: LiftTier): string => tierTimes(tier),
  sort: { lift: VS_NORMAL.sortDesc, cross: "Hesabın büyüklüğüne göre", recent: "En yeni" },
  columns: { content: "İçerik", account: "Hesap", views: "İzlenme", published: "Yayın tarihi", save: "Kaydet" },
  noCaption: "Alt yazı yok",
  filteredEmpty: { title: "Bu filtrelere uyan tutan video yok", body: "Filtreleri gevşetmeyi dene: “Normalinin en az” değerini düşür, tarih aralığını genişlet ya da gizleme seçeneklerini kapat." },
  empty: { title: "Henüz tutan video yok", body: "Rakip ekleyip videoları toplandıkça normalinin çok üstünde izlenenler burada listelenir." },
  clearFilters: "Filtreleri temizle",
  goCompetitors: "Rakiplere git",
  analysis: "Video analizi",
} as const;

// ------------------------------------------------------- Açılış kütüphanesi

/** Açılış tarzının kısa adı (rozet, sütun başlığı). Bilinmeyen anahtar `hookTypeLabel` yedeğiyle okunur. */
const OPENING_TYPE_SHORT = new Map<string, string>([
  ["question", "Soru"],
  ["list", "Liste"],
  ["confession", "İtiraf"],
  ["shock_stat", "Şaşırtıcı rakam"],
  ["pov", "Sahnenin içine alan"],
  ["mistake_warning", "Hata uyarısı"],
  ["comparison", "Karşılaştırma"],
  ["barrier_removal", "Çekince kaldıran"],
  ["bold_claim", "Cesur iddia"],
  ["story_open", "Hikaye"],
  ["callout", "Doğrudan seslenen"],
  ["affirmation", "Olumlayıcı"],
  ["teaching_quote", "Öğreti / alıntı"],
]);

export const openingTypeLabel = (key: string): string => OPENING_TYPE_SHORT.get(key) ?? hookTypeLabel(key);

export const OPENINGS_PLAIN = {
  title: "Açılış kütüphanesi",
  description: "Videoların açılış cümleleri, kaynağı ve tarzı: videodaki metinden birebir alıntı, yalnız doğrulanabilen incelemelerden.",
  info: "Açılış cümleleri video incelemesinden gelir; yalnız incelemesi tamamlanan ve alıntısı doğrulanan videolar girer.",
  empty: {
    title: "Henüz açılış cümlesi yok",
    body: "Kütüphane, incelemesi tamamlanan videolardan dolar: açılış cümlesi videodan birebir alınır ve doğrulanırsa buraya girer. İnceleme henüz yapılmadıysa, olmadıysa ya da konuşma ve ekran yazısı 8 kelimeden azsa (müzik, sessiz video) video girmez.",
  },
  filteredEmpty: { title: "Bu süzgece uyan açılış cümlesi yok", body: "Aramayı ya da filtreleri gevşetmeyi dene." },
  stats: {
    title: "Açılış tarzlarına göre",
    description: "Tarz adına tıklayınca liste o tarza süzülür. “Normaline göre”: o tarzdaki videoların tipik sonucu.",
    style: "Tarz",
    count: "Adet",
    filterBy: (label: string): string => `${label} tarzına süz`,
    clear: "Süzgeci kaldır",
  },
  filters: {
    search: "Ara",
    placeholder: "Açılış cümlesi, hesap ya da tarz",
    searchButton: "Ara",
    type: "Açılış tarzı",
    allTypes: "Tüm tarzlar",
    tier: "Normalinin en az",
    allTiers: "Hepsi",
    source: "Kaynak",
    sort: "Sıralama",
    own: "Yalnız kendi",
    rivals: "Yalnız rakip",
    both: "Kendi + rakip",
    recent: "En yeni",
  },
  evidence: "Tarzın dayanağı",
  copy: "Açılış cümlesini kopyala",
  own: "Kendi",
  rival: "Rakip",
  total: (total: string | undefined, shown: string): string => (total ? `Toplam ${total} açılış cümlesi · bu sayfada ${shown}` : `Bu sayfada ${shown} açılış cümlesi`),
  unknownDate: "Yayın tarihi bilinmiyor.",
} as const;

// ------------------------------------------------------------- Karşılaştırma

/** Karşılaştırma tablosundaki ölçü satırları (kimlik → ad + ipucu). "Medyan lift" satırı yok: hesap kendi normaline kıyaslandığı için hep ~1. */
export const COMPARISON_METRIC_PLAIN = {
  followers: { label: "Takipçi" },
  videos: { label: "Kısa video", hint: "Pencerede yayınlanan kısa video sayısı." },
  medianViews: { label: "Tipik izlenme", hint: "Videoların yarısının üstünde, yarısının altında kaldığı izlenme; hesabın en çok kullandığı izlenme türüne bakılır." },
  viewsPerFollower: { label: "İzlenme / takipçi", hint: "Tipik izlenme ÷ takipçi: videoların takipçi dışına ne kadar eriştiği." },
  outliers: { label: "Tutan video", hint: OUTLIER_PLAIN.sentence },
  duration: { label: "Tipik süre" },
  postsPerWeek: { label: "Haftalık paylaşım", hint: "Haftada ortalama kaç video: ilk ile son paylaşım arasına göre; en az 2 tarihli video gerekir." },
  daysSince: { label: "Son paylaşımdan bu yana" },
  commonHours: { label: "En sık paylaşım saatleri", hint: "Hedef kitlenin saat diliminde; gün ayrımı yok." },
  commentAsk: { label: "Yorum isteyen video payı", hint: "Yorum yazmanı isteyen videoların, açıklaması olan videolara oranı." },
  hashtags: { label: "Etiket alışkanlığı" },
  quality: { label: "Veri kalitesi" },
} as const;

/** Veri kalitesi rozetleri: domain sözlüğü (`DATA_QUALITY_LABEL`) zaten düz dildir, ezme yok. */
export const DATA_QUALITY_PLAIN: Record<DataQualityKind, string> = DATA_QUALITY_LABEL;

/** Karşılaştırma bölümlerinin adı (hesaplanamayanlar listesinde). */
export const INSIGHT_SECTION_PLAIN: Record<InsightSection, string> = {
  comparison: "Karşılaştırma tablosu",
  duration_buckets: "Hangi süre tutuyor",
  cta_types: "İzleyiciden istediğin şey",
  hook_types: "Hangi açılış tarzı tutuyor",
  posting: "Paylaşım saati ve sıklığı",
  hashtags: "Etiket alışkanlığı",
  voice: "Marka sesi",
  similar_size: "Senin boyundaki rakipler",
};

export const COMPARISON_PLAIN = {
  title: "Karşılaştırma",
  description: "Kendi hesabın ile izlediğin rakiplerin yan yana görünümü: erişim, süre, paylaşım sıklığı ve saati, izleyiciden istediğin şey, açılış tarzı, veri kalitesi.",
  empty: { title: "Karşılaştırılacak hesap yok", body: "Kendi hesabın ve en az bir izlenen rakip olduğunda, veri toplandıkça bu ekran dolar." },
  table: { title: "Sen ve rakipler", metric: "Ölçü", you: "Sen", rival: "Rakip", platforms: "Platform" },
  tableDescription: (days: string, zone: string): string => `Son ${days} günün kısa videoları · saat dilimi ${zone}.`,
  groups: {
    duration: { title: "Hangi süre tutuyor", description: "Hangi süredeki videolar normalinin üstüne çıkıyor." },
    cta: { title: "İzleyiciden istediğin şey", description: "Açıklamadaki çağrının türüne göre sonuç (açıklamadan kurala göre ayırdım)." },
    opening: { title: "Hangi açılış tarzı tutuyor", description: "Yalnız doğrulanmış incelemelerden; incelenmemiş video bu tabloya girmez." },
  },
  group: { name: "Grup", own: "Kendi hesap", rivals: "Rakipler", videos: "Video", outliers: "Tutan", confidence: "Güven" },
  measured: (n: string): string => ` (${n} ölçülü)`,
  noVideoThisSide: "Bu grupta bu taraftan video yok.",
  outliersUnmeasured: "Normali hesaplanan video yok; tutan sayısı bilinmiyor.",
  groupEmpty: "Bu bölüm için yeterli veri yok.",
  similar: {
    title: "Senin boyundaki rakipler",
    description: "Takipçi sayısı seninkinin üçte biri ile üç katı arasındaki rakipler; erişimi en çok bunlarla kıyaslamak anlamlı. Senin takipçi sayın:",
    ownUnknown: "Kendi takipçi sayını alamadım; bu yüzden senin boyundaki rakipleri hesaplayamadım.",
    none: "Senin boyundaki izlenen rakip yok. Erişim oranlarını okurken bunu hesaba kat.",
    count: (n: string): string => `${n} rakip:`,
  },
  unmeasured: {
    title: "Hesaplayamadıklarım",
    description: "Yeterli veri olmadığı için hesaplayamadığım bölümler ve sebepleri.",
    none: "Tüm bölümleri hesapladım. Tabloda “—” görünen yerde o hesap için veri yok; sebebi üzerine gelince yazar.",
    fallback: "Bu bölüm için yeterli veri yok.",
  },
  qualityNone: "Sorun yok",
  rowsPlatform: (platformLabel: string): string => `${platformLabel} hesapları`,
} as const;

/** Sebep metni panel jargonu taşımıyorsa olduğu gibi, taşıyorsa yedek cümleyle (`plain-language-plan.ts` `plainOrFallback` ile aynı kural). */
export { plainOrFallback } from "@/lib/plain-language-plan";

/** Kısa yol: "tutan" terimi ve tipik değer sözcüğü ana sözlükten. */
export const TERMS_PLAIN = { typical: PLAIN_TERMS.median.say, outlier: OUTLIER_PLAIN.name } as const;
