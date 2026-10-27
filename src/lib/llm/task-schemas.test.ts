import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { toCliJsonSchema } from "@/lib/llm/claude-cli-args";
import { CLUSTER_OUTPUT_SCHEMA } from "@/lib/llm/cluster-topics";
import { ideasOutputSchema } from "@/lib/llm/generate-ideas-schema";
import { SCREEN_OUTPUT_SCHEMA } from "@/lib/llm/screen-topics";
import { SYNTHESIS_OUTPUT_SCHEMA } from "@/lib/llm/synthesize-week-output";
import { VOICE_OUTPUT_SCHEMA } from "@/lib/llm/voice-profile";
import { hookTypeSchema } from "@/lib/llm/taxonomy";

/**
 * CLI `--json-schema` yalnız kendi (Ajv) doğrulayıcısının kabul ettiği şemayı alır; `$schema: 2020-12` ve çözümlenemeyen `$ref` reddedilir
 * (gerçek çağrıda doğrulandı). Bu test, beş görevin şemasının CLI'ye güvenle gidecek biçimde üretildiğini kilitler.
 */
const SCHEMAS: Record<string, z.ZodType> = {
  "screen-topics": SCREEN_OUTPUT_SCHEMA,
  "voice-profile": VOICE_OUTPUT_SCHEMA,
  "cluster-topics": CLUSTER_OUTPUT_SCHEMA,
  "synthesize-week": SYNTHESIS_OUTPUT_SCHEMA,
  "generate-ideas (en)": ideasOutputSchema("en"),
  "generate-ideas (tr)": ideasOutputSchema("tr"),
};

/** Şemadaki her nesne düğümü (properties taşıyan). */
function* objectNodes(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const item of node) yield* objectNodes(item);
  } else if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.properties !== undefined) yield record;
    for (const value of Object.values(record)) yield* objectNodes(value);
  }
}

describe.each(Object.entries(SCHEMAS))("CLI şeması: %s", (_name, schema) => {
  const text = toCliJsonSchema(schema);
  const json = JSON.parse(text) as Record<string, unknown>;

  it("kök nesne, `$schema`/`$ref`/`definitions` yok (CLI reddeder/çözemez)", () => {
    expect(json.type).toBe("object");
    expect(json.$schema).toBeUndefined();
    expect(text).not.toContain("$ref");
    expect(text).not.toContain("definitions");
    expect(text).not.toContain("$defs");
  });

  it("her nesne düğümü additionalProperties:false; gerekli alanlar properties içinde", () => {
    for (const node of objectNodes(json)) {
      expect(node.additionalProperties).toBe(false);
      const properties = Object.keys(node.properties as object);
      for (const key of (node.required as string[] | undefined) ?? []) expect(properties).toContain(key);
    }
  });

  it("boyut makul: argümana giren şema 8 000 karakteri aşmaz", () => {
    expect(text.length).toBeLessThan(8000);
  });
});

describe("taksonomi enum'ları şemaya girer", () => {
  it("generate-ideas şemasında hook türü enum'u taksonomiyle birebir", () => {
    const json = JSON.parse(toCliJsonSchema(ideasOutputSchema("tr")));
    const hookType = json.properties.ideas.items.properties.hooks.items.properties.type;
    expect(hookType.enum).toEqual([...hookTypeSchema.options]);
    expect(json.properties.ideas.items.properties.hooks).toMatchObject({ minItems: 3, maxItems: 5 });
    expect(json.properties.ideas.items.properties.evidenceIds).toMatchObject({ minItems: 2 });
  });
});
