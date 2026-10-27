/**
 * Fiş frontmatter'ı: sipariş fişinin kullandığı YAML altkümesi (düz değer, tırnaklı değer, `|` blok metin, iç içe nesne, `- ` listesi,
 * `#` yorum). Tüm değerler METİN döner (sayı / evet-hayir çevirisi `schema.ts`'te); boş değer (`kaynak_link:`) alan yok sayılır.
 * Yazan taraf aynı altkümeyi üretir; panel stüdyonun yazdığı alanlara dokunmadan `setFrontmatterFields` ile tek satır günceller.
 */

/** Okuma yalnız metin üretir; yazmada sayı düz (tırnaksız) basılır. */
export type YamlValue = string | number | string[] | { [key: string]: YamlValue };
export type YamlMap = { [key: string]: YamlValue };

export interface ParsedDocument {
  data: YamlMap;
  /** Kapanış `---` satırından sonraki serbest not. */
  body: string;
}

const KEY_LINE = /^(\s*)([A-Za-z0-9_]+):(?:[ \t]+(.*))?$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isSkippable(line: string): boolean {
  const t = line.trim();
  return t === "" || t.startsWith("#");
}

/** Tek satırlık değer: tırnaklıysa çözer, değilse satır içi ` #` yorumu atar. */
function scalarOf(raw: string): string {
  const value = raw.trim();
  const double = /^"((?:[^"\\]|\\.)*)"/.exec(value);
  if (double) return JSON.parse(`"${double[1]}"`) as string;
  const single = /^'((?:[^']|'')*)'/.exec(value);
  if (single) return single[1].replace(/''/g, "'");
  return value.replace(/\s+#.*$/, "").trim();
}

function parseBlock(lines: string[], start: number, parentIndent: number): [string, number] {
  let i = start;
  const collected: string[] = [];
  while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > parentIndent)) {
    collected.push(lines[i]);
    i += 1;
  }
  const first = collected.find((line) => line.trim() !== "");
  const base = first === undefined ? 0 : indentOf(first);
  while (collected.length > 0 && collected[collected.length - 1].trim() === "") collected.pop();
  const text = collected.map((line) => (line.trim() === "" ? "" : line.slice(base))).join("\n");
  return [text === "" ? "" : `${text}\n`, i];
}

function parseMap(lines: string[], start: number, indent: number): [YamlMap, number] {
  const map: YamlMap = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isSkippable(line)) {
      i += 1;
      continue;
    }
    if (indentOf(line) < indent) break;
    const match = KEY_LINE.exec(line);
    if (!match || match[1].length !== indent) throw new Error(`Fiş satırı anlaşılamadı: "${line.trim()}"`);
    const key = match[2];
    const rest = (match[3] ?? "").trim();
    i += 1;
    if (rest === "|" || rest === "|-") {
      const [block, next] = parseBlock(lines, i, indent);
      i = next;
      map[key] = rest === "|-" ? block.replace(/\n$/, "") : block;
      continue;
    }
    if (rest !== "" && !rest.startsWith("#")) {
      const value = scalarOf(rest);
      if (value !== "") map[key] = value;
      continue;
    }
    let j = i;
    while (j < lines.length && isSkippable(lines[j])) j += 1;
    if (j >= lines.length || indentOf(lines[j]) <= indent) continue; // boş değer: alan yok
    if (lines[j].trim().startsWith("- ")) {
      const items: string[] = [];
      while (j < lines.length) {
        if (isSkippable(lines[j])) {
          j += 1;
          continue;
        }
        if (indentOf(lines[j]) <= indent || !lines[j].trim().startsWith("- ")) break;
        items.push(scalarOf(lines[j].trim().slice(2)));
        j += 1;
      }
      map[key] = items.filter((item) => item !== "");
      i = j;
    } else {
      const [child, next] = parseMap(lines, j, indentOf(lines[j]));
      i = next;
      if (Object.keys(child).length > 0) map[key] = child;
    }
  }
  return [map, i];
}

