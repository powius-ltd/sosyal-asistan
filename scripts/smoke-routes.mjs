#!/usr/bin/env node
/**
 * Duman testi: çalışan sunucudaki TÜM panel rotalarına GET atar.
 * Her rota için: HTTP 200 + gövdede hata izi yok ("Application error", akış hatası işareti).
 *
 * Kullanım (sunucu ayrıca çalışıyor olmalı):
 *   npm run start &        # ya da npm run dev
 *   npm run smoke
 *
 * Ortam değişkenleri:
 *   BASE_URL          varsayılan http://localhost:3100
 *   SMOKE_VIDEO_ID    /video/[id] için içerik kimliği; verilmezse /icerikler sayfasındaki
 *                     ilk /video/<id> bağlantısı, o da yoksa "ci_001" kullanılır
 *   SMOKE_COLLECTION_ID  /koleksiyonlar?id=<kimlik> için koleksiyon kimliği; verilmezse /koleksiyonlar
 *                     sayfasındaki ilk ?id= bağlantısı, o da yoksa "col_01" kullanılır
 *   SMOKE_WAIT_MS     sunucunun ayağa kalkmasını bekleme süresi (varsayılan 30000)
 *   SMOKE_WORKSPACE   çalışma alanı kimliği (operatör modu `sp_ws` çerezi); verilmezse varsayılan çalışma alanı
 *
 * Rota listesi src/lib/routes.ts ile aynı olmalı (mjs, TS içe aktaramaz).
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const WAIT_MS = Number(process.env.SMOKE_WAIT_MS ?? 30_000);
const REQUEST_TIMEOUT_MS = 60_000;
const FALLBACK_VIDEO_ID = "ci_001";
const FALLBACK_COLLECTION_ID = "col_01";
/** Operatör modu: verilirse tüm istekler bu çalışma alanıyla gider (`sp_ws` çerezi; boş çalışma alanı denetimi için). */
const WORKSPACE_COOKIE = process.env.SMOKE_WORKSPACE ? `sp_ws=${process.env.SMOKE_WORKSPACE}` : undefined;

/** Gövdede görülürse sayfa çökmüş demektir. `data-dgst`: Next'in akış sırasında yakalanan hata işareti. */
const ERROR_MARKERS = ["Application error", "data-dgst="];

const STATIC_ROUTES = [
  "/",
  "/bu-hafta",
  "/sonuclar",
  "/icerikler",
  "/rakipler",
  "/rakipler/kesfet",
  "/rakipler/karsilastirma",
  "/tutanlar",
  "/fikirler",
  "/yayin",
  "/ayarlar",
  "/otomatik",
  "/koleksiyonlar",
  "/tutanlar/hooklar",
  "/bildirimler",
  "/anatomi",
  "/reklamlar",
  "/isler",
  "/baslangic",
];

async function fetchPage(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: WORKSPACE_COOKIE ? { cookie: WORKSPACE_COOKIE } : {},
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer() {
  const deadline = Date.now() + WAIT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await fetchPage("/");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Sunucuya ulaşılamadı (${BASE_URL}): ${lastError?.cause?.code ?? lastError?.message ?? lastError}`);
}

async function resolveVideoId() {
  if (process.env.SMOKE_VIDEO_ID) return process.env.SMOKE_VIDEO_ID;
  try {
    const { body } = await fetchPage("/icerikler");
    const match = body.match(/href="\/video\/([^"/?#]+)"/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // aşağıdaki varsayılana düş
  }
  return FALLBACK_VIDEO_ID;
}

/** /fis/[id]: kimlik fikir / plan sayfalarındaki "Fişi aç" bağlantısından okunur; hiç fiş yoksa rota atlanır (varsa 200 beklenir). */
async function resolveTicketId() {
  if (process.env.SMOKE_TICKET_ID) return process.env.SMOKE_TICKET_ID;
  for (const path of ["/fikirler", "/bu-hafta"]) {
    try {
      const { body } = await fetchPage(path);
      const match = body.match(/href="\/fis\/([^"/?#]+)"/);
      if (match) return decodeURIComponent(match[1]);
    } catch {
      // sıradaki sayfaya düş
    }
  }
  return undefined;
}

async function resolveCollectionId() {
  if (process.env.SMOKE_COLLECTION_ID) return process.env.SMOKE_COLLECTION_ID;
  try {
    const { body } = await fetchPage("/koleksiyonlar");
    const match = body.match(/href="\/koleksiyonlar\?id=([^"&#]+)"/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // aşağıdaki varsayılana düş
  }
  return FALLBACK_COLLECTION_ID;
}

async function check(path) {
  try {
    const { status, body } = await fetchPage(path);
    if (status !== 200) return { path, ok: false, detail: `HTTP ${status}` };
    const marker = ERROR_MARKERS.find((m) => body.includes(m));
    if (marker) return { path, ok: false, detail: `gövdede hata izi: "${marker}"` };
    return { path, ok: true, detail: "200" };
  } catch (error) {
    return { path, ok: false, detail: error?.name === "AbortError" ? "zaman aşımı" : String(error?.message ?? error) };
  }
}

try {
  await waitForServer();
} catch (error) {
  console.error(`smoke — ${error.message}`);
  process.exit(1);
}

const videoId = await resolveVideoId();
const collectionId = await resolveCollectionId();
const ticketId = await resolveTicketId();
const routes = [
  ...STATIC_ROUTES.slice(0, 5),
  `/video/${encodeURIComponent(videoId)}`,
  ...STATIC_ROUTES.slice(5),
  // Aynı sayfanın ayrıntı/sekme dalları: koleksiyon ayrıntısı ve haftalık özet.
  `/koleksiyonlar?id=${encodeURIComponent(collectionId)}`,
  "/bildirimler?sekme=ozet",
  // Fiş (`ROUTES.ticket`): fişi olan bir fikir yoksa bu satır yok (varsa 200 beklenir).
  ...(ticketId ? [`/fis/${encodeURIComponent(ticketId)}`] : []),
  // Kreatif anatomisi tek video (`ANATOMY_VIDEO_PARAM`): analizi olmayan içerik de 200 verir ("analiz yok" mesajı).
  `/anatomi?video=${encodeURIComponent(videoId)}`,
  // Yazdırılabilir rapor (`REPORT_ROUTES`, panel kabuğu yok): en son plan, plansız (uzak) hafta ve biçimsiz hafta da 200 verir.
  "/rapor/haftalik",
  "/rapor/haftalik?hafta=2000-01-03",
  "/rapor/haftalik?hafta=bozuk",
];

const results = [];
for (const route of routes) {
  const result = await check(route); // sıralı: dev sunucuda derlemeyi ezmesin
  results.push(result);
  console.log(`${result.ok ? "OK  " : "FAIL"}  ${route.padEnd(28)} ${result.detail}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nsmoke — ${results.length - failed.length}/${results.length} rota geçti (${BASE_URL})`);
process.exit(failed.length > 0 ? 1 : 0);
