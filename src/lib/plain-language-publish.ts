/**
 * Yayın, İçeriklerim ve video sayfası için düz dil sözlüğü (Dalga 2: D2-08, D2-10). `plain-language.ts`'in tamamlayıcısıdır:
 * orada olan terimler (`liftPhrase`, `liftTimes`, `PLAIN_TERMS`, `CONFIDENCE_PLAIN`) buradan yalnız İÇE AKTARILIR, kopyalanmaz.
 * Müşteri ekranında "Faz", "container", "Trial", "Meta API", kural kodu, transcript, STT, hook, baz çizgisi, lift, medyan geçmez;
 * bu sözlükteki hiçbir metin sağlayıcı ya da panel jargonu taşımaz. Saf (sunucu / istemci); LLM yok.
 */
import type { PublishStatus, TrialGraduation } from "@/lib/domain/publish";
import { CONFIDENCE_PLAIN, PLAIN_TERMS, liftPhrase } from "@/lib/plain-language";
import { formatDecimal, formatNumber } from "@/lib/format";

// ------------------------------------------------------------- Deneme yayını

/** "Trial Reels" müşteriye "deneme yayını" diye söylenir; "hook A/B testi" yerine "iki farklı açılış" (`PLAIN_TERMS.hook`). */
export const TRIAL_PLAIN = {
  name: "Deneme yayını",
  description: "Önce yalnız seni takip etmeyenlere gösterilir; iki farklı açılışı karşılaştırmak için kullanışlıdır.",
  graduationLabel: "Takipçilere açılma",
  graduationNote: "Deneme yayını, takipçilere açılana kadar yalnız takipçi olmayanlara gösterilir.",
} as const;

/** Takipçilere açılma stratejisi: `option` seçici metni, `badge` kart rozetindeki kısa ifade. */
export const TRIAL_GRADUATION_PLAIN: Record<TrialGraduation, { option: string; badge: string }> = {
  manual: { option: "Takipçilere açmayı ben yaparım", badge: "elle açılır" },
  performance: { option: "İyi giderse kendiliğinden açılır", badge: "otomatik açılır" },
};

/** Kart rozeti: "Deneme yayını (elle açılır)". */
export function trialBadgeText(graduation: TrialGraduation): string {
  return `${TRIAL_PLAIN.name} (${TRIAL_GRADUATION_PLAIN[graduation].badge})`;
}

// ------------------------------------------------------------- Yayın metinleri

export const VIDEO_UPLOAD_SOON = "Video yükleme yakında açılacak.";

/** Uyum panelinin altındaki not; "kural kaynakları doğrulanıyor" gibi iç durum cümlesi müşteriye gösterilmez. */
export const COMPLIANCE_NOTE = "Kural tabanlı ön kontroldür; hukuki tavsiye değildir.";

export const QUOTA_NOTE = "Sayım panelden yapılan yayınlardır.";

/** Bağlı hesap yokken Yeni yayın formunun yerini tutan cümle. */
export const NO_CONNECTED_ACCOUNT_NOTE =
  "Yayın işi açmak için resmi bağlantıyla bağlı bir hesap gerekir; hesap bağlama yakında açılacak.";

export interface UnsupportedAccount {
  handle: string;
  /** Platformun görünen adı (TikTok). */
  platformLabel: string;
}

const accountList = (accounts: readonly UnsupportedAccount[]) => accounts.map((account) => `@${account.handle} (${account.platformLabel})`).join(", ");

/**
 * Yayın işi açılamayan platformdaki hesaplar için TEK not (hangi hesap olduğu adıyla söylenir). `publishable`: yayın açılabilen en
 * az bir hesap var mı; yoksa "Yeni yayın" düğmesi de yoktur ve not bunu da söyler.
 */
export function unsupportedPublishNote(accounts: readonly UnsupportedAccount[], publishable: boolean): string | undefined {
  if (accounts.length === 0) return undefined;
  const base = `${accountList(accounts)} için buradan yayın henüz yok; bu hesabın planı ve fikirleri çalışmaya devam eder.`;
  return publishable ? base : `${base} Yayın işi açılabilecek başka bir hesabın yok.`;
}

/** Yayın listesi boşken açıklama: "Yeni yayın" düğmesi yoksa ona yönlendirilmez. */
export function emptyQueueText(canCreate: boolean): string {
  return canCreate
    ? "“Yeni yayın” ile ilk işi oluştur. Her iş, yayınlanmadan önce senin onayını bekler."
    : "Yayın işi açılabilen bir hesap olunca işler burada görünür. Her iş, yayınlanmadan önce senin onayını bekler.";
}

