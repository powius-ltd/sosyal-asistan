import type { BaselineExcludedCounts } from "@/lib/domain/content";

/** Baz çizgisi dışında bırakılanların satırları, kuralların uygulanma sırasında (bkz. `BaselineExcludedCounts`). */
const EXCLUDED_LABELS: readonly [keyof BaselineExcludedCounts, string][] = [
  ["self", "Hedefin kendisi"],
  ["otherFormat", "Farklı biçimde içerik"],
  ["pinned", "Sabitlenmiş içerik"],
  ["noViews", "İzlenmesi ölçülemeyen içerik"],
  ["differentViewsKind", "Farklı izlenme türü"],
  ["noDate", "Yayın tarihi bilinmeyen içerik"],
  ["tooYoung", "3 günden yeni içerik"],
];

/** Yalnız sıfırdan büyük sayaçlar (sıfır satırlar gürültüdür). */
export function excludedRows(excluded: BaselineExcludedCounts): { key: keyof BaselineExcludedCounts; label: string; count: number }[] {
  return EXCLUDED_LABELS.flatMap(([key, label]) => (excluded[key] > 0 ? [{ key, label, count: excluded[key] }] : []));
}
