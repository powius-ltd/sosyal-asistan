/**
 * Analist sayı belirteçleri: ajan HİÇBİR sayıyı kendisi yazmaz; sayı yerine belirteç koyar, kod belirteci olgu paketine bakıp biçimler
 * (`formatNumber`/`formatDecimal`/… `lib/format.ts`). Böylece metindeki her sayı pakette vardır (kuruluş gereği) ve ölçülemeyen değer
 * metne giremez (`undefined` ≠ 0). Plan: `docs/AJAN-PLAN.md` §2.
 *
 * Çarpan (`lift`) biçimi müşteri diliyle yazılır: "5,9 katı" (`plain-language.ts` `liftTimes`); istem "normalinin {lift:...}" der.
 *
 * Biçim: `{<ad>:<konu>}`.
 *  - Genel olgu: `{g:<anahtar>}` (ör. `{g:followers}`, `{g:unlabeled}`).
 *  - Kanıt ref'li olgu: `{<alan>:<ref>}` (ör. `{lift:c:ci_12}`, `{rn:cell:sorunu-biliyor:kimlik}`); konu ref'i maddenin kanıtında olmalıdır.
 * Saf modül (veri okumaz, LLM çağırmaz).
 */
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { formatDays, formatDaysAgo, formatDecimal, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { liftTimes } from "@/lib/plain-language";

/** `days` = süre ("90 gün"), `days_ago` = yayından beri ("bugün" · "dün" · "12 gün önce"): tarih de sayı gibi yalnız belirteçle yazılır. */
export type TokenFormat = "int" | "lift" | "decimal" | "percent" | "signed" | "usd" | "days" | "days_ago";

export interface TokenEntry {
  format: TokenFormat;
  /** undefined = ölçülemedi (0 değil): belirteç metinde kullanılamaz. */
  value?: number;
  /** Değer yoksa sebep (düzeltme turunda modele söylenir, `unmeasured` listesine girer). */
  reason?: string;
  /** Ref'li belirteçte konu ref'i (maddenin kanıtında bulunmalı); genel olguda undefined. */
  subject?: string;
  /**
   * Bu sayının dayandığı örneğin güveni (ör. kendi gönderi sayısı az olan dönem karşılaştırması düşük). Belirteci kullanan maddenin güveni
   * bununla da sınırlanır (kanıt ref'lerinin güveni yetmez: genel sayının kanıt ref'i yoktur). Belirtilmemiş = kesin sayım, sınır yok.
   */
  confidence?: ConfidenceLevel;
}

/** Genel olguların belirteç adı. */
export const GLOBAL_TOKEN = "g";

const TOKEN_RE = /\{([a-z][a-z0-9_]*):([A-Za-z0-9_:.-]+)\}/g;

export const tokenKey = (name: string, subject: string): string => `${name}:${subject}`;

export class TokenTable {
  private readonly entries = new Map<string, TokenEntry>();

  /** Genel olgu: `{g:<name>}`. */
  addGlobal(name: string, format: TokenFormat, value: number | undefined, reason = "ölçülemedi", confidence?: ConfidenceLevel): void {
    this.set(tokenKey(GLOBAL_TOKEN, name), { format, ...(confidence === undefined ? {} : { confidence }), ...this.measure(value, reason) });
  }

  /** Ref'li olgu: `{<metric>:<ref>}`. */
  addRef(metric: string, ref: string, format: TokenFormat, value: number | undefined, reason = "ölçülemedi"): void {
    this.set(tokenKey(metric, ref), { format, subject: ref, ...this.measure(value, reason) });
  }

  private measure(value: number | undefined, reason: string): Pick<TokenEntry, "value" | "reason"> {
    return typeof value === "number" && Number.isFinite(value) ? { value } : { reason };
  }

  private set(key: string, entry: TokenEntry): void {
    this.entries.set(key, entry);
  }

  get(key: string): TokenEntry | undefined {
    return this.entries.get(key);
  }

  /** Konusu verilen ref olan tüm belirteçleri siler (boyut kırpmasında atılan olgunun belirteçleri geçersiz olur). */
  dropSubjects(keep: (subject: string) => boolean): void {
    for (const [key, entry] of this.entries) if (entry.subject !== undefined && !keep(entry.subject)) this.entries.delete(key);
  }

  /** Ölçülemeyen belirteçler (paketin `unmeasured` listesi). */
  unmeasured(): { key: string; reason: string }[] {
    return [...this.entries].flatMap(([key, entry]) => (entry.value === undefined ? [{ key, reason: entry.reason ?? "ölçülemedi" }] : []));
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface FoundToken {
  raw: string;
  key: string;
}

/** Metindeki biçimi geçerli belirteçler (sırayla, tekrarlar dahil). */
export function findTokens(text: string): FoundToken[] {
  return [...text.matchAll(TOKEN_RE)].map((match) => ({ raw: match[0], key: tokenKey(match[1], match[2]) }));
}

/** Değeri biçimler; ölçülemeyen değer → undefined (çağıran yerleştirmez). */
export function formatTokenValue(entry: TokenEntry): string | undefined {
  const value = entry.value;
  if (value === undefined) return undefined;
  switch (entry.format) {
    case "int":
      return formatNumber(value);
    case "lift":
      // Müşteri metni: "5,9 katı" (`liftTimes`; "5,9x" değil). Yuvarlayınca 0 olan çok küçük değerde liftTimes cümle kurmaz; yerleştirme düşmesin diye
      // iki basamakla yazılır ("0,03 katı": gerçek ölçüm, 0 değil).
      return liftTimes(value) ?? `${formatDecimal(value, 2)} katı`;
    case "decimal":
      return formatDecimal(value, 1);
    case "percent":
      return formatPercent(value, 1);
    case "usd":
      return formatUsd(value);
    case "days":
      return formatDays(value);
    case "days_ago":
      return formatDaysAgo(value);
    case "signed":
      return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
  }
}

/**
 * Belirteçleri değerleriyle değiştirir. Bilinmeyen ya da ölçülemeyen belirteç FIRLATIR: çağıran önce `verify` ile süzer; buraya
 * düzgün metin gelir, gelmezse yanlış sayı yazmaktansa hata.
 */
export function replaceTokens(text: string, table: TokenTable): string {
  return text.replace(TOKEN_RE, (raw, name: string, subject: string) => {
    const entry = table.get(tokenKey(name, subject));
    const formatted = entry === undefined ? undefined : formatTokenValue(entry);
    if (formatted === undefined) throw new RangeError(`Belirteç yerleştirilemedi: ${raw}`);
    return formatted;
  });
}

/** Sayı sözcükleri ("üç", "yüzde") — rakam yazmadan sayı iddiası. "bir" ve "yüz/bin" (çok anlamlı) bilerek dışarıda. */
const NUMBER_WORD_RE = /(?<![\p{L}])(iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|milyon|yüzde)(?![\p{L}])/u;
const DIGIT_RE = /[\p{Nd}\p{No}\p{Nl}]/u;

/**
 * Belirteç dışı sayı sorunları ([] = temiz): geçerli belirteçler çıkarıldıktan sonra kalan metinde rakam (çarpan/yüzde dahil:
 * "3x", "%60", "4 kat"), yüzde işareti, sayı sözcüğü ya da bozuk (kapanmayan/biçimsiz) belirteç.
 */
export function strayNumberProblems(text: string): string[] {
  const rest = text.replace(TOKEN_RE, " ");
  const problems: string[] = [];
  if (/[{}]/.test(rest)) problems.push("bozuk belirteç: { } içinde yalnız {ad:konu} biçimi geçerli");
  const digit = DIGIT_RE.exec(rest);
  if (digit) problems.push(`belirteç dışı rakam ("${rest.slice(Math.max(0, digit.index - 8), digit.index + 8).trim()}")`);
  if (rest.includes("%")) problems.push('belirteç dışı yüzde işareti ("%")');
  const word = NUMBER_WORD_RE.exec(rest.toLocaleLowerCase("tr-TR"));
  if (word) problems.push(`belirteç dışı sayı sözcüğü ("${word[1]}")`);
  return problems;
}