/**
 * İşin ham hata metnini (işçi / platform yazar) düz cümleye çevirir: "Container … süresi doldu" → "Yayın süresi doldu…", "Meta API" →
 * platformun adı. Bilinmeyen metinde yalnız jargon sözcükleri değişir; metin atılmaz.
 */
export function plainPublishError(raw: string, platformLabel: string): string {
  if (/^container\b.*(süresi doldu|yayınlanmadı)/i.test(raw.trim())) {
    return "Yayın süresi doldu: video 24 saat içinde yayınlanmadı. Yeniden oluşturman gerekiyor.";
  }
  return raw
    .replace(/\bMeta API\b/g, platformLabel)
    .replace(/\bcontainer\b/gi, "yayın hazırlığı")
    .replace(/\byükleyin\b/g, "yükle");
}

// ---------------------------------------------------- Kopyala ve düzelt (D2-01, D2-06)

/** "Kopyala ve düzelt" yolunu açan durumlar: onay bekleyen, başarısız, süresi dolan (+ düzenlenemeyen taslak). */
export type FixMode = "fix" | "retry";

const FIXABLE: Partial<Record<PublishStatus, FixMode>> = {
  draft: "fix",
  awaiting_approval: "fix",
  failed: "retry",
  expired: "fix",
};

/** Durumun düzeltme biçimi; düzeltilemeyen durumda undefined (düğme çizilmez, sunucu da reddeder). */
export function fixModeOf(status: PublishStatus): FixMode | undefined {
  return FIXABLE[status];
}

export const FIX_PLAIN: Record<FixMode, { button: string; title: string; description: string; success: string }> = {
  fix: {
    button: "Kopyala ve düzelt",
    title: "Kopyala ve düzelt",
    description: "Bu işin bilgileri forma kopyalandı. Düzeltip kaydedince eski iş iptal edilir; yenisi onun yerine geçer.",
    success: "Yeni yayın kaydedildi, eski iş iptal edildi.",
  },
  retry: {
    button: "Yeniden dene",
    title: "Yeniden dene",
    description: "Bu işin bilgileri forma kopyalandı. Kaydedince eski iş iptal edilir; yenisi baştan onay sürecine girer.",
    success: "Yeni yayın kaydedildi, eski iş iptal edildi.",
  },
};

export const FIX_PARTIAL_WARNING = "Yeni yayın kaydedildi, ama eski iş iptal edilemedi. Listeden elle iptal edebilirsin.";
export const FIX_STALE_MESSAGE = "Bu iş artık düzeltilemez (durumu değişmiş). Sayfayı yenileyip tekrar dene.";

// --------------------------------------------------------------- İçeriklerim

export const CONTENT_PLAIN = {
  pageDescription: "Kendi hesaplarındaki içerikler: izlenme, etkileşim ve her videonun normaline göre kaç kat izlendiği.",
  /** Sütun başlıkları: "Lift" / "Baz çizgisi n" yerine. */
  multiplierColumn: "Normalinin kaç katı",
  comparedColumn: "Kıyaslanan video",
  comparedReason: "Kıyaslama yapılamadı: aynı biçimde yeterli geçmiş video yok.",
  /** Grafik. */
  chartDescription: "Her nokta bir video: yatay eksen yayın tarihi, dikey eksen son ölçülen izlenme, renk normalinin kaç katı izlendiği.",
  legendLabel: "Renk açıklaması",
  legendUnmeasured: "Kıyaslama yapılamadı",
  tooltipMultiplier: "Normaline göre",
  /** Sıralama seçeneği ("En yüksek lift" yerine). */
  sortByMultiplier: "Normalinden en çok izlenen",
} as const;

/** Renk açıklaması: kademenin alt sınırı (`min`) düz cümleyle; kademe 0 = bir sonraki kademenin altı ("normalinin 1,5 katından az"). */
export function tierLegendPlain(tier: number, min: number): string {
  const times = Number.isInteger(min) ? formatNumber(min) : formatDecimal(min, 1);
  return tier === 0 ? `normalinin ${times} katından az` : `normalinin ${times} katı ve üstü`;
}

export interface ChartSummaryPoint {
  title: string;
  views: number;
  /** Yayın tarihi (biçimlenmiş). */
  date: string;
}

