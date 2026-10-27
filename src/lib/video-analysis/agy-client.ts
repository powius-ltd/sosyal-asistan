/**
 * `agy` (Antigravity CLI, abonelik) alt süreç istemcisi: TEK çağrı + kota geri çekilmesi. Komut biçimi kreatif-olcer `olc.mts` örneğinden
 * (CLI yolu) alındı ve `agy --help` (1.2.14) ile doğrulandı:
 *   agy --model <m> --output-format json --print-timeout <n>s --json-schema <dosya> --add-dir <klasör>   (istem STDIN'den)
 *  - `--add-dir` ZORUNLU: verilmezse ajan "çalışma alanı yok" deyip dosyayı açamaz. `cwd` aynı izole geçici klasördür (proje klasöründe
 *    koşarsa CLI proje kurallarını/AGENTS.md'yi bağlama karıştırır).
 *  - İstem argümanla değil stdin'le verilir (boşluklu/uzun metin argüman olarak bölünüyor). `shell: false` (`runSubprocess`).
 *  - ORTAM HİJYENİ: alt sürece yalnız sistem değişkenleri geçer (izin listesi, `subprocess.ts`). Servis anahtarları (Supabase/Apify/cron) agy'ye
 *    ve rakip içeriğine açılmaz; ayrıca API anahtarı kalırsa agy abonelik yerine ANAHTAR OTURUMUNA düşüp ücretlendirirdi (kreatif-olcer notu).
 *    Abonelik oturumu kullanıcı klasöründedir (USERPROFILE/APPDATA), ortam değişkeni gerekmez.
 *  - `--sandbox` (terminal kısıtı): ajan araç kullanabilir; kabuk komutu çalıştıramasın. Kapatmak için `AGY_SANDBOX=off`.
 *  - Varlık kontrolü `agy --version` ile (eski `gemini-cli` aranmaz).
 *  - 429 / kota: 8 sn, sonra 16 sn bekleyip yeniden dener (`sleep` enjekte). agy kendi içinde de yeniden dener ve günlük/fatura
 *    tavanında hemen durur; bu katman yalnız kısa süreli sınırları aşmak içindir.
 */
import "server-only";

import { assertSuccess, SubprocessError, type SubprocessRunner } from "@/lib/llm/subprocess";
import { envPositiveInt, envString, type Env } from "@/lib/video-analysis/env";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";

export const DEFAULT_AGY_MODEL = "gemini-3.8-flash-medium";
export const DEFAULT_AGY_TIMEOUT_MS = 480_000;
/** Kota hatasında bekleme basamakları (ms): 1. yeniden deneme 8 sn, 2. yeniden deneme 16 sn. */
export const QUOTA_BACKOFF_MS = [8_000, 16_000] as const;
/** agy kendi süre sınırını bizim öldürme süremizden KISA tutar (önce kendi kapanır). */
const KILL_GRACE_MS = 20_000;
const VERSION_TIMEOUT_MS = 20_000;

export interface AgyConfig {
  bin: string;
  model: string;
  timeoutMs: number;
  /** `--sandbox` (varsayılan açık; yalnız `false` kapatır). */
  sandbox?: boolean;
}

export function readAgyConfig(env: Env): AgyConfig {
  return {
    bin: envString(env, "AGY_BIN") ?? "agy",
    model: envString(env, "AGY_MODEL") ?? DEFAULT_AGY_MODEL,
    timeoutMs: envPositiveInt(env, "AGY_TIMEOUT_MS", DEFAULT_AGY_TIMEOUT_MS),
    ...(envString(env, "AGY_SANDBOX")?.toLowerCase() === "off" ? { sandbox: false } : {}),
  };
}

/** Bir koşunun çağrı istatistiği (D bununla `collection_runs` satırı açar: `billing 'subscription'`). */
export interface CallStats {
  /** agy alt süreci kaç kez başlatıldı (yeniden denemeler ve düzeltme turu dahil). */
  calls: number;
  /** Kota (429) yüzünden yapılan yeniden deneme sayısı. */
  retries: number;
  /** Şema hatası sonrası yapılan düzeltme turu (0 ya da 1). */
  correctionTurns: number;
  /** agy alt süreçlerinin toplam süresi (ms; bekleme süreleri hariç). */
  durationMs: number;
  /**
   * Zarftaki giriş / çıkış (düşünme dahil) / toplam / düşünme token'ı (agy `usage`), tüm çağrıların (düzeltme turu dahil) toplamı;
   * zarfta yoksa tanımsız (0 değil). Giriş + çıkış `collection_runs.input_tokens/output_tokens`'a yazılır (gölge maliyet).
   */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  thinkingTokens?: number;
}

