/**
 * "Öğe olmayan" dataset satırları — platformdan bağımsız.
 *
 * Aktör koşusu SUCCEEDED dönse bile dataset'e veri yerine iki tür satır koyabilir:
 *   1. HATA SATIRI  — `{ error: "not_found", errorDescription: "…" }`
 *   2. BOŞ ZARF     — `{ results: [], totalCount: 0 }` (baktık, yok)
 * Bunlar normalize edilirse metinsiz/tarihsiz bir "öğe" olur ve aşağı akışta gerçek veri gibi
 * sayılır (ölçülemeyeni kötü ölçülmüş veriye çevirir). Sebebiyle `notItems`'a alınır, sessizce atılmaz.
 * (Kaynak: `rakip analiz\…\sosyal-normalize.ts` `ogeDegilSebebi`.)
 */
import { asRecord } from "@/lib/platforms/_shared/field-pick";

/** Normalize sonucu: değer ya da öğe olmama sebebi. */
export type Normalized<T> = { ok: true; value: T } | { ok: false; reason: string };

export function normalizedOk<T>(value: T): Normalized<T> {
  return { ok: true, value };
}

export function normalizedFail<T = never>(reason: string): Normalized<T> {
  return { ok: false, reason };
}

/** Hata satırındaki hesap (varsa) — sebep metnine eklenir, toplu işte hangi hesap olduğu görünsün. */
function subjectOf(row: Record<string, unknown>): string {
  const username = typeof row.username === "string" && row.username.trim() !== "" ? row.username.trim() : undefined;
  return username ? ` (@${username})` : "";
}

/** Bu satır öğe DEĞİLSE Türkçe sebebi; öğeyse `undefined`. */
export function notItemReason(raw: unknown): string | undefined {
  const row = asRecord(raw);
  if (!row) return "satır bir nesne değil";

  const error = typeof row.error === "string" ? row.error.trim() : "";
  if (error) {
    const description = typeof row.errorDescription === "string" ? row.errorDescription.trim() : "";
    return `${error}${description ? ` — ${description}` : ""}${subjectOf(row)}`;
  }

  const emptyEnvelope = Array.isArray(row.results) && row.results.length === 0;
  const zeroTotal = typeof row.totalCount === "number" && row.totalCount === 0;
  if (emptyEnvelope || zeroTotal) return "kaynak sonuç döndürmedi (boş zarf)";

  return undefined;
}
