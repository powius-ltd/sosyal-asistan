/**
 * `agy --json-schema` için JSON Schema: zod 4 `z.toJSONSchema` çıktısı, modelin yapısal çıktı ayrıştırıcısının kabul etmeyebileceği
 * anahtar kelimelerden TEMİZLENİR (`$schema`, `additionalProperties`, `pattern`, `format`, `minLength`/`maxLength`, `exclusive*`, `default` …).
 * Beyaz liste yaklaşımı: yalnız yapıyı tarif eden anahtarlar (`type`, `properties`, `required`, `items`, `enum`, `description`,
 * `minimum`/`maximum`, `minItems`/`maxItems`, `anyOf`) kalır. Kaybolan kısıtlar zararsızdır: gerçek doğrulamayı yanıttan sonra zod yapar
 * (ve tek düzeltme turu vardır). agy kökün `"type": "object"` olmasını ister (başlangıçta reddeder): kök her zaman nesnedir.
 */
import "server-only";

import { z } from "zod";

import { videoAnalysisOutputSchema } from "@/lib/video-analysis/output-schema";

type JsonObject = Record<string, unknown>;

const SCALAR_KEYS = ["type", "description", "enum", "minimum", "maximum", "minItems", "maxItems", "nullable"] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Beyaz listeli, özyinelemeli temizlik (girdiyi değiştirmez). */
export function sanitizeJsonSchema(node: unknown): unknown {
  if (!isObject(node)) return node;
  const out: JsonObject = {};
  for (const key of SCALAR_KEYS) if (key in node) out[key] = node[key];
  if ("const" in node && !("enum" in node)) out.enum = [node.const]; // `const` yerine tek değerli enum
  if (isObject(node.properties)) {
    out.properties = Object.fromEntries(Object.entries(node.properties).map(([name, child]) => [name, sanitizeJsonSchema(child)]));
  }
  if (Array.isArray(node.required)) out.required = node.required;
  if (isObject(node.items)) out.items = sanitizeJsonSchema(node.items);
  if (Array.isArray(node.anyOf)) out.anyOf = node.anyOf.map(sanitizeJsonSchema);
  return out;
}

/** Yanıt şemasının temizlenmiş JSON Schema nesnesi. */
export function buildModelJsonSchema(): JsonObject {
  const raw = z.toJSONSchema(videoAnalysisOutputSchema, { target: "draft-7" });
  const clean = sanitizeJsonSchema(raw);
  if (!isObject(clean) || clean.type !== "object") throw new Error("Yanıt şemasının kökü nesne olmalı.");
  return clean;
}

/** Dosyaya yazılacak metin (`agy --json-schema <yol>`). */
export function modelJsonSchemaText(): string {
  return JSON.stringify(buildModelJsonSchema(), null, 2);
}
