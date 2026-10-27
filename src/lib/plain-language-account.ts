/**
 * Hesap / rakip / ayar ekranlarının düz dil karşılıkları (Dalga 3, D3-02/06/09/18). Yeni terimler burada durur; ana sözlük
 * (`plain-language.ts`) yalnız içe aktarılır, kopyalanmaz. Saf (sunucu/istemci); hesap/marka adı gömülmez.
 */
import type { MatrixKind } from "@/lib/domain/account-type";
import { CONFIDENCE_PLAIN, OUTLIER_PLAIN } from "@/lib/plain-language";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { formatNumber } from "@/lib/format";

// ------------------------------------------------------------- Saat dilimi

const TIME_ZONE_PLAIN: Readonly<Record<string, string>> = {
  "Europe/Istanbul": "İstanbul saati",
  UTC: "UTC saati",
};

/** Saat diliminin müşteri adı: "Europe/Istanbul" → "İstanbul saati"; bilinmeyen "Europe/Berlin" → "Berlin saati". */
export function timeZonePlain(timeZone: string): string {
  const known = TIME_ZONE_PLAIN[timeZone];
  if (known) return known;
  const city = timeZone.split("/").pop()?.replaceAll("_", " ");
  return city ? `${city} saati` : timeZone;
}

// ------------------------------------------------------------ Haftalık özet

export const DIGEST_PLAIN = {
  topOwnHint: "En çok izlenen 3",
  /** Açılış rozeti: "Açılış: Soru". */
  hookBadge: (label: string): string => `Açılış: ${label}`,
  noTopOwn: "Bu hafta yeni içerik yayınlanmadı ya da henüz izlenme karşılaştırması yapılamadı.",
  noRivalOutlierTitle: "Bu hafta tutan rakip içeriği çıkmadı",
  noRivalOutlierBody:
    `İzlediğin rakiplerden ${OUTLIER_PLAIN.definition} yeni içerik yok. Rakip yeni içerik yayınlamadıysa ya da içerik henüz ` +
    "yeterince izlenmediyse liste boş kalır; bu bir veri hatası değildir. Daha çok tutan içerik yakalamak için izlediğin rakip " +
    "sayısını artırabilirsin.",
  sendNote: "Şimdilik özet yalnız burada görünür; e-posta ve Telegram ile gönderim yakında.",
} as const;

/** "4 içerik planda, 3 yedek · kısmen eminim"; sayı okunamazsa yalnız okunan kısım. */
export function digestPlanLine(plan: { plannedCount: number; alternativeCount: number; confidence?: ConfidenceLevel }): string {
  const planned = `${formatNumber(plan.plannedCount) ?? "0"} içerik planda`;
  const spare = plan.alternativeCount > 0 ? `, ${formatNumber(plan.alternativeCount)} yedek` : "";
  const confidence = plan.confidence ? ` · ${CONFIDENCE_PLAIN[plan.confidence]}` : "";
  return `${planned}${spare}${confidence}`;
}

// ----------------------------------------------------------- Rakip eylemleri

export const RIVAL_PLAIN = {
  watch: "İzle",
  /** Yoksayılmış hesabı yeniden izlemeye almak ("İzle" geri alma gibi okunuyordu; D3-17). */
  rewatch: "Yeniden izle",
  ignore: "Yoksay",
  undo: "Geri al",
  undone: (handle: string): string => `@${handle} eski durumuna döndü.`,
  /** Kendi hesabını rakip yapma girişimi. */
  ownHandle: "Bu senin kendi hesabın; rakip olarak eklenemez.",
  /** Rakip ekleme penceresinde müşteriye söylenen süre cümlesi (tutar / sağlayıcı yok; yönetici görünümü ayrı). */
  addWait: "Eklenince ilk bakış birkaç dakika sürer; hazır olunca Rakipler'de görürsün.",
} as const;

// ------------------------------------------------------------------ Ayarlar

export const SETTINGS_PLAIN = {
  /** Müşteri görünümünde ayar bölümü başlığı ("Workspace ayarları" yönetici içindir). */
  sectionTitle: "Hesap ayarları",
  operatorSectionTitle: "Workspace ayarları",
  /** Niş tanımının yardım cümlesi: LLM değil "ben" (birinci tekil ton). */
  nicheHelp: "Konu seçerken ve fikir üretirken bu metne bakarım: neyin senin nişine uyduğunu burada anlat.",
  /** Saat dilimi alanı devre dışı: nedeni yazılı (D3-18). */
  timeZoneLocked: "Şimdilik değiştirilemez; hesap açılırken belirlenir. Tarihler ve gün sınırları bu saate göre hesaplanır.",
  contentLanguageHelp:
    "Açılış cümlesi, senaryo ve açıklama taslağı bu dilde yazılır; gerekçe ve başlıklar Türkçe kalır. Otomatik: kendi videolarının konuşma dilinin çoğunluğu, yoksa uyum bölgesi.",
  /** Bağlantı kartı: platform notları (müşteri). Yönetici notları "Faz" yazar. */
  connectNote: {
    instagram: "Resmi Instagram girişiyle bağlanır: kendi verilerin ve onaylı yayın için.",
    tiktok: "TikTok bağlantısı yakında.",
    youtube: "YouTube Shorts bağlantısı yakında.",
  },
  connectNoteOperator: {
    instagram: "Resmi Instagram Login (OAuth) ile bağlanır: kendi analitiğin ve onaylı yayın için.",
    tiktok: "TikTok bağlantısı sonraki fazda (Faz 4) gelecek.",
    youtube: "YouTube Shorts bağlantısı sonraki fazda (Faz 4) gelecek.",
  },
  connect: "Bağla",
  reconnect: "Yeniden bağla",
  /** Bağla / Yeniden bağla düğmesi devre dışıyken görünür neden. */
  connectDisabled: "Bağlantı yakında açılacak; o zamana kadar herkese açık veriyle çalışırım.",
  connectDisabledOperator: "Faz 3: Instagram Login (OAuth) ile bağlama henüz açık değil.",
} as const;

