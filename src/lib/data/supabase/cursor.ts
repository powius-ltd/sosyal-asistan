/**
 * Opak sayfalama imleci + kararlı sıralama (keyset) süzgeci.
 *
 * İmleç, sıralama anahtarının SON satırdaki DEĞERLERİNİ taşır (offset değil): sayfalar arasında kayıt eklenip silinse de
 * satır atlanmaz/tekrarlanmaz. Sıralama her zaman benzersiz `id` ile biter (eşit anahtarlar kararlı sıralanır). İmleç
 * sıralama etiketiyle (`tag`) işaretlidir: başka bir sıralamaya ait imleç `invalid_input` verir. Zaman damgaları imlece
 * DB'nin ham metniyle (mikrosaniye) girer; JS `Date`'e çevrilirse hassasiyet kaybolur.
 */
import { RepositoryError } from "@/lib/data/repository";

export type CursorValue = string | number | null;

export function encodeCursor(tag: string, values: CursorValue[]): string {
  return Buffer.from(JSON.stringify([tag, ...values]), "utf8").toString("base64url");
}

/** İmleci çözer; biçim/etiket/uzunluk uymuyorsa `invalid_input`. */
export function decodeCursor(cursor: string, tag: string, arity: number): CursorValue[] {
  const invalid = () => new RepositoryError("invalid_input", "Geçersiz sayfa imleci.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed) || parsed.length !== arity + 1 || parsed[0] !== tag) throw invalid();
  const values = parsed.slice(1);
  if (!values.every((v) => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))) throw invalid();
  return values as CursorValue[];
}

/** PostgREST `or`/`and` içinde güvenli değer: çift tırnaklı, `"` ve `\` kaçışlı. */
export function filterValue(value: string | number): string {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export interface KeysetSpec {
  /** Sıralama sütunu (azalan). */
  column: string;
  /** Sütun NULL olabilir mi (`desc nulls last`)? */
  nullable: boolean;
  /** İmleçteki sütun değeri. */
  value: CursorValue;
  /** Benzersiz kimlik değeri ve eşitlikteki yönü. */
  id: string;
  idDir: "asc" | "desc";
}

/**
 * `ORDER BY column DESC [NULLS LAST], id <idDir>` sıralamasında imleçten SONRA gelen satırları seçen PostgREST `or`
 * ifadesi (parantezsiz gövde; `.or(...)`'a verilir).
 */
export function keysetAfter({ column, nullable, value, id, idDir }: KeysetSpec): string {
  const idOp = idDir === "asc" ? "gt" : "lt";
  if (value === null) return `and(${column}.is.null,id.${idOp}.${filterValue(id)})`;
  const parts = [`${column}.lt.${filterValue(value)}`, `and(${column}.eq.${filterValue(value)},id.${idOp}.${filterValue(id)})`];
  if (nullable) parts.push(`${column}.is.null`);
  return parts.join(",");
}