/** Grafiğin metin karşılığı: ekran okuyucuya ve görenlere aynı cümle ("En çok izlenen: …"). Nokta yoksa undefined. */
export function chartSummary(points: readonly ChartSummaryPoint[]): string | undefined {
  if (points.length === 0) return undefined;
  let top = points[0];
  let low = points[0];
  for (const point of points) {
    if (point.views > top.views) top = point;
    if (point.views < low.views) low = point;
  }
  const count = formatNumber(points.length);
  const fmt = (point: ChartSummaryPoint) => `“${point.title}” (${formatNumber(point.views)} izlenme, ${point.date})`;
  if (points.length === 1) return `${count} video: ${fmt(top)}.`;
  return `${count} video. En çok izlenen: ${fmt(top)}. En az izlenen: ${fmt(low)}.`;
}

// --------------------------------------------------------------- Video sayfası

export const WHY_PLAIN = {
  title: "Neden tuttu?",
  description: "Videonun izlenmesi, hesabının kendi normaliyle kıyaslanır.",
  howTitle: "Normal nasıl hesaplandı?",
  excludedTitle: "Kıyaslamaya girmeyenler",
  unmeasuredFallback: "Kıyaslama yapılamadı.",
  immature: "Çok yeni video (3 günden yeni): izlenme henüz oturmadı, oran değişebilir.",
} as const;

/** "3.108 izlenme; hesabının normali 7.337, yani normalinin 0,4 katı izlendi." Ölçülemeyen oran → undefined. */
export function whyFormula(views: number | undefined, normalViews: number | undefined, lift: number | undefined): string | undefined {
  const phrase = liftPhrase(lift);
  if (phrase === undefined || views === undefined || normalViews === undefined) return undefined;
  return `${formatNumber(views)} izlenme; hesabının normali ${formatNumber(normalViews)}, yani ${phrase}.`;
}

/** Normalin tanımı: `PLAIN_TERMS.baseline.meaning` ("Son videolarının tipik izlenmesi.") ile aynı anlam, biçim ve pencereyle. */
export function whyNormalDefinition(format: string, viewsKind: string | undefined, windowSize: number, n: number): string {
  const kind = viewsKind ? ` (${viewsKind})` : "";
  const basis = n > 0 ? `Bu kıyaslama ${formatNumber(n)} videoya dayanıyor.` : "Kıyaslamaya giren video yok.";
  return `Aynı hesabın, aynı biçimdeki (${format}) ve aynı izlenme türündeki${kind} son ${windowSize} videosunun ${PLAIN_TERMS.median.say} izlenmesi. ${basis}`;
}

/** Az örnekte uyarı: `CONFIDENCE_PLAIN.low` ile aynı dil. */
export function whyLowSample(n: number, minimum: number): string {
  const text = CONFIDENCE_PLAIN.low;
  return `${text.charAt(0).toLocaleUpperCase("tr-TR")}${text.slice(1)}: kıyaslama ${formatNumber(n)} videoya dayanıyor; güvenilir olması için en az ${minimum} gerekir.`;
}

export const ANALYSIS_PLAIN = {
  /** "Hook" başlığı ve ilgili metinler: `PLAIN_TERMS.hook` ("açılış"). */
  hookHeading: "Açılış",
  hookMissing: "Açılış cümlesi tespit edilemedi.",
  hookTypeMissing: "Açılış tarzı belirlenemedi.",
  hookSourceMissing: "Açılışın konuşmada mı, ekran yazısında mı, açıklamada mı olduğu bu analizde kaydedilmemiş (eski sürüm).",
  analysisDescription: "Açılış, bölümler ve etiketler; her biri videodaki metinden birebir alıntıyla.",
  speechTitle: "Konuşma metni",
  speechDescription: "Konuşma ve ekran yazısı ayrı kanallar; açılışın geldiği kanalda vurgulanır.",
  speechPlatformSource: "Platformun verdiği konuşma metni",
  speechRecognition: "Konuşma tanıma",
  speechAi: "Video analizi (yapay zekâ)",
  speechManual: "Elle girildi",
  evidenceSelfCheck:
    "Metni de alıntıyı da aynı yapay zekâ yazdığı için bu denetim tek başına kesin kanıt değildir; yalnız alıntıların videodaki metinde gerçekten geçtiğini kontrol eder.",
} as const;

export { CONFIDENCE_PLAIN };
