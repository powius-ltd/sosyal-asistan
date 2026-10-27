/**
 * Düz dil sözlüğü (`docs/GENEL-BAKIS-TASARIM.md` §4): panelin teknik terimlerinin müşteriye söylenen karşılıkları. Genel bakış
 * özeti ve sohbet kutusu AYNI cümleleri kullansın diye tek yerde durur. Saf (sunucu/istemci); metin üretimi şablon + sabit
 * sözlüktür, LLM yok. Kurallar: ölçülemeyen değer için cümle kurulmaz (`undefined`; 0 ya da yanlış cümle uydurulmaz), hesap/marka
 * adı gömülmez, sayılar `formatDecimal` (tr-TR) ile yazılır. Anahtarlar veride olduğu gibi kalır, yalnız söylenen cümle düzdür.
 */
import type { CreditEstimateLine, CreditItem } from "@/lib/domain/credit-pricing";
import type { CtaType } from "@/lib/domain/taxonomy";
import type { CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { CHECKPOINT_LABEL, type CheckpointDay } from "@/lib/domain/outcomes";
import type { JobKind, JobOutcomeCode, JobStatus, JobStepId, JobStepStatus } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { formatDecimal, formatNumber, LOCALE } from "@/lib/format";
import { LIFT_DIGITS, liftTimes, roundedLift } from "@/lib/plain-language-lift";

export { liftTimes };
export * from "@/lib/plain-language-ads";

/** Müşteriye söylenmeyen panel jargonu: düz dil çıktılarını ve istem kuralını sınayan testler bu deseni paylaşır (kopyası yazılmaz). */
export const PANEL_JARGON = /lift|hook|baz çizgisi|outlier|\bCTA\b|matris|hücre|kademe|medyan|D\+|düşük güven|funnel|\baday|\bROAS\b|\bCPA\b|\bCPM\b|\bCPC\b|\bCTR\b/i;

/** Çarpan rozeti ("8,7x"): ekranda rozet olarak serbest, ama cümle / bildirim metninde yazılmaz ("normalinin 8,7 katı"). */
export const MULTIPLIER_BADGE = /\d\s?x\b/i;

// ---------------------------------------------------------------------- Lift

/**
 * Lift'in düz cümlesi: `liftPhrase(2.3)` → "normalinin 2,3 katı izlendi". Normale çok yakınsa "normal düzeyde izlendi" (1,0 katı
 * demez); tam 0 ise "hiç izlenmedi"; 0'a yuvarlanan küçük değerde "normalinin çok altında izlendi". Ölçülemeyen/geçersiz → undefined
 * (çağıran cümleyi düşürür ya da "henüz veri yok" der).
 */
export function liftPhrase(lift: number | undefined): string | undefined {
  const rounded = roundedLift(lift);
  if (rounded === undefined) return undefined;
  if (lift === 0) return "hiç izlenmedi";
  if (rounded === 0) return "normalinin çok altında izlendi";
  if (rounded === 1) return "normal düzeyde izlendi";
  return `normalinin ${formatDecimal(rounded, LIFT_DIGITS)} katı izlendi`;
}

// -------------------------------------------------------------------- Güven

/** Güven düzeyinin düz ifadesi (`ConfidenceLevel`): düşük güven = az örnek. */
export const CONFIDENCE_PLAIN: Record<ConfidenceLevel, string> = {
  high: "eminim",
  medium: "kısmen eminim",
  low: "az örnek, emin değilim",
};

export function confidencePhrase(confidence: ConfidenceLevel): string {
  return CONFIDENCE_PLAIN[confidence];
}

// ------------------------------------------------------------------- Tutan

const OUTLIER_FACTOR = formatNumber(LIFT_TIER_MIN[OUTLIER_MIN_TIER]) ?? String(LIFT_TIER_MIN[OUTLIER_MIN_TIER]);

/**
 * "Tutan video" (outlier, kademe ≥ 3): eşik `OUTLIER_MIN_TIER`'dan okunur, kural değişirse cümle de değişir.
 * `name` cümlede geçen ad, `definition` tanım (isim tamlaması: "…izlenen video"), `sentence` hazır tanım cümlesi (ipucu balonu için).
 */
export const OUTLIER_PLAIN = {
  name: "tutan video",
  definition: `normalinin en az ${OUTLIER_FACTOR} katı izlenen video`,
  sentence: `Tutan video: normalinin en az ${OUTLIER_FACTOR} katı izlenen video.`,
} as const;

// -------------------------------------------------------------- Kontrol noktası

/** Ölçüm kontrol noktası (D+1/3/7) → "3. gün sonucu". */
export function checkpointPhrase(day: CheckpointDay): string {
  return `${CHECKPOINT_LABEL[day]} sonucu`;
}

// --------------------------------------------------------- Taksonomi karşılıkları

/** Açılış (hook) türü → "… açılış". Bilinmeyen (yeni taksonomi sürümü) anahtar için `hookTypePlain` yedeği kullanılır. */
const HOOK_TYPE_PLAIN = new Map<string, string>([
  ["question", "soruyla açılış"],
  ["list", "liste vaadiyle açılış"],
  ["confession", "itirafla açılış"],
  ["shock_stat", "şaşırtıcı bir rakamla açılış"],
  ["pov", "izleyiciyi sahnenin içine alan açılış"],
  ["mistake_warning", "sık yapılan bir hatayı uyaran açılış"],
  ["comparison", "iki şeyi karşılaştıran açılış"],
  ["barrier_removal", "izleyicinin çekincesini kaldıran açılış"],
  ["bold_claim", "cesur bir iddiayla açılış"],
  ["story_open", "hikayeyle açılış"],
  ["callout", "izleyiciye doğrudan seslenen açılış"],
  ["affirmation", "olumlayıcı bir cümleyle açılış"],
  ["teaching_quote", "öğreti ya da alıntıyla açılış"],
]);

/** Hook türünün düz karşılığı. `Map`: "constructor" gibi anahtarlar prototipten okunmaz; bilinmeyen anahtar → "<etiket> tarzı açılış". */
export function hookTypePlain(key: string): string {
  return HOOK_TYPE_PLAIN.get(key) ?? `${hookTypeLabel(key).toLocaleLowerCase(LOCALE)} tarzı açılış`;
}

/** Açı (videonun neye dokunduğu) → kısa ad. */
export const ANGLE_PLAIN: Record<CreativeAngle, string> = {
  "sonuc-kazanim": "kazanç / sonuç",
  "aci-korku": "acı / korku",
  kimlik: "kimlik",
  "sosyal-kanit": "başkalarının deneyimi",
};

/** Farkındalık katmanı (izleyicinin ne kadar hazır olduğu) → kısa ifade. */
export const FUNNEL_STAGE_PLAIN: Record<FunnelStage, string> = {
  "hic-farkinda-degil": "sorunun farkında değil",
  "sorunu-biliyor": "sorunu biliyor, ne yapacağını bilmiyor",
  "cozum-ariyor": "çözüm arıyor",
  "urunu-biliyor": "seçenekleri karşılaştırıyor",
  "sicak-musteri": "almaya hazır",
};

/** CTA türü (izleyiciden istediğin şey) → kısa ifade. */
export const CTA_TYPE_PLAIN: Record<CtaType, string> = {
  comment_keyword: "yoruma kelime yazma",
  dm: "mesaj atma",
  book_call: "randevu / görüşme alma",
  link_in_bio: "profildeki bağlantıya gitme",
  save_share: "kaydetme / paylaşma",
  follow: "takip etme",
  none: "hiçbir şey istememe",
};

// ------------------------------------------------------------------ Terimler

/** Panel terimi anahtarları (§4 tablosunun satırları; lift, güven ve tutan video yukarıdaki işlevlerle karşılanır). */
export type PlainTermKey =
  | "baseline"
  | "hook"
  | "hookType"
  | "angle"
  | "funnelStage"
  | "matrixCell"
  | "topicCell"
  | "opportunity"
  | "median"
  | "cta"
  | "analysis"
  | "collection"
  | "stale"
  | "unmeasured"
  | "rivalSuggestion";

export interface PlainTerm {
  /** Müşteriye söylenen ifade. */
  say: string;
  /** Tek cümlelik açıklama (ipucu balonu / "Neden?" gövdesi). */
  meaning: string;
}

/** Panel terimi → müşteriye söylenen ifade + açıklama. Birinci tekil ton (`persona.ts`): bakışı yapan "ben"dir. */
export const PLAIN_TERMS: Record<PlainTermKey, PlainTerm> = {
  baseline: { say: "normalin", meaning: "Son videolarının tipik izlenmesi." },
  hook: { say: "açılış (ilk saniyeler)", meaning: "Videonun ilk saniyelerinde söylenen ya da gösterilen şey." },
  hookType: { say: "açılış tarzı", meaning: "Açılışın nasıl kurulduğu: soru, itiraf, cesur iddia gibi." },
  angle: { say: "videonun neye dokunduğu", meaning: "Kazanç, korku, kimlik ya da başkalarının deneyimi." },
  funnelStage: { say: "izleyicinin ne kadar hazır olduğu", meaning: "Sorundan habersiz olandan almaya hazır olana kadar beş basamak." },
  matrixCell: { say: "bu yaklaşım + bu izleyici", meaning: "Videonun neye dokunduğu ile izleyicinin hazır olma düzeyinin birleşimi." },
  topicCell: { say: "bu konu + bu açılış", meaning: "Bir konunun belirli bir açılış tarzıyla birleşimi." },
  opportunity: { say: "rakiplerde tutuyor, sen denemedin", meaning: "Rakiplerde işe yarayan ama senin henüz çekmediğin bir yaklaşım." },
  median: { say: "tipik", meaning: "Ortadaki değer: videoların yarısı bunun altında, yarısı üstünde." },
  cta: { say: "izleyiciden istediğin şey", meaning: "Videonun sonunda izleyiciden istenen adım: yorum, mesaj, kaydetme gibi." },
  analysis: { say: "incelediğim video", meaning: "İçeriğini ve açılışını satır satır okuduğum video." },
  collection: { say: "hesabına son bakışım", meaning: "Hesabının verisini en son çektiğim an." },
  stale: { say: "bundan sonra yeni veri geldi; notlarımı güncelleyeceğim", meaning: "Notlarım eski veriye dayanıyor." },
  unmeasured: { say: "henüz veri yok", meaning: "Bu değeri hesaplamak için yeterli ölçüm yok; sebebi ayrıca yazılır." },
  // Keşfedilen ama henüz izlemeye alınmamış rakip hesap ("aday" denmez; akıştaki karşılığı `ONBOARDING_TERMS.candidate` = "benzer hesap").
  rivalSuggestion: { say: "benzer hesap önerisi", meaning: "Sana benzeyen, henüz izlemeye almadığın bir hesap." },
};

/** "3 benzer hesap önerisi" (sayı + terim); sayı okunamazsa undefined. */
export function rivalSuggestionsPhrase(count: number | undefined): string | undefined {
  const text = formatNumber(count);
  return text === undefined ? undefined : `${text} ${PLAIN_TERMS.rivalSuggestion.say}`;
}

// ------------------------------------------------------------- Panel işleri

/**
 * Panel işi (`domain/panel-job.ts`) terimleri (başlangıç akışının ekran metinleri `plain-language-onboarding.ts`'te). Durum şeridini HERKES görür: bu sözlükteki hiçbir metin tutar, sağlayıcı adı, komut ya da
 * panel jargonu taşımaz; ham adım notu ve günlük yalnız yönetici ekranındadır. Cümle KODDAN kurulur (tür, adım, durum, sonuç kodu).
 */

/** İş türü: `label` düğme / başlık metni, `doing` "şimdi yaptığım" cümlesi (küçük harfle başlar, noktasız). */
export const JOB_KIND_PLAIN: Record<JobKind, { label: string; doing: string }> = {
  routine: { label: "Haftalık tur", doing: "haftalık turu yapıyorum" },
  collect: { label: "Hesaba bak", doing: "hesabına bakıyorum" },
  measure: { label: "Sonuçları ölç", doing: "sonuçları ölçüyorum" },
  analyze: { label: "Videoları incele", doing: "videolarını inceliyorum" },
  label: { label: "Açıları etiketle", doing: "videoların neye dokunduğuna bakıyorum" },
  plan: { label: "Planı hazırla", doing: "planını hazırlıyorum" },
  briefing: { label: "Notları güncelle", doing: "notlarımı güncelliyorum" },
  onboarding: { label: "İlk bakış", doing: "hesabına ilk kez bakıyorum" },
  measure_zernio: { label: "Sonuçları oku", doing: "sonuçları bağlı hesaptan okuyorum" },
  discover: { label: "Benzer hesapları bul", doing: "sana benzeyen hesapları arıyorum" },
  order: { label: "Stüdyo siparişi yaz", doing: "stüdyo için sipariş fişi yazıyorum" },
  order_return: { label: "Stüdyo videolarını al", doing: "stüdyodan gelen videoları yayın onayına hazırlıyorum" },
  publish: { label: "Onaylı videoyu yayınla", doing: "onayladığın videoyu zamanlıyorum" },
  ads_sync: { label: "Reklam verisini güncelle", doing: "reklam verisini okuyorum" },
};

/** Adım: `name` adım listesindeki ad, `doing` "şimdi yaptığım" cümlesi. */
export const JOB_STEP_PLAIN: Record<JobStepId, { name: string; doing: string }> = {
  precheck: { name: "Hazırlık", doing: "hazırlık yapıyorum" },
  collect: { name: "Hesaba bakış", doing: "hesabına bakıyorum" },
  analyze: { name: "Video inceleme", doing: "videolarını inceliyorum" },
  label: { name: "Açı etiketleme", doing: "videoların neye dokunduğuna bakıyorum" },
  cluster: { name: "Konu gruplama", doing: "konuları grupluyorum" },
  plan: { name: "Plan", doing: "planını hazırlıyorum" },
  measure_check: { name: "Sonuç kontrolü", doing: "sonucu gelen videoları kontrol ediyorum" },
  measure: { name: "Sonuç ölçümü", doing: "sonuçları ölçüyorum" },
  measure_zernio: { name: "Sonuçları okuma", doing: "sonuçları bağlı hesaptan okuyorum" },
  briefing: { name: "Notlar", doing: "notlarımı güncelliyorum" },
  verify: { name: "Hesap kontrolü", doing: "hesabını buluyorum" },
  discover: { name: "Benzer hesaplar", doing: "sana benzeyen hesapları arıyorum" },
  order: { name: "Sipariş fişi", doing: "stüdyo için sipariş fişi yazıyorum" },
  order_return: { name: "Stüdyo videoları", doing: "stüdyodan gelen videoları onaya hazırlıyorum" },
  publish: { name: "Yayın", doing: "onaylı videoyu zamanlıyorum" },
  ads_sync: { name: "Reklam verisi", doing: "reklam verisini okuyorum" },
  draft_niche: { name: "Konu taslağı", doing: "ne anlattığını çıkarıyorum" },
};

export const JOB_STATUS_PLAIN: Record<JobStatus, string> = {
  queued: "sırada",
  running: "çalışıyor",
  succeeded: "bitti",
  partial: "kısmen bitti",
  blocked: "durdu",
  failed: "tamamlanamadı",
  cancelled: "durduruldu",
};

export const JOB_STEP_STATUS_PLAIN: Record<JobStepStatus, string> = {
  pending: "sırada",
  running: "sürüyor",
  ok: "tamam",
  skipped: "gerek yoktu",
  failed: "olmadı",
  needs_approval: "onay bekliyor",
};

/** Önizleme ($0 ön bakış): `label` düğme adı, `title` başlık eki, `doing` "şimdi yaptığım" cümlesi. */
export const JOB_PREVIEW_PLAIN = { label: "Önce bak", title: "ön bakış", doing: "yapılacaklara bakıyorum" } as const;

/** Çalışıyor görünen ama nabzı kesilen iş. */
export const JOB_STALE_PLAIN = "yanıt vermiyor";
/** Durdurma istenmiş, iş adım sınırını bekliyor. */
export const JOB_CANCELLING_PLAIN = "bu adım bitince duracağım";

/** Sonuç kodu → tam cümle. */
export const JOB_OUTCOME_PLAIN: Record<JobOutcomeCode, string> = {
  nothing_to_do: "Yapılacak yeni bir şey yoktu.",
  no_targets: "Bakılacak hesap bulunamadı.",
  no_reels: "Sonucu ölçülecek video yok.",
  skipped_account_type: "Bu hesap türünde bu adıma gerek yok.",
  kept_existing: "Yeni fikirler yeterince güçlü çıkmadı; mevcut planını korudum.",
  voice_unusable: "Anlatım tarzını çıkaracak kadar videon yok; plan hazırlayamadım.",
  needs_recollect: "Videoları inceleyebilmem için önce hesabına yeniden bakmam gerekiyor.",
  over_approved_amount: "Bu iş onaylanan sınırı aşacaktı; başlamadım.",
  budget_refused: "Bu ayın sınırı buna izin vermiyor; başlamadım.",
  approval_missing: "Bu iş için geçerli bir onay yok; başlamadım.",
  approval_expired: "Onayın üzerinden çok zaman geçti; yeniden onay gerekiyor.",
  insufficient_credits: "Kredin bu iş için yetmedi; başlamadım.",
  credits_exhausted: "Bu iş için ayrılan kredi bitti; yapabildiğim kadarını yaptım.",
  backend_unavailable: "Video inceleme aracına şu an ulaşamıyorum.",
  analysis_unsupported: "Bu platformda videoları tek tek izleyemiyorum; sayılara ve açıklamalara bakarak devam ettim.",
  llm_unavailable: "Yazı aracına şu an ulaşamıyorum.",
  precheck_failed: "Başlamadan önceki kontrol geçmedi.",
  step_failed: "Bazı adımlar tamamlanamadı.",
  timeout: "İş beklenenden uzun sürdü; durdurdum.",
  worker_lost: "İş yarıda kaldı.",
  error: "Beklenmeyen bir sorun çıktı.",
  account_private: "Hesabın gizli görünüyor; herkese açık yapınca yeniden bakabilirim.",
  account_not_found: "Bu kullanıcı adıyla bir hesap bulamadım.",
  no_videos: "Hesabında inceleyebileceğim bir video bulamadım.",
  few_videos: "Hesabında az video var; çıkardıklarım şimdilik kaba bir tahmin.",
  plan_not_ready: "Videolarını inceledim; plan çıkarabilmem için biraz daha veri gerekiyor.",
  no_plan: "Bu hafta için fişe çevrilecek bir plan öğesi bulamadım.",
  zernio_key_missing: "Bu hesap için bağlantı anahtarı yok, sonuçlar okunamadı.",
  not_implemented: "Bu iş henüz yapılamıyor.",
};

/** Bitmiş işin sonuç kodu yoksa söylenen cümle (etkin durumlarda cümle yok: şerit `jobStripPhrase` kullanır). */
const JOB_FINISHED_PLAIN: Partial<Record<JobStatus, string>> = {
  succeeded: "İş bitti.",
  partial: "İş kısmen bitti.",
  blocked: "İş durdu.",
  failed: "İş tamamlanamadı.",
  cancelled: "İş durduruldu.",
};

/**
 * Durum şeridi cümlesi (etkin iş): "Şimdi yaptığım: videolarını inceliyorum (7/19)". Sıradaki iş "Sıradaki iş: …", yanıt vermeyen iş
 * ayrı cümle; durdurma istendiyse sonuna eklenir. Sayaç yoksa parantez yazılmaz (0/0 uydurulmaz). Bitmiş işte undefined (şerit çizilmez).
 */
export function jobStripPhrase(view: Pick<JobStatusView, "kind" | "dryRun" | "status" | "stale" | "cancelRequested" | "currentStep" | "progress">): string | undefined {
  if (view.status === "queued") return `Sıradaki iş: ${JOB_KIND_PLAIN[view.kind].label}`;
  if (view.status !== "running") return undefined;
  if (view.stale) return `${JOB_KIND_PLAIN[view.kind].label}: ${JOB_STALE_PLAIN}`;
  const doing = view.dryRun ? JOB_PREVIEW_PLAIN.doing : view.currentStep === undefined ? JOB_KIND_PLAIN[view.kind].doing : JOB_STEP_PLAIN[view.currentStep].doing;
  const counter = view.progress === undefined || view.progress.total <= 0 ? "" : ` (${formatNumber(view.progress.done)}/${formatNumber(view.progress.total)})`;
  return `Şimdi yaptığım: ${doing}${counter}${view.cancelRequested ? ` · ${JOB_CANCELLING_PLAIN}` : ""}`;
}

/** İşin başlığı: türün adı; önizlemede "· ön bakış" eklenir. */
export function jobTitlePhrase(view: Pick<JobStatusView, "kind" | "dryRun">): string {
  const label = JOB_KIND_PLAIN[view.kind].label;
  return view.dryRun ? `${label} · ${JOB_PREVIEW_PLAIN.title}` : label;
}

/**
 * İş ekranının (`/isler`) HERKESE görünen sabit cümleleri: çalışan iş paneli, geçmiş, müşteri görünümündeki açıklama. Yalnız yöneticiye
 * çizilen metinler (başlatma paneli, onay penceresi, düğme notları) bileşenlerinde kalır.
 */
export const JOB_SCREEN_PLAIN = {
  liveTitle: "Şu an",
  idle: "Çalışan ya da sırada bekleyen bir iş yok.",
  queuedAt: "Sıraya yazıldı",
  startedAt: "Başladı",
  historyEmptyTitle: "Henüz iş yok",
  historyEmpty: "Başlatılan işler bittikçe burada listelenir.",
  timeUnknown: "zamanı bilinmiyor",
  noSteps: "Bu iş başlamadan bitti; gösterilecek adım yok.",
  customerTitle: "İşleri yöneticin başlatır",
  customerBody: "Burada ne yapıldığını ve nasıl gittiğini görürsün.",
} as const;

/** Geçmiş satırındaki süre: "6 dk 12 sn sürdü" (`duration`: `formatElapsed`). */
export const jobTookPhrase = (duration: string): string => `${duration} sürdü`;

/** Bitmiş işin sonuç cümlesi: sonuç kodu varsa onun cümlesi, yoksa durumun cümlesi. Etkin işte undefined. */
export function jobOutcomePhrase(view: Pick<JobStatusView, "status" | "outcome">): string | undefined {
  const finished = JOB_FINISHED_PLAIN[view.status];
  if (finished === undefined) return undefined;
  return view.outcome === undefined ? finished : JOB_OUTCOME_PLAIN[view.outcome];
}

// -------------------------------------------------------------------- Kredi

/**
 * Kredi (`domain/credit-pricing.ts`) terimleri. Ekranda şimdilik yalnız tahmin ve işin kredi özeti gösterilir (yönetici ekranı); bakiye
 * ekranı Dilim 4'tür. Birim fiyatlar ve dolar karşılığı ekrana girmez; kalem adları işin ne yaptığını söyler. Yetersiz kredi cümleleri
 * `JOB_OUTCOME_PLAIN` (`insufficient_credits`, `credits_exhausted`) ve `lib/actions/result.ts`'tedir.
 */
export const CREDIT_ITEM_PLAIN: Record<CreditItem, { label: string; unit: string }> = {
  account_scan: { label: "Hesaba bakış", unit: "hesap" },
  video_review: { label: "Video inceleme", unit: "video" },
  weekly_plan: { label: "Haftalık plan", unit: "plan" },
  briefing: { label: "Notlar", unit: "güncelleme" },
  chat_question: { label: "Sohbet sorusu", unit: "soru" },
  measurement: { label: "Sonuç ölçümü", unit: "hesap" },
  studio_video: { label: "Stüdyo videosu (geçici fiyat)", unit: "video" },
};

/** Tahmin hesaplanamadığında söylenen sebep (birim sayısı belli değil; tutar uydurulmaz). */
export const CREDIT_UNKNOWN_PLAIN = "Kaç hesap ve video işleneceği henüz belli değil.";
/** Tahminin altındaki not: tutar "en çok"tur; düşüm iş bitince, yalnız yapılan iş kadardır (kredi zorlaması kapalıyken hiç düşülmez). */
export const CREDIT_NOTE_PLAIN = "En çok bu kadar kredi tutar; iş bitince yalnız yapılan iş kadarı düşülür.";

/** "≈ 196 kredi". */
export const creditAmountPhrase = (credits: number): string => `≈ ${formatNumber(credits) ?? "0"} kredi`;

/** Döküm satırı: "5 hesap × 8". */
export const creditLinePhrase = (line: Pick<CreditEstimateLine, "item" | "units" | "creditsPerUnit">): string =>
  `${formatNumber(line.units) ?? "0"} ${CREDIT_ITEM_PLAIN[line.item].unit} × ${formatNumber(line.creditsPerUnit) ?? "0"}`;

/** Halka zinciri durduğunda çalışma alanına yazılan tek bildirim (para onayı bekliyor / bir iş tamamlanamadı). Tutar ve iç terim yok. */
export function cycleStopNotice(stop: { reason: "needs_approval"; step: string } | { reason: "job_failed"; jobKind: JobKind }): { title: string; body: string } {
  if (stop.reason === "needs_approval") {
    const step = stop.step === "rivals" ? JOB_KIND_PLAIN.discover.label : JOB_KIND_PLAIN.collect.label;
    return { title: "Halka senin onayını bekliyor", body: `Sıradaki adım (${step}) para harcar; sen onaylamadan başlamaz. İşler ekranından onaylayınca halka kaldığı yerden sürer.` };
  }
  return { title: "Halka durdu: bir iş tamamlanamadı", body: `“${JOB_KIND_PLAIN[stop.jobKind].label}” işi bitmedi; halka yeni iş açmıyor. Nedeni İşler ekranında; işi yeniden başlatıp bitirince halka kaldığı yerden sürer.` };
}

/** Yönetici ajanın zile yazdığı bildirimler (ajan kendi cümlesini yazmamışsa bu sabit metinler). Tutar ve iç terim yok. */
export const AGENT_NOTICE_PLAIN = {
  ask_approval: { title: "Yönetici ajan: senin kararın gerekiyor", body: "Sıradaki adım para harcar ve aylık ajan tavanı buna yetmiyor ya da onaylı değil. Ayarlar'dan tavanı kontrol edebilirsin." },
  notify: { title: "Yönetici ajan: bir not var", body: "Halkada dikkatini isteyen bir durum var; İşler ekranına bakabilirsin." },
} as const;

/** Ajan bildirimi: ajanın yazdığı kısa mesaj varsa o, yoksa sabit metin. */
export function agentNotice(action: keyof typeof AGENT_NOTICE_PLAIN, message?: string): { title: string; body: string } {
  const fixed = AGENT_NOTICE_PLAIN[action];
  return { title: fixed.title, body: message !== undefined && message.trim() !== "" ? message.trim() : fixed.body };
}

/** Zernio'da zamanlanmış gönderi panelden iptal edilmez (satırı iptal etmek gönderiyi silmez); kart notu ve depo hatası aynı cümle. */
export const SCHEDULED_ON_PROVIDER_PLAIN = "Zernio'da zamanlandı; iptal için Zernio'dan silinmeli.";
