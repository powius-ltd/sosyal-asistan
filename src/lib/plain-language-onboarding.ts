/**
 * Başlangıç akışının (`/baslangic`) MÜŞTERİYE görünen metinleri — düz dil sözlüğünün (`plain-language.ts`) akışa ayrılmış bölümü. Kural
 * aynıdır: panel jargonu (`PANEL_JARGON`), tutar, sağlayıcı adı ve komut YOK; ekran cümleyi KODDAN kurar (adım, neden, eylem). İşin adım
 * adları ve sonuç cümleleri (`JOB_STEP_PLAIN`, `JOB_OUTCOME_PLAIN`) ana sözlüktedir. Yeni terim önce buraya girer, sonra ekran ondan türetilir.
 * Hesap / marka adı gömülmez: kullanıcı adı parametre olarak geçer.
 */
import type { OnboardingAction, OnboardingReason, OnboardingStep } from "@/lib/domain/onboarding";
import { onboardingFinishKindOf, type OnboardingFinishInput, type OnboardingFinishKind } from "@/lib/domain/onboarding-finish";
import type { OnboardingPhase } from "@/lib/domain/onboarding-job";
import { formatCompact, formatNumber } from "@/lib/format";

/** Akışın terimleri: `say` ekranda söylenen karşılık. */
export const ONBOARDING_TERMS = {
  /** `probe` aşaması. */
  probe: "hesabına ilk bakış",
  /** `build` aşaması. */
  build: "ilk inceleme",
  /** `candidate` rakip. */
  candidate: "benzer hesap",
  /** `tracked` rakip. */
  tracked: "takip ettiğim hesap",
  /** Rakipsiz yol. */
  noRivals: "Benzer hesap seçmeden devam et",
  /** Tutan içerik (ana sözlükteki `OUTLIER_PLAIN.name` ile aynı karşılık). */
  outlier: "tutan video",
} as const;

/** Ekran başlığı ve alt cümlesi (adım başına). */
export const ONBOARDING_STEP_PLAIN: Record<OnboardingStep, { title: string; lead: string }> = {
  add_account: { title: "Hesabını ekle", lead: "Kullanıcı adını yaz; herkese açık videolarına bakıp sana bir plan çıkarayım." },
  probing: { title: "Hesabına bakıyorum", lead: "Profilini ve son videolarını getiriyorum. Üç beş dakika sürer." },
  review_account: { title: "Bu sen misin?", lead: "Doğru hesabı bulduysam ne tür bir hesap olduğunu ve ne anlattığını söyle." },
  choose_rivals: { title: "Kimlere bakayım?", lead: "Sana benzeyen hesaplar buldum. İstediklerini seç; onlarda neyin tuttuğuna da bakarım." },
  building: { title: "İlk incelemeni yapıyorum", lead: "Videoları getirip tek tek inceliyorum, sonra planını yazıyorum. Yirmi dakika kadar sürer; sayfayı kapatabilirsin." },
  done: { title: "İlk planın hazır", lead: "Bu haftanın planı, tutan videoların ve benzer hesaplardan çıkardıklarım seni bekliyor." },
  blocked: { title: "Burada durdum", lead: "Devam edebilmem için bir şeyin değişmesi gerekiyor." },
};

/** Nedenin cümlesi (adımın alt cümlesinin yerine ya da uyarı olarak). */
export const ONBOARDING_REASON_PLAIN: Record<OnboardingReason, string> = {
  no_account: "Henüz bir hesap eklemedin.",
  probe_not_started: "Hesabın ekli; ona henüz bakmadım.",
  few_videos: "Hesabında az video var; çıkardıklarım şimdilik kaba bir tahmin olur.",
  no_candidates: "Sana benzeyen bir hesap bulamadım. Bildiğin bir hesabı ekleyebilir ya da yalnız kendi videolarınla devam edebilirsin.",
  plan_ready: "Planın hazır.",
  plan_not_ready: "Videolarını inceledim; plan çıkarabilmem için biraz daha veri gerekiyor.",
  legacy: "Bu hesap zaten kurulu.",
  account_private: "Hesabın gizli görünüyor. Herkese açık yaparsan yeniden bakabilirim.",
  account_not_found: "Bu kullanıcı adıyla bir hesap bulamadım. Adı kontrol edip hesabı yeniden ekle.",
  no_videos: "Hesabında inceleyebileceğim bir video yok. Video paylaşınca yeniden bakabilirim.",
  probe_failed: "Hesabına bakarken bir sorun çıktı.",
  build_failed: "İlk incelemeyi tamamlayamadım.",
  build_incomplete: "İlk inceleme yarıda kaldı; yaptıklarım duruyor.",
  attempts_exhausted: "Bu hesap için birkaç kez denedim, olmadı.",
};

