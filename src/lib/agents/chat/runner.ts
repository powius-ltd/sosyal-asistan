/**
 * Sohbet için alt süreç çalıştırıcı sarmalayıcısı (`SubprocessRunner`; Claude CLI istemcisine `deps.run` olarak verilir):
 *  - TOPLAM SÜRE TAVANI: istek başında bir bitiş anı konur; her model çağrısının `timeoutMs`'i kalan süreye indirilir (düzeltme turu
 *    ilk çağrının süresini yer; toplam `totalMs`'i aşamaz). Süre bittiyse süreç HİÇ başlatılmaz, `timedOut` sonucu döner
 *    (istemci bunu `timeout` hatasına çevirir).
 *  - İPTAL: istek iptal edilmişse (istemci koptu / "Vazgeç") yeni süreç başlatılmaz ve süreç bitince sonuç atılır (`ChatAbortedError`):
 *    düzeltme turu denenmez, yanıt yazılmaz.
 *  - `signal` alt çalıştırıcıya `SubprocessOptions.signal` olarak iletilir: `runSubprocess` iptalde çalışan süreci ÖLDÜRÜR (sonuçta
 *    `exitCode` null), kilit (`lock.ts`) süreç gerçekten bitince bırakılır; iptalde süreç zaman aşımını beklemez.
 */
import "server-only";

import type { SubprocessOptions, SubprocessResult, SubprocessRunner } from "@/lib/llm/subprocess";

/** İstek iptal edildi (istemci koptu ya da "Vazgeç"). Çağıran bunu hata değil iptal olarak ele alır. */
export class ChatAbortedError extends Error {
  constructor() {
    super("Sohbet isteği iptal edildi.");
    this.name = "ChatAbortedError";
  }
}

export interface ChatRunnerOptions {
  /** Gerçek çalıştırıcı (`runSubprocess`; testte sahte). */
  base: SubprocessRunner;
  signal?: AbortSignal;
  /** İsteğin toplam süre tavanı (ms); bitiş anı çalıştırıcı kurulurken konur. */
  totalMs: number;
  /** Test için saat (ms; varsayılan `performance.now()`). */
  now?: () => number;
}

const TIMED_OUT: SubprocessResult = { stdout: "", stderr: "", exitCode: null, timedOut: true, truncatedStdout: false, truncatedStderr: false, durationMs: 0 };

export function createChatRunner(options: ChatRunnerOptions): SubprocessRunner {
  const now = options.now ?? (() => performance.now());
  const deadline = now() + options.totalMs;
  return async (run) => {
    if (options.signal?.aborted) throw new ChatAbortedError();
    const remaining = deadline - now();
    if (remaining <= 0) return { ...TIMED_OUT };
    const forwarded: SubprocessOptions = { ...run, timeoutMs: Math.min(run.timeoutMs, remaining), signal: options.signal };
    const result = await options.base(forwarded);
    if (options.signal?.aborted) throw new ChatAbortedError();
    return result;
  };
}
