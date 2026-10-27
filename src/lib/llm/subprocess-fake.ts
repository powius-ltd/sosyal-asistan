/**
 * Yalnız testler için: `SubprocessRunner` taklidi (üretim koduna girmez). Gerçek süreç başlatmadan, sıradaki hazır yanıtları döndürür
 * ve her çağrının seçeneklerini (komut, argüman, stdin girdisi) kaydeder. Yanıt bir işlev de olabilir (girdiye göre cevap).
 * İptal (`signal`) gerçek çalıştırıcıyla aynı sözleşmeyi taklit eder: önceden iptalse yanıt tüketilmez; yanıt beklenirken iptal edilirse
 * hemen `exitCode: null` sonucu döner (yanıt işlevi bitmese de).
 */
import type { SubprocessOptions, SubprocessResult, SubprocessRunner } from "@/lib/llm/subprocess";

export type FakeResponse = Partial<SubprocessResult> | ((options: SubprocessOptions) => Partial<SubprocessResult> | Promise<Partial<SubprocessResult>>);

export interface FakeSubprocess {
  runner: SubprocessRunner;
  /** Yapılan çağrılar (sırayla). */
  calls: SubprocessOptions[];
}

const OK: SubprocessResult = { stdout: "", stderr: "", exitCode: 0, timedOut: false, truncatedStdout: false, truncatedStderr: false, durationMs: 1 };

/** İptal edilmiş süreç: sinyalle öldü, çıkış kodu yok (gerçek çalıştırıcıyla aynı). */
const ABORTED: SubprocessResult = { ...OK, exitCode: null, durationMs: 0 };

/**
 * `responses` sırayla tüketilir; liste bittiyse son yanıt tekrar kullanılır. Hiç yanıt verilmezse boş başarılı sonuç döner.
 * Yanıt verilmeyen alanlar başarılı varsayılandan gelir (`exitCode: 0`, boş stdout).
 */
export function createFakeSubprocess(...responses: FakeResponse[]): FakeSubprocess {
  const calls: SubprocessOptions[] = [];
  let consumed = 0; // yalnız gerçekten başlatılan çağrılar yanıt tüketir (önceden iptal edilen tüketmez)
  const runner: SubprocessRunner = (options) => {
    calls.push(options);
    const { signal } = options;
    if (signal?.aborted) return Promise.resolve({ ...ABORTED });
    const response = responses[Math.min(consumed++, responses.length - 1)];
    const respond = async (): Promise<SubprocessResult> => {
      const partial = typeof response === "function" ? await response(options) : (response ?? {});
      return { ...OK, ...partial };
    };
    if (!signal) return respond();
    return new Promise<SubprocessResult>((resolve, reject) => {
      const onAbort = () => resolve({ ...ABORTED });
      signal.addEventListener("abort", onAbort, { once: true });
      // Dinleyici sonuç verilmeden ÖNCE kaldırılır (gerçek çalıştırıcıyla aynı: çağıran döndüğünde dinleyici yok).
      respond().then(
        (result) => {
          signal.removeEventListener("abort", onAbort);
          resolve(result);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  };
  return { runner, calls };
}
