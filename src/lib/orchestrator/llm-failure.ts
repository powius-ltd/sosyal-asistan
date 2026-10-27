/**
 * Kalıcı LLM hatası sınıflaması: bir kez olunca sonraki LLM adımlarında da olacak hatalar (Claude CLI yok, oturum yok/limit dolu,
 * geçersiz yapılandırma). Zaman aşımı/geçersiz çıktı kalıcı sayılmaz (başka adımda düzelebilir).
 *  - Fırlayan hata: `isLlmUnavailableError`.
 *  - `runLabeling` parti hatasını içeride yakalar ve yalnız günlüğe yazar ("[i/n] parti başarısız (spawn_failed): …"); özet hata kodunu
 *    taşımaz. Bu yüzden günlük satırı dinlenir (`tapLlmFailure`). Biçim `label-run.ts`'e bağlıdır (test: `llm-failure.test.ts`); biçim
 *    değişirse tespit sessizce kapanır ve sonraki LLM adımları kendi hatalarıyla (yine `isLlmUnavailableError`) düşer.
 */
import "server-only";

import { LlmError } from "@/lib/llm/types";

const PERSISTENT_CODES: readonly string[] = ["spawn_failed", "cli_failed", "invalid_config"];

export function isLlmUnavailableError(error: unknown): boolean {
  return error instanceof LlmError && PERSISTENT_CODES.includes(error.code);
}

const PERSISTENT_LINE = /parti başarısız \((spawn_failed|cli_failed)\)/;

/** Günlük satırında kalıcı LLM hatası var mı. */
export const isPersistentLlmFailureLine = (line: string): boolean => PERSISTENT_LINE.test(line);

export interface LlmFailureTap {
  log: (line: string) => void;
  /** Dinlenen satırlarda kalıcı hata görüldü mü. */
  readonly tripped: boolean;
}

/** `log`'u sarar: satırı olduğu gibi iletir ve kalıcı LLM hatası satırını işaretler. */
export function tapLlmFailure(log: (line: string) => void): LlmFailureTap {
  let tripped = false;
  return {
    log: (line) => {
      if (isPersistentLlmFailureLine(line)) tripped = true;
      log(line);
    },
    get tripped() {
      return tripped;
    },
  };
}
