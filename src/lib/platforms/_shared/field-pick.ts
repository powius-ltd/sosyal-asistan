/**
 * Ham Apify satırından alan seçiciler — platformdan bağımsız.
 *
 * Aktör çıktı şeması aktör sürümüne bağlıdır ve alan adları değişebilir; bu yüzden her alan
 * "olası ad listesi"nden İLK DOLU olanı alır. Hiçbiri yoksa `undefined` döner: ölçülemeyen alan
 * hiç yazılmaz, `0` ya da `""` uydurulmaz (`undefined ≠ 0`).
 *
 * Kaynak: `rakip analiz\src\kaynaklar\sosyal-normalize.ts` (ilkTanimliDeger, metinAl, sayiAl,
 * tarihAl, idAl, boolAl, diziAl). Sapma: `pickId` kimlik yoksa özet (hash) UYDURMAZ — uydurma kimlik
 * her koşuda başka çıkıp aynı içeriği tekrar tekrar ekletir; kimliksiz satır `notItems`'a düşer.
 */

export type RawItem = Record<string, unknown>;

/** Değer bir nesne (dizi değil) ise onu döndürür. */
export function asRecord(value: unknown): RawItem | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RawItem) : undefined;
}

/** "a.b.0.c" gibi noktalı yolu izler (dizi indeksi dahil). */
function readPath(item: RawItem, path: string): unknown {
  let current: unknown = item;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** İlk tanımlı değer: `undefined`, `null` ve `""` boş sayılır; `0` ve `false` DOLUDUR. */
export function firstDefined(item: RawItem, paths: readonly string[]): unknown {
  for (const path of paths) {
    const value = readPath(item, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** Boşluktan ibaret olmayan metin. Değer olduğu gibi (kırpılmadan) döner. */
export function pickString(item: RawItem, paths: readonly string[]): string | undefined {
  const value = firstDefined(item, paths);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Sonlu sayı. Sayı gibi görünen metin ("1.2K") ÇEVRİLMEZ. */
export function pickNumber(item: RawItem, paths: readonly string[]): number | undefined {
  const value = firstDefined(item, paths);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Ölçülmüş sayaç: sonlu ve ≥ 0. Negatif değer "ölçülemedi/gizli" anlamındadır (ör. gizlenmiş beğeni = -1). */
export function pickCount(item: RawItem, paths: readonly string[]): number | undefined {
  const value = pickNumber(item, paths);
  return value !== undefined && value >= 0 ? value : undefined;
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

function isoFromMs(ms: number): string | undefined {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * ISO-8601 metni ya da epoch (saniye < 1e12, aksi halde milisaniye) → ISO metni (UTC).
 * Saat dilimsiz tarih-saat UTC sayılır (yerel saate göre yorumlanmaz). Çözülemeyen değer `undefined`.
 */
export function pickDate(item: RawItem, paths: readonly string[]): string | undefined {
  const value = firstDefined(item, paths);
  if (typeof value === "number" && Number.isFinite(value)) return isoFromMs(value * (value < 1e12 ? 1000 : 1));
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  const zoned = ISO_DATE_TIME.test(text) && !HAS_ZONE.test(text) ? `${text}Z` : text;
  const ms = Date.parse(zoned);
  return Number.isNaN(ms) ? undefined : isoFromMs(ms);
}

/**
 * Kimlik: dolu metin ya da güvenli tam sayı. 2^53'ü aşan sayı KESİLMİŞ olabilir → `undefined`
 * (Instagram kimlikleri 19 haneli; aktör bunları metin olarak vermelidir).
 */
export function pickId(item: RawItem, paths: readonly string[]): string | undefined {
  const value = firstDefined(item, paths);
  if (typeof value === "string") return value.trim() !== "" ? value.trim() : undefined;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

/** Yalnız gerçek boolean. `undefined` = "aktör söylemedi"; `false` ile karıştırılmaz. */
export function pickBool(item: RawItem, paths: readonly string[]): boolean | undefined {
  for (const path of paths) {
    const value = readPath(item, path);
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

/** Metin dizisi (metin olmayan öğeler atılır). Boş ya da dizi olmayan → `undefined`. */
export function pickStringArray(item: RawItem, paths: readonly string[]): string[] | undefined {
  const value = firstDefined(item, paths);
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  return strings.length > 0 ? strings : undefined;
}
