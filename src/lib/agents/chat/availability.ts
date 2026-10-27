/**
 * Sohbet bu ortamda kullanılabilir mi? Kullanılamıyorsa sohbet çubuğu HİÇ çizilmez ve `POST /api/sohbet` 503 döner. Kurallar:
 *  - barındırılan ortam (`VERCEL`): alt süreç/abonelik CLI'ı yok → kapalı;
 *  - LLM arka ucu `claude_cli` değilse (`anthropic_api` şimdilik saplama, geçersiz `LLM_BACKEND` değeri) → kapalı;
 *  - `claude` yürütülebilir dosyası bulunamıyorsa (`CLAUDE_CLI_PATH` ya da PATH) → kapalı.
 * Örnek (mock) veri kaynağı kapatmaz: olgu paketi depo üzerinden kurulur. Hafif ve eşzamanlıdır (sayfa başına çağrılır): LLM çağırmaz;
 * yalnız ortam değişkenlerine ve dosya varlığına bakar. Bulunan CLI yolu süreç boyunca hatırlanır (bulunamazsa her seferinde yeniden aranır).
 */
import "server-only";

import { accessSync, constants, statSync } from "node:fs";
import { posix, win32 } from "node:path";

import { resolveBackendId } from "@/lib/llm/backend";

export type ChatUnavailableReason = "hosted" | "backend" | "cli_missing";

export type ChatAvailability = { available: true } | { available: false; reason: ChatUnavailableReason };

export interface AvailabilityDeps {
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  /** Dosya var mı ve çalıştırılabilir mi (test). */
  isExecutable?: (path: string, platform: NodeJS.Platform) => boolean;
}

function fileIsExecutable(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Windows'ta kabuksuz başlatma yalnız `.exe`/`.com` çalıştırır (`.cmd` sarmalayıcı değil): `subprocess.ts` ile aynı kural. */
const WINDOWS_EXTENSIONS = [".exe", ".com"] as const;

function candidatesFor(command: string, platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [command];
  return /\.(?:exe|com)$/i.test(command) ? [command] : WINDOWS_EXTENSIONS.map((extension) => `${command}${extension}`);
}

/** CLI komutu (`CLAUDE_CLI_PATH` ya da "claude") bulunabiliyor mu: yol içeriyorsa doğrudan, değilse PATH'te. */
export function claudeCliExists(deps: AvailabilityDeps = {}): boolean {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const isExecutable = deps.isExecutable ?? fileIsExecutable;
  const path = platform === "win32" ? win32 : posix; // ayraç/birleştirme hedef platforma göre (test platformu ana makineden bağımsız)
  const command = env.CLAUDE_CLI_PATH?.trim() || "claude";
  const hasPath = path.isAbsolute(command) || /[\\/]/.test(command);
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  const candidates = hasPath ? candidatesFor(command, platform) : dirs.flatMap((dir) => candidatesFor(path.join(dir, command), platform));
  return candidates.some((candidate) => isExecutable(candidate, platform));
}

let cliFound = false;

export function chatAvailability(deps: AvailabilityDeps = {}): ChatAvailability {
  const env = deps.env ?? process.env;
  if (env.VERCEL) return { available: false, reason: "hosted" };
  try {
    if (resolveBackendId(env.LLM_BACKEND) !== "claude_cli") return { available: false, reason: "backend" };
  } catch {
    return { available: false, reason: "backend" };
  }
  // Hatırlama yalnız gerçek ortamda (varsayılan bağımlılıklarla); testte her çağrı kendi ortamını sınar.
  const real = deps.env === undefined && deps.isExecutable === undefined && deps.platform === undefined;
  if (real && cliFound) return { available: true };
  const exists = claudeCliExists(deps);
  if (real && exists) cliFound = true;
  return exists ? { available: true } : { available: false, reason: "cli_missing" };
}
