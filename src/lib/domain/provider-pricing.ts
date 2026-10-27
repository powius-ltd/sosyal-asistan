/**
 * Yapay zekâ sağlayıcılarının API liste fiyatları: TEK tablo, sürümlü. Kullanım: abonelik koşuları (agy/Gemini, Claude CLI) için
 * "API'de tutardı" gölge maliyeti (okuma anında, saklanan token'lardan hesaplanır; DB'ye tutar yazılmaz). Plan: `docs/KREDI-PLAN.md` §2.
 *
 * Kurallar (`undefined ≠ 0`):
 *  - Token sayısı bilinmiyorsa (giriş ya da çıkış eksik), model tanınmıyorsa ya da fiyat o tarihte tanımlı değilse tutar `undefined`'dır.
 *  - Fiyat değişirse: `PROVIDER_PRICE_VERSION` artar, eski aralık tabloda kalır (geçmiş koşular kendi tarihinin fiyatıyla okunur).
 *  - Gemini çıkış fiyatı düşünme (thinking) token'larını da kapsar: agy `usage.output_tokens` zaten düşünmeyi içerir (toplam = giriş + çıkış).
 *  - Claude girişi, CLI'nin önbellek okuma/yazmasını da içerir (üst sınır; doğrudan API'de daha düşük çıkar). Haiku fiyatı ≤ 100 bin
 *    token'lık istem içindir: üstü bu tabloda YOK, tutar `undefined` döner (düşük fiyatla eksik sayılmaz).
 *  - Model adı TAM eşleşir (isteğe bağlı, fiyatı değiştirmeyen sonekle): `-lite` gibi türevler başka fiyatlıdır, ana model sayılmaz.
 * Saf dosya (sunucu + istemci).
 */
import type { RunProvider, ShadowApiCost } from "@/lib/domain/run";

/** Fiyat tablosunun sürümü; tablo (fiyat, model, aralık) her değiştiğinde artar. */
export const PROVIDER_PRICE_VERSION = "2026-10-12";

export const PRICED_MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5", "gemini-3-8-flash"] as const;
export type PricedModel = (typeof PRICED_MODELS)[number];

/** Bir fiyat aralığı: MTok (milyon token) başına USD. `from` (dahil, YYYY-MM-DD, UTC) yoksa en baştan geçerlidir. */
interface PriceWindow {
  from?: string;
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  /** Fiyatın geçerli olduğu en büyük giriş (token); üstü tabloda yok (tutar hesaplanmaz). Yoksa sınırsız. */
  maxInputTokens?: number;
}

/** Aralıklar `from`'a göre artan sıradadır (ilki `from`'suz). */
const PRICE_WINDOWS: Record<PricedModel, readonly PriceWindow[]> = {
  "claude-sonnet-5-5": [{ inputPerMTokUsd: 2, outputPerMTokUsd: 10 }],
  "claude-haiku-5-5": [{ inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.5, maxInputTokens: 100_000 }],
  "claude-opus-5-5": [{ inputPerMTokUsd: 4, outputPerMTokUsd: 20 }],
  // 31.12.2026'ya kadar $0,75 / $3,75; 1.1.2027'den itibaren iki katı.
  "gemini-3-8-flash": [
    { inputPerMTokUsd: 0.75, outputPerMTokUsd: 3.75 },
    { from: "2027-01-01", inputPerMTokUsd: 1.5, outputPerMTokUsd: 7.5 },
  ],
};

/** Kısa ad → model (Claude CLI `--model sonnet`). */
const MODEL_ALIASES: Record<string, PricedModel> = { sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5", opus: "claude-opus-5-5" };
/**
 * Fiyatı DEĞİŞTİRMEYEN sonekler: Gemini'de düşünme düzeyi (`-low` / `-medium` / `-high` / `-minimal`), Claude'da sürüm tarihi (`-20261001`)
 * ve `-latest`. Bunların dışındaki her sonek (`-lite`, `-8b`, `-preview` …) başka bir modeldir.
 */
const NEUTRAL_SUFFIX: Record<PricedModel, RegExp> = {
  "gemini-3-8-flash": /^-(low|medium|high|minimal)$/,
  "claude-sonnet-5-5": /^-(\d{8}|latest)$/,
  "claude-haiku-5-5": /^-(\d{8}|latest)$/,
  "claude-opus-5-5": /^-(\d{8}|latest)$/,
};

/**
 * Model adı → tablo anahtarı. Ham ad CLI'nin bildirdiği ya da yapılandırılan ad olabilir ("gemini-3.8-flash-medium",
 * "claude-opus-5-5[1m]", "sonnet"). Eşleşme TAM addır ya da ad + fiyatı değiştirmeyen sonektir; türev ("gemini-3.8-flash-lite") ve
 * tanınmayan ad → undefined (fiyat uydurulmaz).
 */
export function resolvePricedModel(raw: string | undefined): PricedModel | undefined {
  if (raw === undefined) return undefined;
  const name = raw.trim().toLowerCase().replace(/\[[^\]]*\]$/, "").replaceAll(".", "-");
  if (name === "") return undefined;
  if (Object.hasOwn(MODEL_ALIASES, name)) return MODEL_ALIASES[name];
  return PRICED_MODELS.find((model) => name === model || (name.startsWith(model) && NEUTRAL_SUFFIX[model].test(name.slice(model.length))));
}