export const emptyStats = (): CallStats => ({ calls: 0, retries: 0, correctionTurns: 0, durationMs: 0 });

export interface AgyDeps {
  runner: SubprocessRunner;
  sleep: (ms: number) => Promise<void>;
  config: AgyConfig;
}

export interface AgyAvailability {
  available: boolean;
  /** `agy --version` çıktısı (varsa). */
  version?: string;
  reason?: string;
}

/** `agy --version` ile varlık kontrolü (model çağrısı yapmaz, abonelik harcamaz). */
export async function checkAgyAvailable(deps: Pick<AgyDeps, "runner" | "config">): Promise<AgyAvailability> {
  try {
    const result = await deps.runner({ command: deps.config.bin, args: ["--version"], timeoutMs: VERSION_TIMEOUT_MS });
    assertSuccess(result, "agy --version");
    return { available: true, version: result.stdout.trim().split(/\r?\n/)[0] };
  } catch (error) {
    if (error instanceof SubprocessError && error.code === "spawn_failed") {
      return { available: false, reason: "agy bulunamadı: kurun ya da AGY_BIN ile tam yolunu verin." };
    }
    return { available: false, reason: error instanceof Error ? error.message : "agy çalıştırılamadı." };
  }
}

const QUOTA_SIGNATURE = /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i;

export function isQuotaFailure(stderr: string, stdout: string): boolean {
  return QUOTA_SIGNATURE.test(stderr) || QUOTA_SIGNATURE.test(stdout.slice(0, 2000));
}

export interface AgyRunInput {
  /** Video + şema dosyasının bulunduğu izole klasör (cwd ve `--add-dir`). */
  dir: string;
  /** `--json-schema` dosya yolu. */
  schemaPath: string;
  prompt: string;
}

export function buildAgyArgs(config: AgyConfig, input: Pick<AgyRunInput, "dir" | "schemaPath">): string[] {
  return [
    "--model",
    config.model,
    "--output-format",
    "json",
    "--print-timeout",
    `${Math.ceil(config.timeoutMs / 1000)}s`,
    "--json-schema",
    input.schemaPath,
    "--add-dir",
    input.dir,
    ...(config.sandbox === false ? [] : ["--sandbox"]),
  ];
}

/** Tek agy çağrısı (kota durumunda 8 sn / 16 sn geri çekilmeyle yeniden dener). Ham stdout döner. */
export async function runAgy(input: AgyRunInput, deps: AgyDeps, stats: CallStats): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let result;
    try {
      result = await deps.runner({
        command: deps.config.bin,
        args: buildAgyArgs(deps.config, input),
        input: input.prompt,
        cwd: input.dir,
        timeoutMs: deps.config.timeoutMs + KILL_GRACE_MS,
      });
    } catch (error) {
      if (error instanceof SubprocessError && error.code === "spawn_failed") {
        throw new VideoAnalysisError("agy_missing", "agy bulunamadı: kurun ya da AGY_BIN ile tam yolunu verin.");
      }
      throw error;
    }
    stats.calls += 1;
    stats.durationMs += result.durationMs;

    try {
      return assertSuccess(result, "agy").stdout;
    } catch (error) {
      if (!(error instanceof SubprocessError)) throw error;
      if (error.code === "timeout") throw new VideoAnalysisError("agy_timeout", error.message);
      if (error.code === "exit_nonzero" && isQuotaFailure(result.stderr, result.stdout)) {
        if (attempt >= QUOTA_BACKOFF_MS.length) {
          throw new VideoAnalysisError("agy_quota", `agy kota/oran sınırına takıldı (${attempt + 1} deneme): ${error.message}`);
        }
        stats.retries += 1;
        await deps.sleep(QUOTA_BACKOFF_MS[attempt]);
        continue;
      }
      throw new VideoAnalysisError("agy_failed", error.message);
    }
  }
}
