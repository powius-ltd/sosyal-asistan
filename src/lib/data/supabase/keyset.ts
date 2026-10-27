/**
 * Sayfalama planı: `ORDER BY <sütun> DESC [NULLS LAST], id <yön>` + opak imleç. Liste sorguları (`content-queries`,
 * `outlier-query`, `notifications`, `runs`) aynı parçayı kullanır. İki imleç türü var:
 *
 *  - `keyset` (zaman damgası sütunları): imleç sıralama anahtarının SON satırdaki ham değerini taşır; sayfalar arasında
 *    kayıt eklense/silinse de satır atlanmaz/tekrarlanmaz. DB zaman damgasını mikrosaniye hassasiyetle verir: kayıpsız.
 *  - `offset` (kayan noktalı sütunlar: `lift`, `cross_score`): DB, `float8` değerleri JSON/metin çıktısında 15 anlamlı
 *    basamağa yuvarlar (PostgREST oturumu `extra_float_digits = 0`); ham değer imleçte kayıpsız taşınamaz ve keyset süzgeci
 *    eşit değerli satırı atlar/tekrarlar. Bu sütunlarda sıra DB'de tam (`float8` + `id`) tutulur, imleç sıra konumudur
 *    (kararlı toplam sıra; yalnız sayfalar arasındaki eşzamanlı ekleme/silme konumu kaydırabilir).
 */
import { RepositoryError } from "@/lib/data/repository";
import type { Filterable } from "@/lib/data/supabase/content-filters";
import { decodeCursor, encodeCursor, keysetAfter } from "@/lib/data/supabase/cursor";

export interface Orderable extends Filterable {
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): this;
  limit(count: number): this;
  range(from: number, to: number): this;
}

export interface PageSort {
  /** Sıralama etiketi (imleç bu etikete bağlıdır: başka sıralamanın imleci `invalid_input`). */
  tag: string;
  column: string;
  /** Sütun NULL olabilir mi (`desc nulls last`)? */
  nullable: boolean;
  /** `float8` sütunları için `offset` (bkz. dosya başı); zaman damgası/tamsayı için `keyset`. */
  cursor: "keyset" | "offset";
  /** Eşitlikte kimlik yönü (varsayılan artan). */
  idDir?: "asc" | "desc";
}

export interface PagePlan<Row> {
  /** Sıralamayı ve imleç konumunu sorguya uygular; `limit + 1` satır ister (sonraki sayfa tespiti için). */
  apply<Q extends Orderable>(query: Q): Q;
  /** `limit + 1` satır okunduysa sonraki sayfanın imleci; yoksa undefined. */
  nextCursor(rows: readonly Row[]): string | undefined;
}

const invalidCursor = () => new RepositoryError("invalid_input", "Geçersiz sayfa imleci.");

export function planPage<Row extends { id: string } & Record<string, unknown>>(sort: PageSort, cursor: string | undefined, limit: number): PagePlan<Row> {
  const idDir = sort.idDir ?? "asc";
  const order = <Q extends Orderable>(query: Q): Q =>
    query.order(sort.column, { ascending: false, nullsFirst: false }).order("id", { ascending: idDir === "asc" });

  if (sort.cursor === "offset") {
    let offset = 0;
    if (cursor) {
      const [position] = decodeCursor(cursor, sort.tag, 1);
      if (typeof position !== "number" || !Number.isInteger(position) || position < 0) throw invalidCursor();
      offset = position;
    }
    return {
      apply: (query) => order(query).range(offset, offset + limit),
      nextCursor: (rows) => (rows.length > limit ? encodeCursor(sort.tag, [offset + limit]) : undefined),
    };
  }

  return {
    apply: (query) => {
      let q = query;
      if (cursor) {
        const [value, id] = decodeCursor(cursor, sort.tag, 2);
        if (typeof id !== "string") throw invalidCursor();
        q = q.or(keysetAfter({ column: sort.column, nullable: sort.nullable, value, id, idDir }));
      }
      return order(q).limit(limit + 1);
    },
    nextCursor: (rows) => {
      if (rows.length <= limit) return undefined;
      const last = rows[limit - 1];
      const value = last[sort.column];
      return encodeCursor(sort.tag, [typeof value === "string" || typeof value === "number" ? value : null, last.id]);
    },
  };
}
