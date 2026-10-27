/**
 * Önizleme güvenlik testinin G/Ç KORUMASI (yalnız testler içe aktarır; `preview-safety.db.test.ts`). İşçi GERÇEK bağlamayla koşarken
 * süreçten çıkan her ağ çağrısını ve her alt süreç denemesini görür; izin dışı olanı kaydeder ve FIRLATIR (ağa / diske ulaşmaz).
 *
 * İzinli olan (yalnız `watch` içinde denetlenir; dışında test kendi kurulumunu yapar):
 *  - Supabase'den OKUMA (GET / HEAD);
 *  - işçinin KENDİ iş satırı: `claim_panel_job` (yalnız izlenen kuyruk) ve `panel_jobs` yaması (yalnız izlenen iş ya da izlenen kuyruk);
 *  - sağlayıcıdan aktör FİYATI okuma (GET; ücretsiz): ağa çıkılmaz, sabit sahte fiyat döner (test belirlenimli kalır).
 * Başka her çağrı ihlaldir: tabloya yazma, başka RPC, toplama koşusu başlatma, dataset okuma, video indirme, bilinmeyen adres.
 */
/** Sahte aktör birim fiyatı (USD / sonuç): tahminler bundan hesaplanır. */
export const PREVIEW_UNIT_PRICE_USD = 0.0025;

const PROVIDER_ORIGIN = "https://api.apify.com";
const ACTOR_PATH = /^\/v2\/acts\/[^/]+$/;
const CLAIM_PATH = "/rest/v1/rpc/claim_panel_job";
const JOBS_PATH = "/rest/v1/panel_jobs";
const CHILD_PROCESS_STARTERS = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;

export interface NetCall {
  origin: string;
  method: string;
  path: string;
}

/** İşçinin dokunabileceği tek satır kümesi: bu kuyruk ve bu iş. */
export interface WatchScope {
  queue: string;
  jobId: string;
}

export interface PreviewGuard {
  /** `globalThis.fetch` yerine konur. */
  fetch: typeof fetch;
  /** Korumanın dışından gerçek çağrı (testin kendi sayımı için). */
  realFetch: typeof fetch;
  /** İzleme sırasındaki Supabase çağrıları + sağlayıcıya giden her çağrı. */
  calls: NetCall[];
  /** İzin dışı çağrılar (her biri ayrıca fırlatılmıştır). */
  violations: string[];
  /** `run` boyunca Supabase çağrılarını `scope`'a göre denetler. */
  watch<T>(scope: WatchScope, run: () => Promise<T>): Promise<T>;
  /** Kayıtları boşaltır. */
  reset(): void;
}

function queueOfBody(body: unknown): string | undefined {
  if (typeof body !== "string") return undefined;
  try {
    const queue = (JSON.parse(body) as { p_queue?: unknown }).p_queue;
    return typeof queue === "string" ? queue : undefined;
  } catch {
    return undefined;
  }
}

export function createPreviewGuard(options: { supabaseUrl: string; realFetch: typeof fetch }): PreviewGuard {
  const supabaseOrigin = new URL(options.supabaseUrl).origin;
  const calls: NetCall[] = [];
  const violations: string[] = [];
  let scope: WatchScope | undefined;

  const refuse = (what: string): never => {
    violations.push(what);
    throw new Error(`Önizleme testinde yasak çağrı: ${what}`);
  };

  /** İzleme sırasındaki Supabase çağrısı izinli mi; değilse ihlalin açıklaması. */
  const supabaseProblem = (watched: WatchScope, method: string, url: URL, body: unknown): string | undefined => {
    if (method === "GET" || method === "HEAD") return undefined;
    if (method === "POST" && url.pathname === CLAIM_PATH) {
      const queue = queueOfBody(body);
      return queue === watched.queue ? undefined : `Supabase POST ${url.pathname} (kuyruk: ${queue ?? "?"})`;
    }
    if (method === "PATCH" && url.pathname === JOBS_PATH) {
      const own = url.searchParams.get("id") === `eq.${watched.jobId}` || url.searchParams.get("queue") === `eq.${watched.queue}`;
      return own ? undefined : `Supabase PATCH ${url.pathname} (başka satır: ${url.search})`;
    }
    return `Supabase ${method} ${url.pathname}`;
  };

  const guarded: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const call: NetCall = { origin: url.origin, method, path: url.pathname };

    if (url.origin === PROVIDER_ORIGIN) {
      calls.push(call);
      if (method !== "GET" || !ACTOR_PATH.test(url.pathname)) return refuse(`sağlayıcı ${method} ${url.pathname}`);
      return Response.json({ data: { id: "onizleme-aktor", pricingInfos: [{ pricingModel: "PRICE_PER_DATASET_ITEM", pricePerUnitUsd: PREVIEW_UNIT_PRICE_USD }] } });
    }
    if (url.origin !== supabaseOrigin) return refuse(`bilinmeyen adres ${method} ${url.origin}`);
    if (scope !== undefined) {
      calls.push(call);
      const problem = supabaseProblem(scope, method, url, init?.body);
      if (problem !== undefined) return refuse(problem);
    }
    return options.realFetch(input, init);
  };

  return {
    fetch: guarded,
    realFetch: options.realFetch,
    calls,
    violations,
    async watch(watched, run) {
      scope = watched;
      try {
        return await run();
      } finally {
        scope = undefined;
      }
    },
    reset() {
      calls.length = 0;
      violations.length = 0;
    },
  };
}

/**
 * `node:child_process` taklidi (`vi.mock` fabrikası bunu döndürür): süreç başlatan her işlev denemeyi `spawned`'a yazar ve fırlatır.
 * Yazı / video aracı (alt süreç) önizlemede hiç başlatılmamalıdır; başlatılmaya çalışılırsa test bunu görür ve araç çalışmaz.
 */
export function forbiddenChildProcess<T extends object>(original: T, spawned: string[]): T {
  const blocked = Object.fromEntries(
    CHILD_PROCESS_STARTERS.map((starter) => [
      starter,
      (command?: unknown) => {
        spawned.push(`${starter} ${String(command)}`);
        throw new Error(`Önizleme testinde alt süreç yasak (${starter}).`);
      },
    ]),
  );
  return { ...original, ...blocked, default: { ...original, ...blocked } } as T;
}