// --------------------------------------------------------------- Hesap türü

/** Haritanın müşteri adı (ana sözlükteki "bu yaklaşım + bu izleyici" / "bu konu + bu açılış" ifadelerinden). */
const MATRIX_KIND_PLAIN: Record<MatrixKind, string> = {
  angle_funnel: "yaklaşım + izleyici",
  topic_hook: "konu + açılış",
};

export interface AccountTypeEffectInput {
  matrices: readonly MatrixKind[];
  appliesAngleLabeling: boolean;
  contentMix: { reach: number; sales: number };
}

/**
 * Hesap türü seçeneğinin sonucu, müşteri dilinde ("Bundan sonra …"): hangi haritaya bakarım, videolara yaklaşım etiketi koyar mıyım, planın
 * karması ne. Yüzdeler çağıranın biçimleyicisiyle (`formatPercent`) gelir: sözlük sayıyı biçimlemez.
 */
export function accountTypeEffectPlain(input: AccountTypeEffectInput, percent: (n: number) => string): string[] {
  const lines: string[] = [];
  lines.push(`Videolarına şu haritayla bakarım: ${input.matrices.map((kind) => MATRIX_KIND_PLAIN[kind]).join(" ve ")}.`);
  lines.push(input.appliesAngleLabeling ? "Videolarının neye dokunduğunu (yaklaşımı) ayrıca işaretlerim." : "Videolarının neye dokunduğunu ayrıca işaretlemem.");
  const { reach, sales } = input.contentMix;
  const mix = [reach > 0 ? `erişim ${percent(reach)}` : undefined, sales > 0 ? `satış ${percent(sales)}` : undefined].filter((part) => part !== undefined);
  lines.push(`Haftalık planda içerik karması: ${mix.join(" / ")}.`);
  return lines;
}

export const ACCOUNT_TYPE_CONFIRM_PLAIN = {
  title: "Hesap türünü değiştir",
  lead: (from: string, to: string): string => `“${from}” yerine “${to}” seçiyorsun. Bundan sonra plan ve analiz şöyle değişir:`,
  screenNote: "Kreatif anatomisi ekranı yeni haritaya göre yeniden kurulur; eski veriler silinmez.",
  confirm: "Türü değiştir",
  cancel: "Vazgeç",
} as const;

// ------------------------------------------------------------ Ölçülemeyenler

/** Ölçülemeyen alan adı → müşteri dili (veritabanı sütun adı ekranda yazılmaz; yönetici tablosu ham adı gösterir). */
export const MEASURE_FIELD_PLAIN: Readonly<Record<string, string>> = {
  reach: "erişim",
  saves: "kaydetme",
  shares: "paylaşma",
  avgWatchSec: "ortalama izlenme süresi",
  views: "izlenme",
  likes: "beğeni",
  followers: "takipçi",
  following: "takip edilen",
  postsCount: "paylaşım sayısı",
  category: "kategori",
};

/** Bilinmeyen alan adı için güvenli yedek: ham ad gösterilmez, genel ifade yazılır. */
export const MEASURE_FIELD_FALLBACK = "bazı bilgiler";

export const UNMEASURED_PLAIN = {
  none: "Şu an her şeyi ölçebiliyorum.",
  account: "Hesabın resmi olarak bağlı değil: erişim, izlenme süresi ve kitle bilgisi hesabını bağlayınca görünür.",
  ownInsights: (fields: string): string => `Kendi videolarında ${fields}: platform hazırlayınca ya da hesabını bağlayınca görünür.`,
  publicOnly: (fields: string): string => `Rakiplerde ${fields} görünmez: platformlar bunları yalnız hesap sahibine verir.`,
  formatGap: "Karusel ve görsel gönderilerde izlenme, gizlenen beğenilerde beğeni sayısı yok.",
  rivalUnavailable: (count: string): string => `${count} rakip hesaptan veri alamıyorum (gizli ya da bulunamadı).`,
  rivalProfile: (count: string): string => `${count} rakipte profil bilgisi eksik; toplandıkça tamamlanır.`,
} as const;
