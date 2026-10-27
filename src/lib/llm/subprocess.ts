/**
 * Alt süreç çalıştırıcı (agy / Claude CLI gibi yerel komut satırı araçları için). Kurallar:
 *  - `shell: false`: komut ve argümanlar ayrı verilir, kabuk yorumlamaz (rakip metni/dosya adı komut olamaz). Windows'ta `.cmd`
 *    sarmalayıcıları bu yolla çalışmaz: yürütülebilir dosyanın (`.exe`) tam yolu verilir (`AGY_BIN`, `CLAUDE_CLI_PATH`).
 *  - Girdi stdin'den (`input`): argüman uzunluğu sınırına ve süreç listesinde görünmeye takılmaz.
 *  - Zaman aşımı: süre dolunca süreç (Windows'ta alt süreçleriyle) öldürülür, `timedOut` true döner.
 *  - İptal (`signal`): sinyal iptal edilince süreç (Windows'ta alt süreçleriyle, yalnız kendi PID'i) öldürülür; sonuçta `exitCode` null.
 *    Çağrıdan ÖNCE iptal edilmiş sinyalde süreç hiç başlatılmaz (hemen null çıkışlı sonuç). Dinleyici süreç bitince kaldırılır.
 *  - stdout/stderr BELLEK sınırlıdır: stdout sınırı aşılırsa süreç öldürülür (`truncatedStdout`), stderr sınırı aşılırsa fazlası atılır.
 *  - Çıkış kodu sonuçta döner (sıfır olmayan çıkış HATA FIRLATMAZ: çağıran karar verir; `assertSuccess` fırlatan kısayoldur).
 *    Yalnız süreç hiç başlatılamazsa (`ENOENT` …) `SubprocessError("spawn_failed")` fırlatır.
 *  - Test için enjekte edilebilir: üst katmanlar `SubprocessRunner` alır (varsayılan `runSubprocess`); `subprocess-fake.ts`.
 * ORTAM İZİN LİSTESİ: alt sürece `process.env` YAYILMAZ (`.env.local`'deki servis/Apify/cron sırları, araç kullanabilen bir ajana ve
 *    rakip içeriğine açık olurdu). Yalnız sistem değişkenleri (`CHILD_ENV_ALLOWED`) + çağıranın `passEnv`'i geçer; API anahtarı adları
 *    listede YOKTUR. `env` bunların ÜSTÜNE eklenir ve hiçbir yere yazılmaz/hata iletisine girmez.
 */
import "server-only";

import { spawn } from "node:child_process";

export interface SubprocessOptions {
  /** Yürütülebilir dosya (tam yol ya da PATH'te bulunan ad). */
  command: string;
  args?: readonly string[];
  /** stdin'e yazılıp kapatılır. */
  input?: string;
  /** Bu süreden sonra süreç öldürülür (ms; > 0). */
  timeoutMs: number;
  /** stdout üst sınırı (bayt); aşılırsa süreç öldürülür. Varsayılan 8 MiB. */
  maxStdoutBytes?: number;
  /** stderr üst sınırı (bayt); fazlası atılır. Varsayılan 1 MiB. */
  maxStderrBytes?: number;
  cwd?: string;
  /** İzin verilen ortamın üstüne eklenir (değer `undefined` = o değişkeni kaldır). */
  env?: Record<string, string | undefined>;
  /** Sistem izin listesine EK olarak `process.env`'den geçecek adlar (büyük/küçük harf duyarsız; sonu `*` ise önek). Sır adı verme. */
  passEnv?: readonly string[];
  /** İptal sinyali: iptalde süreç öldürülür, sonuçta `exitCode` null (zaman aşımı/bayt sınırıyla aynı yol). Önceden iptalse süreç başlatılmaz. */
  signal?: AbortSignal;
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  /** Çıkış kodu; süreç sinyalle öldüyse (zaman aşımı, bayt sınırı, iptal) null. */
  exitCode: number | null;
  timedOut: boolean;
  truncatedStdout: boolean;
  truncatedStderr: boolean;
  durationMs: number;
}

export type SubprocessRunner = (options: SubprocessOptions) => Promise<SubprocessResult>;

export type SubprocessErrorCode = "spawn_failed" | "timeout" | "output_too_large" | "exit_nonzero";

export class SubprocessError extends Error {
  constructor(
    readonly code: SubprocessErrorCode,
    message: string,
    /** Varsa tamamlanan sonuç (stderr ayrıntısı için). */
    readonly result?: SubprocessResult,
  ) {
    super(message);
    this.name = "SubprocessError";
  }
}

/** Alt sürece geçen sistem değişkenleri (karşılaştırma büyük/küçük harf duyarsız; sonu `*` ise önek). Sır/API anahtarı adı EKLENMEZ. */
export const CHILD_ENV_ALLOWED: readonly string[] = [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "USERPROFILE",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "PROGRAMDATA",
  "PROGRAMFILES*",
  "COMMONPROGRAMFILES*",
  "PROGRAMW6432",
  "ALLUSERSPROFILE",
  "USERNAME",
  "USERDOMAIN",
  "COMPUTERNAME",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "LANG",
  "LC_ALL",
  "TZ",
];

