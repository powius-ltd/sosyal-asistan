/**
 * Dataset satırlarını `ParseResult`'a çeviren ortak döngü (platformdan bağımsız).
 *
 * Her satır: önce "öğe mi?" (hata satırı/boş zarf → `notItems`), sonra platformun normalizasyonu
 * (başarısızsa sebebiyle `notItems`). `accessError` yalnız SONUÇ TÜMÜYLE BOŞSA bildirilir: toplu işte
 * bir hesap gizli/bulunamaz olsa da diğerleri geliyorsa o hesap yalnız `notItems` sebebinde (kullanıcı adıyla) görünür.
 */
import type { RawItem } from "@/lib/platforms/_shared/field-pick";
import { notItemReason, type Normalized } from "@/lib/platforms/_shared/not-item";
import type { ParseResult } from "@/lib/platforms/types";

export function parseRows<T>(
  raw: readonly unknown[],
  normalizeRow: (row: RawItem) => Normalized<T>,
  readAccessError: (rows: readonly unknown[]) => string | undefined,
): ParseResult<T> {
  const items: T[] = [];
  const notItems: { reason: string }[] = [];
  for (const row of raw) {
    const reason = notItemReason(row);
    if (reason) {
      notItems.push({ reason });
      continue;
    }
    const result = normalizeRow(row as RawItem);
    if (result.ok) items.push(result.value);
    else notItems.push({ reason: result.reason });
  }
  const accessError = items.length === 0 ? readAccessError(raw) : undefined;
  return accessError ? { items, notItems, accessError } : { items, notItems };
}
