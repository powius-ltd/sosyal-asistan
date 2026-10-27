import { describe, expect, it } from "vitest";

import { EDIT_METRICS_SCHEMA } from "@/lib/data/analysis-schema";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import { HOOK_SOURCES } from "@/lib/domain/intel";
import { CTA_TYPES, IDEA_FRAMES, LABEL_AXES, SECTION_TYPES } from "@/lib/domain/taxonomy";
import { buildModelJsonSchema, modelJsonSchemaText, sanitizeJsonSchema } from "@/lib/video-analysis/model-json-schema";
import { videoAnalysisOutputSchema } from "@/lib/video-analysis/output-schema";
import { validOutput } from "@/lib/video-analysis/test-support";

describe("videoAnalysisOutputSchema", () => {
  it("geçerli çıktıyı kabul eder", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput()).success).toBe(true);
  });

  it("taksonomi dışı hook türünü, bölüm tipini, etiket eksenini ve kaynağı reddeder", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ hookType: "clickbait" as never })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ hookSource: "audio" as never })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ sections: [{ type: "intro" as never, quote: "a b", startSec: 0 }] })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ labels: [{ key: "mood" as never, value: "x", evidence: "a b" }] })).success).toBe(false);
  });

  it("transcript kanalı yalnız speech | screen (hook kaynağı screen_text ile karışmaz)", () => {
    const bad = validOutput({ transcript: [{ startSec: 0, text: "hello there", channel: "screen_text" as never }] });
    expect(videoAnalysisOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("frame ve cta_type etiket değerleri taksonomiden olmalı; topic/tone serbest", () => {
    const withLabel = (key: "frame" | "cta_type" | "topic" | "tone", value: string) =>
      videoAnalysisOutputSchema.safeParse(validOutput({ labels: [{ key, value, evidence: "your body can renew" }] })).success;
    expect(withLabel("frame", "science")).toBe(true);
    expect(withLabel("frame", "spiritual")).toBe(false);
    expect(withLabel("cta_type", "comment_keyword")).toBe(true);
    expect(withLabel("cta_type", "buy_now")).toBe(false);
    expect(withLabel("topic", "anything goes here")).toBe(true);
    expect(withLabel("tone", "gentle")).toBe(true);
  });

  it("language DB kalıbına uymalı; bilinmiyorsa 'und'", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ language: "und" })).success).toBe(true);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ language: "pt-BR" })).success).toBe(true);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ language: "English" })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ language: "" })).success).toBe(false);
  });

  it("kurgu ölçümleri isteğe bağlı ve EDIT_METRICS_SCHEMA ile uyumlu; negatif sayı reddedilir", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ editMetrics: {} })).success).toBe(true);
    const parsed = videoAnalysisOutputSchema.parse(validOutput());
    expect(EDIT_METRICS_SCHEMA.safeParse(parsed.editMetrics).success).toBe(true);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ editMetrics: { cutCount: -1 } })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ editMetrics: { tempo: "warp" as never } })).success).toBe(false);
  });

  it("segment zamanı negatif olamaz; boş metin reddedilir", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ transcript: [{ startSec: -1, text: "a b", channel: "speech" }] })).success).toBe(false);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ transcript: [{ startSec: 0, text: "   ", channel: "speech" }] })).success).toBe(false);
  });

  it("hookText boş olabilir (konuşma, yazı ve açıklama yoksa)", () => {
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ hookText: "" })).success).toBe(true);
  });
});

describe("modelJsonSchema (agy --json-schema)", () => {
  const schema = buildModelJsonSchema();
  const properties = schema.properties as Record<string, Record<string, unknown>>;

  it("kök nesnedir (agy başlangıçta başka kökü reddeder)", () => {
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["language", "transcript", "hookText", "hookSource", "hookType", "hookTypeEvidence", "sections", "labels", "editMetrics"]));
  });

  it("enum'lar taksonomiyle birebir", () => {
    expect(properties.hookType.enum).toEqual([...HOOK_TYPES]);
    expect(properties.hookSource.enum).toEqual([...HOOK_SOURCES]);
    const section = (properties.sections.items as { properties: Record<string, { enum?: unknown }> }).properties;
    expect(section.type.enum).toEqual([...SECTION_TYPES]);
    const label = (properties.labels.items as { properties: Record<string, { enum?: unknown }> }).properties;
    expect(label.key.enum).toEqual([...LABEL_AXES]);
    const segment = (properties.transcript.items as { properties: Record<string, { enum?: unknown }> }).properties;
    expect(segment.channel.enum).toEqual(["speech", "screen"]);
  });

  it("modelin reddedebileceği anahtar kelimeler temizlenmiş", () => {
    const text = modelJsonSchemaText();
    for (const banned of ['"$schema"', '"additionalProperties"', '"pattern"', '"format"', '"minLength"', '"maxLength"', '"exclusiveMinimum"', '"default"']) {
      expect(text).not.toContain(banned);
    }
    expect(text).toContain('"enum"'); // yapı kalır
    expect(text).toContain('"items"');
  });

  it("yalnız modelin gözlemleyebildiği kurgu ölçümlerini ister (türevler kodda hesaplanır)", () => {
    const metrics = (properties.editMetrics as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(metrics).sort()).toEqual([
      "cutCount", "cutsInFirst3Sec", "hasBurnedCaptions", "hasMusic", "layout", "onCameraSpeaker", "onScreenTextCount", "openingVisual", "tempo", "textLines", "textPosition",
    ]);
  });

  it("stüdyo fişinin 5 ek biçim alanı isteğe bağlıdır; eski (alansız) ölçüm geçerli kalır, geçersiz değer reddedilir", () => {
    expect(EDIT_METRICS_SCHEMA.safeParse({ cutCount: 12, tempo: "fast" }).success).toBe(true);
    const full = { cutsInFirst3Sec: 2, textPosition: "top", textLines: 2, layout: "split", openingVisual: "face" };
    expect(EDIT_METRICS_SCHEMA.safeParse(full).success).toBe(true);
    expect(videoAnalysisOutputSchema.safeParse(validOutput({ editMetrics: full as never })).success).toBe(true);
    expect(EDIT_METRICS_SCHEMA.safeParse({ layout: "diagonal" }).success).toBe(false);
    expect(EDIT_METRICS_SCHEMA.safeParse({ textLines: 0 }).success).toBe(true); // yazısız video: 0 satır geçerli (Ö3)
    expect(EDIT_METRICS_SCHEMA.safeParse({ textLines: -1 }).success).toBe(false);
  });

  it("sanitizeJsonSchema girdiyi değiştirmez; const → enum", () => {
    const input = { type: "object", additionalProperties: false, properties: { a: { const: "x", format: "date" } } };
    const copy = JSON.parse(JSON.stringify(input));
    expect(sanitizeJsonSchema(input)).toEqual({ type: "object", properties: { a: { enum: ["x"] } } });
    expect(input).toEqual(copy);
  });

  it("taksonomi listeleri boş değil (şema anlamsız kalmasın)", () => {
    expect(HOOK_TYPES.length + SECTION_TYPES.length + CTA_TYPES.length + IDEA_FRAMES.length).toBeGreaterThan(20);
  });
});