/** Eylem düğmesinin adı. */
export const ONBOARDING_ACTION_PLAIN: Record<OnboardingAction, string> = {
  add_account: "Hesap ekle",
  start_probe: "Hesabıma bak",
  confirm_account: "Evet, bu benim",
  start_build: "Başlat",
  resume: "Kaldığın yerden sürdür",
};

/** Aşamanın adı (ilerleme ekranı başlığı). */
export const ONBOARDING_PHASE_PLAIN: Record<OnboardingPhase, string> = {
  probe: "Hesabına ilk bakış",
  build: "İlk inceleme",
};

/** Hesap ekleme ekranının sabit metinleri. Platform adı `PLATFORM_LABEL`'dan, hangi platformun açık olduğu modül kaydından gelir. */
export const ONBOARDING_ADD_PLAIN = {
  handleLabel: "Kullanıcı adın ya da profil bağlantın",
  platformLabel: "Platform",
  /** Modülü olmayan platformun rozeti. */
  comingSoon: "Yakında",
  /** Birincil yol. */
  publicPath: "Herkese açık veriyle devam et",
  /** Resmi bağlantı (görünür, devre dışı). */
  connectPath: "Hesabımı bağla",
  connectNote: "Hesap bağlama yakında. Şimdilik yalnız herkese açık videolarına bakıyorum; şifre istemem.",
  /** Aynı hesap ikinci kez eklenmek istendi. */
  duplicate: "Bu hesabı zaten ekledin.",
} as const;

/** "Başlat" düğmesinin altındaki not: düğme harcama onayıdır; tutar söylenmez, kapsam söylenir. */
export const ONBOARDING_START_NOTE_PLAIN = "Başlat dediğinde seçtiğin hesaplara bakar, videoları inceler ve ilk planını yazarım. Bu, hesap başına bir kez yapılır.";

/** Bugün kartı: akış açıkken. */
export const ONBOARDING_TODAY_PLAIN = {
  running: "İlk bakışımı yapıyorum",
  waiting: "İlk bakışı birlikte tamamlayalım",
  open: "Devam et",
} as const;

