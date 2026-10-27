/**
 * Ortam değişkeni okuma yardımcıları. Ortam DIŞARIDAN verilir (`process.env` ya da testte sahte nesne): bu klasör `process.env`'i
 * yalnız varsayılan bağımlılık kurulurken (`resolveDeps`) okur. `.env.example` boş değer yazar (`AGY_BIN=`): boş = tanımsız.
 */
import "server-only";

export type Env = Readonly<Record<string, string | undefined>>;

/** Kırpılmış, boş olmayan değer; yoksa undefined. */
export function envString(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** Pozitif tam sayı; yoksa ya da geçersizse `fallback`. */
export function envPositiveInt(env: Env, key: string, fallback: number): number {
  const value = envString(env, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