function isAllowedName(name: string, patterns: readonly string[]): boolean {
  const upper = name.toUpperCase();
  return patterns.some((pattern) => {
    const p = pattern.toUpperCase();
    return p.endsWith("*") ? upper.startsWith(p.slice(0, -1)) : upper === p;
  });
}

/** Alt süreç ortamı: yalnız izin listesindekiler (+ `passEnv`), sonra `env` üstüne (`undefined` = kaldır). Saf; `source` enjekte edilebilir. */
export function buildChildEnv(source: Record<string, string | undefined>, options: Pick<SubprocessOptions, "env" | "passEnv"> = {}): Record<string, string> {
  const patterns = [...CHILD_ENV_ALLOWED, ...(options.passEnv ?? [])];
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && isAllowedName(name, patterns)) result[name] = value;
  }
  for (const [name, value] of Object.entries(options.env ?? {})) {
    for (const existing of Object.keys(result)) if (existing.toUpperCase() === name.toUpperCase()) delete result[existing];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

export const DEFAULT_MAX_STDOUT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_STDERR_BYTES = 1024 * 1024;
/** Hata iletisine giren stderr parçasının üst sınırı (karakter). */
const STDERR_EXCERPT_CHARS = 400;

/** Süreci ve (Windows'ta) alt süreçlerini öldürür. Kabuk kullanılmaz. */
function killTree(pid: number | undefined, kill: () => void): void {
  if (process.platform === "win32" && pid !== undefined) {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" }).on("error", kill);
      return;
    } catch {
      // aşağıdaki doğrudan öldürmeye düş
    }
  }
  kill();
}

export const runSubprocess: SubprocessRunner = (options) =>
  new Promise<SubprocessResult>((resolve, reject) => {
    if (!(options.timeoutMs > 0)) {
      reject(new RangeError("timeoutMs sıfırdan büyük olmalı."));
      return;
    }
    const maxOut = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    const maxErr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    const startedAt = Date.now();

    // Çağrıdan önce iptal edilmişse süreç hiç başlatılmaz: iptal edilmiş işin yan etkisi olmasın.
    if (options.signal?.aborted) {
      resolve({ stdout: "", stderr: "", exitCode: null, timedOut: false, truncatedStdout: false, truncatedStderr: false, durationMs: 0 });
      return;
    }

    let child;
    try {
      child = spawn(options.command, [...(options.args ?? [])], {
        shell: false,
        windowsHide: true,
        cwd: options.cwd,
        env: buildChildEnv(process.env, options) as NodeJS.ProcessEnv, // Next'in ProcessEnv eki NODE_ENV'i zorunlu kılar; izin listesi onu taşımak zorunda değil
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new SubprocessError("spawn_failed", `Süreç başlatılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`));
      return;
    }

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let aborted = false;
    let truncatedStdout = false;
    let truncatedStderr = false;
    let settled = false;

    const terminate = () => killTree(child.pid, () => child.kill("SIGKILL"));
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (truncatedStdout) return;
      const room = maxOut - outBytes;
      if (chunk.length > room) {
        if (room > 0) out.push(chunk.subarray(0, room));
        outBytes = maxOut;
        truncatedStdout = true;
        terminate();
        return;
      }
      out.push(chunk);
      outBytes += chunk.length;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const room = maxErr - errBytes;
      if (room <= 0) {
        truncatedStderr = true;
        return;
      }
      if (chunk.length > room) truncatedStderr = true;
      err.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
      errBytes += Math.min(chunk.length, room);
    });

    // Süreç girdiyi okumadan çıkarsa yazma EPIPE verir: bu bir hata değil, çıkış kodu anlatır.
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new SubprocessError("spawn_failed", `Süreç başlatılamadı (${(error as NodeJS.ErrnoException).code ?? "hata"}): ${options.command}`));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        exitCode: timedOut || truncatedStdout || aborted ? null : exitCode,
        timedOut,
        truncatedStdout,
        truncatedStderr,
        durationMs: Date.now() - startedAt,
      });
    });

    child.stdin.end(options.input ?? "");
  });

/**
 * Sonucu doğrular: zaman aşımı, bayt sınırı ya da sıfır olmayan çıkış → `SubprocessError` (ileti Türkçe, stderr'den kısa parça;
 * stdout ve ortam değişkenleri iletiye girmez). Başarılıysa sonucu olduğu gibi döndürür.
 */
export function assertSuccess(result: SubprocessResult, what: string): SubprocessResult {
  if (result.timedOut) throw new SubprocessError("timeout", `${what}: zaman aşımı (${Math.round(result.durationMs / 1000)} sn).`, result);
  if (result.truncatedStdout) throw new SubprocessError("output_too_large", `${what}: çıktı sınırı aşıldı.`, result);
  if (result.exitCode !== 0) {
    const excerpt = result.stderr.trim().replace(/\s+/g, " ").slice(0, STDERR_EXCERPT_CHARS);
    throw new SubprocessError("exit_nonzero", `${what}: çıkış kodu ${result.exitCode}${excerpt ? ` — ${excerpt}` : ""}`, result);
  }
  return result;
}