/** "@ad · 12,4 B takipçi · 48 video": takipçi her yerde kısaltmayla yazılır (`formatCompact`); bilinmeyen parça yazılmaz (0 uydurulmaz). */
export function onboardingProfilePhrase(profile: { handle: string; followers?: number; videoCount?: number }): string {
  const followers = formatCompact(profile.followers);
  const videos = formatNumber(profile.videoCount);
  return [`@${profile.handle}`, followers === undefined ? undefined : `${followers} takipçi`, videos === undefined ? undefined : `${videos} video`]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

/** Rakip seçiminin özeti: "3 benzer hesap seçtin" / "Benzer hesap seçmedin". */
export function onboardingRivalsPhrase(selected: number): string {
  return selected <= 0 ? "Benzer hesap seçmedin" : `${formatNumber(selected) ?? String(selected)} benzer hesap seçtin`;
}

// ------------------------------------------------------------ Ekran metinleri (`/baslangic`)

/** Yol şeridinin beş durağı (ekranın üstünde; sıra akışın sırasıdır). */
export const ONBOARDING_ROUTE_PLAIN = {
  aria: "Başlangıç adımları",
  stops: ["Hesap", "İlk bakış", "Hesabı onayla", "Benzer hesaplar", "İlk plan"],
  position: (current: number, total: number): string => `Adım ${formatNumber(current) ?? String(current)}/${formatNumber(total) ?? String(total)}`,
} as const;

/** Karar bekleyen bloğun etiketi (Bugün'deki karar bloğuyla aynı söz). */
export const ONBOARDING_TURN_PLAIN = "Sıra sende";

/** Hesap ekleme ekranının ek metinleri (alan ipuçları, yan sütun). */
export const ONBOARDING_ADD_SCREEN_PLAIN = {
  placeholder: "@kullaniciadi ya da profil bağlantısı",
  hint: "@ ve büyük harf gerekmez; bağlantı yapıştırırsan adı ben ayıklarım.",
  preview: (handle: string): string => `Bakacağım hesap: @${handle}`,
  promise: "Yalnız herkesin görebildiği videolarına bakarım. Şifre istemem, hesabına hiçbir şey yazmam.",
  existing: (handle: string): string => `@${handle} ekli; ona henüz bakmadım.`,
  another: "Başka bir hesap ekle",
  back: (handle: string): string => `@${handle} için kaldığın yere dön`,
  nextHeading: "Sonra ne olacak?",
  next: [
    { figure: "3–5", unit: "dakika", text: "Hesabına bakarım.", detail: "Profilin, son videoların ve sana benzeyen hesaplar." },
    { figure: "3", unit: "hesap", text: "Kimlere bakacağımı sen seçersin.", detail: "İstersen hiçbirini seçmeden, yalnız kendi videolarınla devam edersin." },
    { figure: "20–25", unit: "dakika", text: "İlk planını yazarım.", detail: "Videoları tek tek inceler, bu haftanın planını çıkarırım." },
  ],
  failed: "Hesap eklenemedi. Bağlantını kontrol edip tekrar dene.",
} as const;

/** İlerleme ekranlarının (hesaba bakış, ilk inceleme) ortak metinleri. */
export const ONBOARDING_PROGRESS_PLAIN = {
  stepsHeading: "Şu an yaptıklarım",
  queued: "Sıradayım; birazdan başlıyorum.",
  finishing: "Bitiriyorum; ekran birazdan yenilenir.",
  stale: "Bir süredir ilerleyemiyorum. Biraz daha bekle; düzelmezse sayfayı yenile.",
  durationHeading: "Ne kadar sürer?",
  duration: { probe: { figure: "3–5", unit: "dakika" }, build: { figure: "20–25", unit: "dakika" } },
  counter: (done: number, total: number): string => `${formatNumber(done) ?? String(done)}/${formatNumber(total) ?? String(total)}`,
  stepStatus: { pending: "sırada", running: "şimdi", ok: "tamam", skipped: "gerekmedi", failed: "olmadı", needs_approval: "bekliyor" },
  /** Aşamaya özel adım cümlesi (ana sözlükteki `JOB_STEP_PLAIN[...].doing` yerine): ilk incelemede toplama "videoları getirmek"tir. */
  stepDoing: { probe: {}, build: { collect: "videoları getiriyorum", plan: "planını yazıyorum" } } as Record<OnboardingPhase, Partial<Record<string, string>>>,
} as const;

/** "Bu sen misin?" ekranı. */
export const ONBOARDING_REVIEW_PLAIN = {
  profileHeading: "Bulduğum hesap",
  followers: "takipçi",
  videos: "baktığım video",
  followersUnknown: "takipçi sayısını okuyamadım",
  videosUnknown: "video sayısını okuyamadım",
  verified: "Onaylı hesap",
  typeQuestion: "Bu hesap ne için?",
  typeHint: "Tahminim işaretli; karar senin. Önerilerimi buna göre kurarım.",
  suggested: "Tahminim",
  nicheLabel: "Ne anlatıyorsun, kime sesleniyorsun?",
  nicheHint: "Videolarından çıkardığım taslak bu. Düzelt ya da boş bırak; sonra Ayarlar'dan değiştirebilirsin.",
  notMe: "Bu ben değilim",
  /** "Bu ben değilim" ya da "başka hesap" düğmesi sunucuya ulaşamadı. */
  notMeFailed: "Hesabı bırakamadım. Bağlantını kontrol edip tekrar dene.",
  failed: "Kaydedemedim. Bağlantını kontrol edip tekrar dene.",
} as const;

/** Benzer hesap seçimi ekranı. */
export const ONBOARDING_RIVALS_PLAIN = {
  legend: "Bakacağım benzer hesaplar",
  limit: (max: number): string => `En çok ${formatNumber(max) ?? String(max)} hesap seçebilirsin.`,
  /** Sınır dolunca "Bildiğin bir hesabı ekle" alanı kapanır; neden burada yazılır. */
  addFull: (max: number): string => `En çok ${formatNumber(max) ?? String(max)} hesap seçebilirsin; birinin seçimini kaldırırsan yenisini ekleyebilirsin.`,
  similar: "Boyu sana yakın",
  manual: "Sen ekledin",
  followers: "takipçi",
  followersUnknown: "takipçi sayısı bilinmiyor",
  addLabel: "Bildiğin bir hesabı ekle",
  addButton: "Listeye ekle",
  addFailed: "Hesabı ekleyemedim. Bağlantını kontrol edip tekrar dene.",
  addExists: (handle: string): string => `@${handle} zaten listede.`,
  addBlocked: "Şu an listeye yeni hesap ekleyemiyorum.",
  duration: "Yaklaşık 20–25 dakika sürer; sayfayı kapatabilirsin.",
  noRivalsNote: "Hiçbirini seçmezsen yalnız kendi videolarına bakar, planı onlardan çıkarırım.",
  /** Hiç hesap seçilmemişken "Başlat"ın altındaki not (seçili hesap varken `ONBOARDING_START_NOTE_PLAIN`). */
  noRivalsStartNote: "Başlat dediğinde yalnız kendi videolarına bakar, ilk planını onlardan çıkarırım. Bu, hesap başına bir kez yapılır.",
  failed: "Başlatamadım. Bağlantını kontrol edip tekrar dene.",
  whyHeading: "Neden benzer hesaplar?",
  why: "Sana benzeyen hesaplarda neyin tuttuğunu görürsem, senin için denemeye değer fikirleri daha isabetli seçerim.",
} as const;

/** "İlk planın hazır" ekranı. */
export const ONBOARDING_DONE_PLAIN = {
  planHeading: "Bu haftanın planı",
  planCount: "video önerisi bu haftanın planında",
  planUnknown: "Planın hazır; içini birlikte açalım.",
  openPlan: "Planı aç",
  outliersHeading: "En çok tutan videolar",
  outliersEmpty: "Henüz öne çıkan bir video görmedim; yeni videolar geldikçe burada belirir.",
  untitled: "Açıklamasız video",
  openResults: "Sonuçları aç",
  openToday: "Bugün'e git",
  legacyLead: "Bu hesap için yapılacak bir başlangıç adımı yok.",
  notReadyNext: "Yeni videolar geldikçe yeniden denerim. O zamana kadar gördüklerime Sonuçlar'dan bakabilirsin.",
} as const;

/** Akışın durduğu ekran ve kapalı ortam. */
export const ONBOARDING_BLOCKED_PLAIN = {
  resumeNote: "Yaptıklarım duruyor. Kalan işi bir sonraki haftalık bakışımda tamamlarım.",
  retryNote: "Düzelttiysen yeniden bakabilirim.",
  attempts: (left: number): string => (left === 1 ? "Son bir kez daha deneyebilirim." : `${formatNumber(left) ?? String(left)} kez daha deneyebilirim.`),
  closedHeading: "Şu an buradan ilerleyemiyorum",
} as const;

/** Bugün kartının gövde cümleleri. */
export const ONBOARDING_TODAY_BODY_PLAIN = {
  running: "Hesabına bakıyorum; bitince planın burada görünür. İlerlemeyi görmek istersen aç.",
  waiting: "Hesabını tanıyıp ilk planını çıkarabilmem için birkaç adım kaldı.",
  runningOpen: "İlerlemeyi gör",
} as const;

// ------------------------------------------------------------ Bitiş haberi

/** İş bitince söylenen cümle (zil bildirimi, açık sekmedeki baloncuk, sekme başlığı, tarayıcı bildirimi): başlık kısa, gövde tek cümle. */
export const ONBOARDING_FINISH_PLAIN: Record<OnboardingFinishKind, { title: string; body: string }> = {
  probe_ready: { title: "Hesabına baktım, sıra sende", body: "Bulduklarıma göz at; doğruysa benzer hesapları seçip ilk incelemeyi başlatabilirsin." },
  probe_stopped: { title: "Hesabına bakamadım", body: ONBOARDING_REASON_PLAIN.probe_failed },
  build_ready: { title: "İlk planın hazır", body: "Bu haftanın planı ve en çok tutan videoların seni bekliyor." },
  build_partial: { title: "İlk planın hazır", body: "Bazı adımları tamamlayamadım; yaptıklarım duruyor, planı açıp bakabilirsin." },
  build_no_plan: { title: "Videolarına baktım, plan için biraz daha veri lazım", body: "Yeni videolar geldikçe yeniden denerim. Gördüklerime Sonuçlar'dan bakabilirsin." },
  build_stopped: { title: "İlk incelemeyi bitiremedim", body: "Nedenini ve ne yapabileceğini açınca görürsün." },
};

/** Hesaba bakış durduğunda gövde, durma nedenine göre (gizli, bulunamadı, videosuz); başka neden genel cümleyi kullanır. */
const PROBE_STOP_BODY: Partial<Record<string, string>> = {
  account_private: ONBOARDING_REASON_PLAIN.account_private,
  account_not_found: ONBOARDING_REASON_PLAIN.account_not_found,
  no_videos: ONBOARDING_REASON_PLAIN.no_videos,
};

export interface OnboardingFinishNotice {
  kind: OnboardingFinishKind;
  title: string;
  body: string;
}

/** Bitiş haberinin metni; haber gerekmiyorsa (başlangıç işi değil, süren ya da kullanıcının durdurduğu iş) undefined. */
export function onboardingFinishNotice(input: OnboardingFinishInput): OnboardingFinishNotice | undefined {
  const kind = onboardingFinishKindOf(input);
  if (kind === undefined) return undefined;
  const text = ONBOARDING_FINISH_PLAIN[kind];
  const body = kind === "probe_stopped" ? (PROBE_STOP_BODY[input.outcome ?? ""] ?? text.body) : text.body;
  return { kind, title: text.title, body };
}

/** Baloncuktaki eylem: ilgili akış ekranına götürür. */
export const ONBOARDING_FINISH_ACTION_PLAIN = { open: "Aç" } as const;

/** "Bitince haber ver" (tarayıcı bildirimi; yalnız sekme açıkken çalışır) ve ilerleme ekranının yan notu. */
export const ONBOARDING_NOTIFY_PLAIN = {
  button: "Bitince haber ver",
  /** İzin verilmiş ve açık. */
  on: "Bitince tarayıcıdan haber vereceğim.",
  /** Açık bildirimi kapatan düğme. */
  off: "Vazgeç",
  /** Düğmenin yanındaki dürüst not: sekme kapanırsa bildirim gelmez. */
  limit: "Tarayıcı bildirimi yalnız bu sekme açıkken gelir. Sekmeyi kapatırsan sonucu zildeki bildirimde bulursun.",
  /** İzin reddedildi. */
  denied: "Tarayıcı bildirimine izin vermedin; sonucu zilde bulursun.",
  /** Sekme başlığındaki işaret. */
  tabMark: "●",
  /** Süren işte yan sütunda: şu an ne yapılıyor ve ayrılabilirsin. */
  closableHeading: "Beklemek zorunda değilsin",
  closableBody: {
    probe: "Başka bir sekmeye geçebilir ya da sayfayı kapatabilirsin. Ben devam ederim; bitince zildeki bildirimde haber veririm.",
    build: "Başka bir sekmeye geçebilir ya da sayfayı kapatabilirsin. Ben devam ederim; bitince zildeki bildirimde haber veririm, sonucu burada bulursun.",
  } satisfies Record<OnboardingPhase, string>,
} as const;
