/**
 * Satır → domain eşlemesinin ortak parçaları. Kural: DB `NULL` = domain `undefined` (ölçülemedi ≠ 0); zaman damgaları
 * ISO 8601 UTC (`toISOString`); `numeric`/`bigint` PostgREST'ten JSON sayı olarak gelir.
 */
import type { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";

/** jsonb dizisinden yalnız geçerli öğeleri alır (bozuk öğe tüm listeyi düşürmez); dizi değilse boş liste. */
export function validEntries<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** `NULL` → `undefined`. */
export function opt<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

/** Zaman damgası → ISO UTC (`Z`, ms). `NULL` → `undefined`. */
export function isoOpt(value: string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : new Date(value).toISOString();
}

/** Zorunlu zaman damgası → ISO UTC. */
export function iso(value: string): string {
  return new Date(value).toISOString();
}

/** jsonb nesnesi → yalnız ilkel değerli alanlar (`Record<string, number | string | boolean>`). */
export function primitiveRecord(value: Json | null | undefined): Record<string, number | string | boolean> {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number | string | boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" || typeof entry === "string" || typeof entry === "boolean") out[key] = entry;
  }
  return out;
}

/** jsonb dizisi → yalnız metin öğeler. */
export function stringList(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** Tekil ilişki gömmesi (PostgREST: nesne, dizi ya da `null`) → ilk öğe. */
export function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