/** Frontmatter'ın başlangıç ve bitiş satır dizinleri (`---` satırları); yoksa undefined. */
function frontmatterBounds(lines: string[]): { open: number; close: number } | undefined {
  if (lines[0]?.trim() !== "---") return undefined;
  for (let i = 1; i < lines.length; i += 1) if (lines[i].trim() === "---") return { open: 0, close: i };
  return undefined;
}

export function parseFrontmatter(text: string): ParsedDocument {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const bounds = frontmatterBounds(lines);
  if (bounds === undefined) throw new Error("Fişte frontmatter yok (dosya '---' ile başlamalı ve '---' ile kapanmalı).");
  const [data] = parseMap(lines.slice(1, bounds.close), 0, 0);
  return { data, body: lines.slice(bounds.close + 1).join("\n").replace(/^\n+/, "") };
}

const NUMERIC = /^-?\d+(\.\d+)?$/;
const RESERVED = /^(true|false|null|yes|no|~)$/i;

/** Değer düz yazılabilir mi; değilse tırnaklanır. */
function needsQuote(value: string): boolean {
  return (
    value === "" ||
    value !== value.trim() ||
    NUMERIC.test(value) ||
    RESERVED.test(value) ||
    /(^|\s)#|:(\s|$)|^[-?,[\]{}&*!|>'"%@`]/.test(value)
  );
}

function scalarText(value: string): string {
  return needsQuote(value) ? JSON.stringify(value) : value;
}

function emitValue(key: string, value: YamlValue, indent: number, out: string[]): void {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    out.push(`${pad}${key}:`);
    for (const item of value) out.push(`${pad}  - ${scalarText(item.replace(/\s*\n\s*/g, " "))}`);
  } else if (typeof value === "number") {
    out.push(`${pad}${key}: ${value}`);
  } else if (typeof value === "object") {
    out.push(`${pad}${key}:`);
    for (const [childKey, child] of Object.entries(value)) emitValue(childKey, child, indent + 2, out);
  } else if (value.includes("\n")) {
    out.push(`${pad}${key}: |`);
    for (const line of value.replace(/\n+$/, "").split("\n")) out.push(line === "" ? "" : `${pad}  ${line}`);
  } else {
    out.push(`${pad}${key}: ${scalarText(value)}`);
  }
}

/** Sıra korunur; `undefined` ve boş nesne atlanır. `emptyKeys`: değeri henüz yok ama satırı görünsün (stüdyonun yazacağı alanlar). */
export function serializeFrontmatter(data: YamlMap, body: string, emptyKeys: readonly string[] = []): string {
  const out: string[] = ["---"];
  for (const [key, value] of Object.entries(data)) emitValue(key, value, 0, out);
  for (const key of emptyKeys) if (!(key in data)) out.push(`${key}:`);
  out.push("---", "");
  return `${out.join("\n")}${body.trim() === "" ? "" : `\n${body.trim()}\n`}`;
}

/**
 * Var olan fişte üst düzey TEK SATIRLIK alanları günceller (yoksa kapanıştan önce ekler); geri kalan her şey (yorumlar, blok metin,
 * stüdyonun alanları) olduğu gibi kalır. Blok metin ya da iç içe değeri olan bir alan bu yolla değiştirilmez.
 */
export function setFrontmatterFields(text: string, fields: Readonly<Record<string, string | number | boolean>>): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const bounds = frontmatterBounds(lines);
  if (bounds === undefined) throw new Error("Fişte frontmatter yok.");
  let close = bounds.close;
  for (const [key, raw] of Object.entries(fields)) {
    const value = typeof raw === "boolean" ? (raw ? "evet" : "hayir") : String(raw);
    if (value.includes("\n")) throw new Error(`"${key}" tek satır olmalı.`);
    const line = `${key}: ${scalarText(value)}`;
    const at = lines.findIndex((l, idx) => idx > 0 && idx < close && new RegExp(`^${key}:(\\s|$)`).test(l));
    if (at >= 0) {
      const next = lines[at + 1];
      if (next !== undefined && at + 1 < close && indentOf(next) > 0 && next.trim() !== "") throw new Error(`"${key}" tek satırlık bir alan değil.`);
      lines[at] = line;
    } else {
      lines.splice(close, 0, line);
      close += 1;
    }
  }
  return lines.join("\n");
}