function windowAt(model: PricedModel, at: Date): PriceWindow | undefined {
  if (Number.isNaN(at.getTime())) return undefined;
  const day = at.toISOString().slice(0, 10);
  return [...PRICE_WINDOWS[model]].reverse().find((window) => window.from === undefined || window.from <= day);
}

export interface ApiPriceInput {
  model: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  /** Koşunun yapıldığı an (fiyat aralığı buna göre seçilir). */
  at: Date;
}

/** Fiyat neden hesaplanamadı: `no_tokens` = token kaydı eksik / geçersiz · `no_price` = model ya da bu kullanım fiyat tablosunda yok. */
export type ApiPriceGap = "no_tokens" | "no_price";
export type ApiPrice = { usd: number } | { usd?: undefined; gap: ApiPriceGap };

/** Bu çağrı API liste fiyatıyla kaç USD tutardı; hesaplanamıyorsa nedeni (tutar uydurulmaz). */
export function apiPrice(input: ApiPriceInput): ApiPrice {
  const { inputTokens, outputTokens } = input;
  if (inputTokens === undefined || outputTokens === undefined) return { gap: "no_tokens" };
  if (![inputTokens, outputTokens].every((count) => Number.isFinite(count) && count >= 0)) return { gap: "no_tokens" };
  const model = resolvePricedModel(input.model);
  if (model === undefined) return { gap: "no_price" };
  const window = windowAt(model, input.at);
  if (window === undefined) return { gap: "no_price" };
  if (window.maxInputTokens !== undefined && inputTokens > window.maxInputTokens) return { gap: "no_price" };
  return { usd: (inputTokens * window.inputPerMTokUsd + outputTokens * window.outputPerMTokUsd) / 1_000_000 };
}

/** `apiPrice`'ın yalnız tutarı. Token eksik / negatif, model tanınmıyor, tablo dışı kullanım ya da tarih geçersiz → undefined (0 değil). */
export function apiPriceUsd(input: ApiPriceInput): number | undefined {
  return apiPrice(input).usd;
}

/**
 * Model adı KAYDEDİLMEMİŞ abonelik koşusunun hangi modelle fiyatlanacağı (sağlayıcıya göre VARSAYIM): agy video incelemesi Gemini 3.8 Flash,
 * Claude CLI Sonnet 5.5 (plan §8 model politikası). Koşunun modeli kayıtlıysa (`collection_runs.model`, migration 0017) O kullanılır; kayıtlı
 * model fiyat tablosunda yoksa tutar uydurulmaz (koşu "fiyatı hesaplanamayan" sayılır).
 */
export const SUBSCRIPTION_SHADOW_MODEL: Partial<Record<RunProvider, PricedModel>> = {
  gemini: "gemini-3-8-flash",
  claude_cli: "claude-sonnet-5-5",
};

/** Gölge maliyeti hesaplanan koşunun alt kümesi (`CollectionRun`). */
export interface ShadowRunInput {
  provider: RunProvider;
  billing: "metered" | "subscription";
  inputTokens?: number;
  outputTokens?: number;
  /** Koşunun kayıtlı modeli; yoksa sağlayıcı varsayımı (`SUBSCRIPTION_SHADOW_MODEL`). */
  model?: string;
  startedAt: string;
}

/** Koşunun fiyatlanacağı model adı: kayıtlı model, yoksa sağlayıcı varsayımı. */
export function shadowModelOf(run: Pick<ShadowRunInput, "provider" | "model">): string | undefined {
  return run.model ?? SUBSCRIPTION_SHADOW_MODEL[run.provider];
}

/** Abonelik koşularının gölge maliyeti (saf; mock ve Supabase AYNI fonksiyonu kullanır). Abonelik dışı koşular sayılmaz. */
export function shadowApiCost(runs: readonly ShadowRunInput[]): ShadowApiCost {
  let total = 0;
  let pricedRuns = 0;
  let unpricedRuns = 0;
  let unlistedRuns = 0;
  for (const run of runs) {
    if (run.billing !== "subscription") continue;
    const price = apiPrice({
      model: shadowModelOf(run),
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      at: new Date(run.startedAt),
    });
    if (price.usd === undefined) {
      unpricedRuns += 1;
      if (price.gap === "no_price") unlistedRuns += 1;
      continue;
    }
    total += price.usd;
    pricedRuns += 1;
  }
  return { ...(pricedRuns === 0 ? {} : { usd: total }), pricedRuns, unpricedRuns, unlistedRuns, priceVersion: PROVIDER_PRICE_VERSION };
}
