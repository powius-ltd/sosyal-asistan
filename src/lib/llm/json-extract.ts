/**
 * Model çıktısından JSON ayıklama: çitli (```json … ```) ya da çitsiz; öncesinde/sonrasında düz metin olabilir. `agy` şema
 * ZORLAMAZ (serbest metin döner), Claude CLI `--json-schema` ile bile zarf/çit ekleyebilir: bu yüzden çıktı her zaman bu yoldan
 * geçer ve ardından zod ile doğrulanır (`parseLlmJson`); doğrulama hatası tek bir düzeltme turuna (`formatZodIssues`) girdi olur.
 *
 * Sıra: (1) tüm metin JSON mu? (2) çitli bloklar (etiketli olan önce) (3) dengeli `{…}`/`[…]` taraması (metin içi süslü parantezler
 * dize farkındalığıyla atlanır) (4) son çare: sondaki virgül onarımı. JSON'a BENZEYEN ama geçersiz parça yutulmaz: hiçbiri çözülemezse
 * `ok: false` + sebep döner (çağıran hatayı bilir).
 */
import "server-only";

import type { z } from "zod";

export type JsonExtraction =
  | { ok: true; value: unknown; how: "whole" | "fenced" | "balanced" | "repaired" }
  | { ok: false; reason: string };

const FENCE = /```([A-Za-z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)```/g;
const BOM = /^﻿/;

function tryParse(text: string): { value: unknown } | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    return undefined;
  }
}

/** `start`'taki `{`/`[`ten eşleşen kapanışa kadar olan parça (dize/kaçış farkındalığıyla); kapanmıyorsa undefined. */
function balancedSlice(text: string, start: number): string | undefined {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return undefined;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Sondaki virgülleri (`,}` `,]`) dize DIŞINDA siler; başka hiçbir şeye dokunmaz. */
function removeTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue; // sondaki virgül
      out += ch;
    } else out += ch;
  }
  return out;
}

function* balancedCandidates(text: string): Generator<string> {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{" && text[i] !== "[") continue;
    const slice = balancedSlice(text, i);
    if (slice) yield slice;
  }
}

/** Metinden ilk çözülebilir JSON değerini çıkarır (nesne, dizi ya da — tüm metin ise — ilkel). */
export function extractJson(raw: string): JsonExtraction {
  const text = raw.replace(BOM, "");
  if (text.trim() === "") return { ok: false, reason: "Yanıt boş." };

  const whole = tryParse(text);
  if (whole) return { ok: true, value: whole.value, how: "whole" };

  // Çitli bloklar: "json" etiketli olanlar önce, sonra etiketsizler; ilk çözülebilen kazanır.
  const fences = [...text.matchAll(FENCE)].map((m) => ({ tag: m[1].toLowerCase(), body: m[2] }));
  for (const { body } of [...fences.filter((f) => f.tag === "json"), ...fences.filter((f) => f.tag !== "json")]) {
    const parsed = tryParse(body);
    if (parsed) return { ok: true, value: parsed.value, how: "fenced" };
    for (const slice of balancedCandidates(body)) {
      const inner = tryParse(slice);
      if (inner) return { ok: true, value: inner.value, how: "fenced" };
    }
  }

  // Çitsiz: düz metin içindeki ilk dengeli {…} / […] (ilk çözülebilen).
  for (const slice of balancedCandidates(text)) {
    const parsed = tryParse(slice);
    if (parsed) return { ok: true, value: parsed.value, how: "balanced" };
  }

  // Son çare: sondaki virgül onarımı (model sık yapar).
  for (const slice of [text, ...balancedCandidates(text)]) {
    const repaired = tryParse(removeTrailingCommas(slice));
    if (repaired && typeof repaired.value === "object" && repaired.value !== null) return { ok: true, value: repaired.value, how: "repaired" };
  }
  return { ok: false, reason: "Yanıtta çözülebilir JSON bulunamadı." };
}

export type LlmParseResult<T> = { ok: true; value: T; how: "whole" | "fenced" | "balanced" | "repaired" } | { ok: false; reason: string; issues?: string };

/** zod hatasını model düzeltme turuna verilecek kısa metne çevirir ("yol: ileti"); en çok `max` satır. */
export function formatZodIssues(error: z.ZodError, max = 8): string {
  const lines = error.issues.slice(0, max).map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(kök)"}: ${issue.message}`);
  const rest = error.issues.length - lines.length;
  return rest > 0 ? `${lines.join("\n")}\n(+${rest} hata daha)` : lines.join("\n");
}

/** Ayıkla + zod ile doğrula. Şema hatasında `issues` düzeltme turu için hazır metindir. */
export function parseLlmJson<T>(raw: string, schema: z.ZodType<T>): LlmParseResult<T> {
  const extracted = extractJson(raw);
  if (!extracted.ok) return extracted;
  const parsed = schema.safeParse(extracted.value);
  if (!parsed.success) return { ok: false, reason: "JSON şemaya uymuyor.", issues: formatZodIssues(parsed.error) };
  return { ok: true, value: parsed.data, how: extracted.how };
}
