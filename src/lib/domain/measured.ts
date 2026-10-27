/**
 * "Ölçülemedi" sözleşmesi (`rakip analiz\panel\lib\veri\olculen.ts` portu).
 *
 *   0   = "ölçtük, sıfır"        → gerçek bir ölçümdür, normal basılır
 *   yok = "bakmadık/alamadık"    → gri tire "—", ASLA 0 veya %0 yazılmaz
 *   ""  = "alan döndü, içi boş"  → satır hiç çizilmez
 *
 * Bunu ekranda uygulayan TEK bileşen: `components/common/measured-value.tsx`.
 * Ham tiplerde (`NormalizedMetrics`) aynı ayrım `undefined` ile taşınır; `Measured<T>`
 * sebep taşımak gereken yerlerde (ör. listUnmeasured, KPI) kullanılır.
 */
import type { Platform } from "@/lib/platforms/types";

export type Measured<T> =
  | { status: "measured"; value: T }
  | { status: "unmeasured"; reason?: string }
  | { status: "empty" };

export function measured<T>(value: T): Measured<T> {
  return { status: "measured", value };
}

export function unmeasured<T = never>(reason?: string): Measured<T> {
  return { status: "unmeasured", reason };
}

export function empty<T = never>(): Measured<T> {
  return { status: "empty" };
}

/** undefined/null/NaN/Infinity → unmeasured. 0 gerçek ölçümdür. */
export function fromNumber(value: number | undefined | null, reason?: string): Measured<number> {
  return typeof value === "number" && Number.isFinite(value) ? measured(value) : unmeasured(reason);
}

/** undefined/null → unmeasured, "" (kırpılınca) → empty, dolu → measured. */
export function fromText(value: string | undefined | null, reason?: string): Measured<string> {
  if (value === undefined || value === null) return unmeasured(reason);
  const trimmed = value.trim();
  return trimmed === "" ? empty() : measured(trimmed);
}

export function fromBoolean(value: boolean | undefined | null, reason?: string): Measured<boolean> {
  return typeof value === "boolean" ? measured(value) : unmeasured(reason);
}

export function isMeasured<T>(m: Measured<T> | undefined): m is { status: "measured"; value: T } {
  return m?.status === "measured";
}

/** Kolonun tamamı ölçülmemişse kolon gizlenir — 12 tane tire göstermekten dürüst. */
export function noneMeasured(column: Measured<unknown>[]): boolean {
  return column.length > 0 && column.every((m) => m.status !== "measured");
}

export function emptyCount(column: Measured<unknown>[]): number {
  return column.filter((m) => m.status === "empty").length;
}

/** "Ölçülemeyenler" listesinin bir satırı (`listUnmeasured`). */
export type UnmeasuredScope = "content" | "competitor" | "account" | "source";

export interface UnmeasuredEntry {
  scope: UnmeasuredScope;
  /** İnsan okunur ad: "@kahvecininyeri · instagram", "saves alanı" vb. */
  subject: string;
  /** Varsa ilgili kayıt (content_items.id, competitors.id …). */
  refId?: string;
  platform?: Platform;
  /** Hangi alan ölçülemedi (ör. "saves", "reach"); yoksa kayıt bütünüyle. */
  field?: string;
  reason: string;
  /** Bilginin geldiği yer (uzman görünümü): "content_items.missing_fields", "collection_runs.error" … */
  source: string;
  /** ISO zaman: ne zaman görüldü. */
  seenAt?: string;
}
