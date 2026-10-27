/**
 * Panel rotaları — tek kaynak. Gezinme (`shell/nav-items.ts`), bağlantı bileşenleri ve yönlendirmeler buradan alır.
 * Rota adları Türkçe (kullanıcıya görünür), dosya/klasör içi adlar İngilizce.
 * `scripts/smoke-routes.mjs` aynı listeyi ayrıca tutar (mjs, TS içe aktaramaz) — biri değişirse diğeri de.
 */
/** Fiş sayfalarının ortak yol öneki (`ROUTES.ticket` + gezinmede ait olduğu ana madde, `shell/nav-items.ts`). */
export const TICKET_ROUTE_PREFIX = "/fis";

export const ROUTES = {
  overview: "/",
  /** Bu hafta: haftalık içerik planı (Plan maddesinin ilk sekmesi). */
  thisWeek: "/bu-hafta",
  /** Sonuçlar: sayılar, grafikler, son tutan videolar, en iyi saatler ("Bugün"ün eski Ayrıntılar bölümü). */
  results: "/sonuclar",
  /** İçeriklerim: Videolar maddesinin ilk sekmesi (`/videolar` rotası D6'da gelir; bu adres çalışmaya devam eder). */
  content: "/icerikler",
  competitors: "/rakipler",
  discover: "/rakipler/kesfet",
  /** Karşılaştırma: kendi hesap ↔ rakipler, LLM'siz içgörüler (Sonuçlar sekmesi). */
  comparison: "/rakipler/karsilastirma",
  outliers: "/tutanlar",
  /** Kaydedilen içerikler (profil menüsü → Kulis). */
  collections: "/koleksiyonlar",
  /** Açılış (hook) kütüphanesi (Sonuçlar sekmesi, "Neye dayanıyorum"). */
  hooks: "/tutanlar/hooklar",
  /** Kreatif anatomisi: video zaman çizelgesi + kendi ↔ rakip ↔ tutan reçetesi (Sonuçlar sekmesi, "Neye dayanıyorum"). */
  anatomy: "/anatomi",
  /** Reklamlar: reklam hesabının harcama / sonuç özeti ve öneriler (Sonuçlar sekmesi; yalnız yönetici modunda). Yalnız okur, reklam hesabına yazmaz. */
  ads: "/reklamlar",
  notifications: "/bildirimler",
  ideas: "/fikirler",
  publish: "/yayin",
  settings: "/ayarlar",
  /** İşler: panelden başlatılan işler (haftalık tur, toplama, ölçüm …), ilerleme ve geçmiş (profil menüsü → Kulis; yalnız yönetici modunda). */
  jobs: "/isler",
  /** Başlangıç akışı: hesap ekle → hesaba bakış → tür / konu → rakipler → ilk plan (adım veriden türetilir; `domain/onboarding.ts`). */
  onboarding: "/baslangic",
  /** Video analizi: `/video/[id]` (id = content_items.id). */
  video: (contentId: string) => `/video/${encodeURIComponent(contentId)}`,
  /** Fiş (çekim siparişi): `/fis/[id]` (id = studio_orders.id). Gezinmede maddesi yok; fikir kartı ve plan öğesindeki düğmeden açılır. */
  ticket: (orderId: string) => `${TICKET_ROUTE_PREFIX}/${encodeURIComponent(orderId)}`,
  /** Reklam ayrıntısı: `/reklamlar/[id]` (id = ads.id; yalnız yönetici modunda). */
  ad: (adId: string) => `/reklamlar/${encodeURIComponent(adId)}`,
} as const;

/**
 * API yolları (route handler; sayfa değil). `ROUTES`'tan ayrı: `ROUTES` duman testi listesiyle birebir eşleşir, API yolu
 * `POST` ile çalışır ve GET duman testine girmez. Çalışma alanı hiçbir API gövdesinden değil `getPanelContext()`'ten çözülür.
 */
export const API_ROUTES = {
  /** Sohbet kutusu: `POST`, yanıt NDJSON aşama olayları. */
  chat: "/api/sohbet",
  /** Panel işi durumu: `GET`, yan etkisiz; yanıt `JobsStatusResponse` (`domain/panel-job-view.ts`). İş BAŞLATMAZ (o, server action'dır). */
  jobs: "/api/isler",
} as const;

/**
 * Yazdırılabilir rapor sayfaları: panel kabuğu (menü, üst şerit, sohbet) olmadan, kendi düzeniyle çizilir (`app/(rapor)`). `ROUTES`'ta DEĞİL:
 * menüde yeri yok (gezinme testi `ROUTES`'taki her adresin menüde olmasını ister); duman testi bunları ayrıca dener.
 */
export const REPORT_ROUTES = {
  /** Haftalık yol haritası (müşteriye PDF). Hafta: `PLAN_WEEK_PARAM` (`?hafta=YYYY-AA-GG`, Pazartesi). */
  weekly: "/rapor/haftalik",
} as const;

/** Haftalık rapor adresi: `weeklyReportFor("2026-10-12")` → `/rapor/haftalik?hafta=2026-10-12`. Hafta yok ya da biçimsizse parametresiz (en son plan). */
export function weeklyReportFor(weekStart?: string): string {
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return REPORT_ROUTES.weekly;
  return `${REPORT_ROUTES.weekly}?${new URLSearchParams({ [PLAN_WEEK_PARAM]: weekStart }).toString()}`;
}

/** `GET /api/isler` iş parametresinin adı; değer `panel_jobs.id` (basılan düğme kendi işinin sonucunu bununla okur). */
export const JOBS_STATUS_ID_PARAM = "id";

/** Durum ucunun adresi: `jobsStatusUrl()` → `/api/isler`; `jobsStatusUrl("…")` → `/api/isler?id=…` (yanıtta `job` alanı dolar). */
export function jobsStatusUrl(jobId?: string): string {
  if (!jobId) return API_ROUTES.jobs;
  return `${API_ROUTES.jobs}?${new URLSearchParams({ [JOBS_STATUS_ID_PARAM]: jobId }).toString()}`;
}

/** `/anatomi` tek video parametresinin adı; değer `content_items.id`. Adres üretimi ve sayfa okuması TEK yerden. */
export const ANATOMY_VIDEO_PARAM = "video";

/** `/anatomi` adresi: `anatomyFor("ci_001")` → `/anatomi?video=ci_001`. İçerik kimliği yoksa parametresiz (video seçici). */
export function anatomyFor(contentId?: string): string {
  if (!contentId) return ROUTES.anatomy;
  return `${ROUTES.anatomy}?${new URLSearchParams({ [ANATOMY_VIDEO_PARAM]: contentId }).toString()}`;
}

/** `/bu-hafta` hafta parametresinin adı; değer haftanın Pazartesi'si (YYYY-MM-DD). Adres üretimi ve sayfa okuması TEK yerden. */
export const PLAN_WEEK_PARAM = "hafta";

/** `/bu-hafta` adresi: `thisWeekFor("2026-09-28")` → `/bu-hafta?hafta=2026-09-28`. Hafta yok ya da biçimsizse parametresiz (en son plan). */
export function thisWeekFor(weekStart?: string): string {
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return ROUTES.thisWeek;
  return `${ROUTES.thisWeek}?${new URLSearchParams({ [PLAN_WEEK_PARAM]: weekStart }).toString()}`;
}
