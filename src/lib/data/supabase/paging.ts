/**
 * Sayfalama ve toplu okuma yardımcıları: sayfa boyu, "bir fazla oku" ile sonraki sayfa tespiti, 1000 satırlık PostgREST
 * sınırını (config.toml `max_rows`) aşan okumalar için sayfa sayfa toplama ve uzun `in (...)` listelerini parçalama.
 */
import type { PostgrestError } from "@supabase/supabase-js";

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type PagedResult } from "@/lib/data/queries";
import { toRepositoryError } from "@/lib/data/supabase/errors";

/** PostgREST tek yanıtta en çok bu kadar satır döner (supabase/config.toml `max_rows`). */
export const POSTGREST_MAX_ROWS = 1000;

/** `in (...)` süzgeçlerinde tek istekteki en çok kimlik (URL uzunluğu + görünüm araması maliyeti). */
export const IN_CHUNK = 50;

export function clampLimit(limit: number | undefined): number {
  const wanted = Number.isFinite(limit) ? Math.floor(limit as number) : DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(wanted, 1), MAX_PAGE_LIMIT);
}

/** `limit + 1` satır okunduysa sonraki sayfa vardır (`nextCursor` `planPage(...).nextCursor(rows)`'tan gelir). */
export function pageOf<T>(rows: T[], limit: number, nextCursor: string | undefined, total?: number): PagedResult<T> {
  return {
    items: rows.slice(0, limit),
    ...(total !== undefined ? { total } : {}),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}

interface Result<T> {
  data: T | null;
  error: PostgrestError | null;
}

/**
 * Bir okumanın TÜM satırlarını toplar (`range` ile 1000'erli). Sorgu KARARLI sıralı olmalı (en az `id`); aksi halde
 * sayfalar arasında satır atlanabilir/tekrarlanabilir.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const result = await page(from, from + POSTGREST_MAX_ROWS - 1);
    if (result.error) throw toRepositoryError(result.error);
    const rows = result.data ?? [];
    all.push(...rows);
    if (rows.length < POSTGREST_MAX_ROWS) return all;
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Kimlik listesini parçalara bölüp paralel okur ve sonuçları birleştirir (boş liste → istek yok). */
export async function inChunks<K, R>(ids: readonly K[], run: (part: K[]) => PromiseLike<R[]>, size: number = IN_CHUNK): Promise<R[]> {
  if (ids.length === 0) return [];
  const parts = await Promise.all(chunk(ids, size).map((part) => run(part)));
  return parts.flat();
}
