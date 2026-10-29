/**
 * Stüdyo süreci (SPN-33): `produce` işi stüdyonun sipariş kapısını SABİT argümanla çalıştırır:
 *
 *   npm --prefix <STUDIO_DIR> run --silent siparis -- --fis <fiş yolu>
 *
 * Kabuk yok (`shell: false`), komut ve bayraklar sabit; değişen tek parça fiş YOLUDUR ve o da istekten değil, şemadan geçmiş fişten
 * (`send-to-studio.ts`) gelir. Ortam İZİN LİSTESİNDEN kurulur (`runSubprocess` → `buildChildEnv`): yalnız sistem değişkenleri + bu hesabın
 * ses anahtarı (`ELEVENLABS_API_KEY_<HESAP>`) + sipariş kökü (`KS_ORDERS_DIR`). Başka hesabın anahtarı, Apify / Zernio anahtarı geçmez.
 * Anahtarın değeri hiçbir yere yazılmaz. Stüdyonun çıkış sözleşmesi: 0 üretildi · 1 hata (fişe `hata` + `hata_notu` yazılır) · 2 üretilmedi
 * (onay yok / taslak değil / başka üretim sürüyor: fişe dokunulmaz).
 */
import "server-only";

import { runSubprocess, type SubprocessRunner } from "@/lib/llm/subprocess";

/** Stüdyo klasörü: `STUDIO_DIR` ortamı, yoksa bu makinedeki kurulum. */
export const DEFAULT_STUDIO_DIR = "/opt/panel/projeler/studyo";
/** Tek üretimin sert süre sınırı (ms): iş süre tavanının (60 dk) altında kalır. */
export const STUDIO_RUN_TIMEOUT_MS = 50 * 60 * 1000;
/** Günlüğe alınan stüdyo çıktısının son kısmı (karakter). */
const TAIL_CHARS = 1200;

/** Hesabın ses anahtarının ortam değişkeni adı: stüdyo slug'ı büyük harf, tire alt çizgi (`ornek-studyo` → `ELEVENLABS_API_KEY_ORNEK_STUDYO`). */
export function studioVoiceKeyName(studioSlug: string): string {
  return `ELEVENLABS_API_KEY_${studioSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export interface StudioRunInput {
  studioSlug: string;
  /** Üretilecek fişin mutlak yolu. */
  ticketPath: string;
  /** Sipariş klasörünün kökü (stüdyoya `KS_ORDERS_DIR` olarak verilir). */
  root: string;
  signal?: AbortSignal;
}

export interface StudioRunResult {
  /** Stüdyonun çıkış kodu; zaman aşımı / iptal / başlatılamama durumunda null. */
  exitCode: number | null;
  timedOut: boolean;
  /** Çıktının son kısmı (günlük; anahtar içermez). */
  tail: string;
  /** Süreç hiç başlatılamadı (npm yok, klasör yok …). */
  spawnFailed: boolean;
}

export type StudioRunner = (input: StudioRunInput) => Promise<StudioRunResult>;

const tailOf = (stdout: string, stderr: string): string => `${stdout}\n${stderr}`.trim().replace(/\s+\n/g, "\n").slice(-TAIL_CHARS);

export function createStudioRunner(options: { studioDir?: string; env?: Readonly<Record<string, string | undefined>>; run?: SubprocessRunner; timeoutMs?: number } = {}): StudioRunner {
  const env = options.env ?? process.env;
  const run = options.run ?? runSubprocess;
  const studioDir = options.studioDir ?? (env.STUDIO_DIR?.trim() || DEFAULT_STUDIO_DIR);
  return async (input) => {
    const keyName = studioVoiceKeyName(input.studioSlug);
    try {
      const result = await run({
        command: "npm",
        args: ["--prefix", studioDir, "run", "--silent", "siparis", "--", "--fis", input.ticketPath],
        timeoutMs: options.timeoutMs ?? STUDIO_RUN_TIMEOUT_MS,
        // Yalnız bu hesabın anahtarı ve sipariş kökü eklenir; sistem değişkenleri izin listesinden gelir. Genel anahtar adı HİÇ geçmez.
        env: { [keyName]: env[keyName], KS_ORDERS_DIR: input.root, ELEVENLABS_API_KEY: undefined, ANTHROPIC_API_KEY: undefined },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return { exitCode: result.exitCode, timedOut: result.timedOut, tail: tailOf(result.stdout, result.stderr), spawnFailed: false };
    } catch {
      return { exitCode: null, timedOut: false, tail: "", spawnFailed: true };
    }
  };
}
