/**
 * agy ile tek videoyu analiz eder: yanıt şemasını klasöre yazar → istemi kurar → agy → yanıtı çözer (zarf + çit + JSON) → zod.
 * Şema hatasında TEK düzeltme turu: `formatZodIssues` çıktısı modele geri verilir; yine geçersizse `invalid_output` (analiz `failed`).
 *
 * Yanıt biçimi: agy `--output-format json` bir ZARF döndürür (`agy-envelope.ts`: `structured_output` nesnesi öncelikli, yoksa `response`
 * metni; zarf yoksa stdout'un kendisi). Ayıklama ve zod doğrulaması ortak `lib/llm/json-extract` üzerindendir (`parseLlmJson`, `formatZodIssues`).
 */
import "server-only";

import { writeFileSync } from "node:fs";
import path from "node:path";

import { formatZodIssues, parseLlmJson } from "@/lib/llm/json-extract";
import { readAgyEnvelope, type AgyUsage } from "@/lib/video-analysis/agy-envelope";
import { runAgy, type AgyDeps, type CallStats } from "@/lib/video-analysis/agy-client";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { modelJsonSchemaText } from "@/lib/video-analysis/model-json-schema";
import { videoAnalysisOutputSchema, type VideoAnalysisOutput } from "@/lib/video-analysis/output-schema";
import { buildAnalysisPrompt, buildCorrectionPrompt } from "@/lib/video-analysis/prompt";

export const SCHEMA_FILE_NAME = "response-schema.json";

export interface AgyAnalysisInput {
  /** Video dosyasını içeren izole klasör (cwd). */
  dir: string;
  fileName: string;
  caption?: string;
  durationSec?: number;
}

export type ParsedResponse = { usage: AgyUsage } & ({ ok: true; value: VideoAnalysisOutput } | { ok: false; problems: string; responseText: string });

/** agy stdout'unu çözer: zarf → yük (nesne ya da metin) → zod. Başarısızlıkta düzeltme turuna girecek metni döndürür. */
export function parseAgyResponse(stdout: string): ParsedResponse {
  const { payload, usage } = readAgyEnvelope(stdout);

  if (typeof payload === "string") {
    const parsed = parseLlmJson(payload, videoAnalysisOutputSchema);
    if (parsed.ok) return { ok: true, value: parsed.value, usage };
    return { ok: false, problems: parsed.issues ?? parsed.reason, responseText: payload, usage };
  }
  const checked = videoAnalysisOutputSchema.safeParse(payload);
  if (checked.success) return { ok: true, value: checked.data, usage };
  return { ok: false, problems: formatZodIssues(checked.error), responseText: JSON.stringify(payload ?? null), usage };
}

const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "thinkingTokens"] as const;

/**
 * Turların token kullanımını istatistiğe yazar: bir alan YALNIZ bütün turlarda bildirildiyse toplanır. Turlardan birinde yoksa toplam
 * bilinmiyordur (`undefined`): kısmi toplam tam sayı gibi yazılmaz (bilinmeyen ≠ 0).
 */
export function writeUsage(stats: CallStats, turns: readonly AgyUsage[]): void {
  for (const field of USAGE_FIELDS) {
    const values = turns.map((usage) => usage[field]);
    if (values.every((value): value is number => value !== undefined)) stats[field] = values.reduce((sum, value) => sum + value, 0);
    else delete stats[field];
  }
}

export async function analyzeWithAgy(input: AgyAnalysisInput, deps: AgyDeps, stats: CallStats): Promise<VideoAnalysisOutput> {
  const schemaPath = path.join(input.dir, SCHEMA_FILE_NAME);
  writeFileSync(schemaPath, modelJsonSchemaText(), "utf8");

  const prompt = buildAnalysisPrompt({ fileName: input.fileName, caption: input.caption, durationSec: input.durationSec });
  const first = parseAgyResponse(await runAgy({ dir: input.dir, schemaPath, prompt }, deps, stats));
  writeUsage(stats, [first.usage]);
  if (first.ok) return first.value;

  stats.correctionTurns += 1;
  const correction = buildCorrectionPrompt(prompt, first.responseText, first.problems);
  const second = parseAgyResponse(await runAgy({ dir: input.dir, schemaPath, prompt: correction }, deps, stats));
  writeUsage(stats, [first.usage, second.usage]);
  if (second.ok) return second.value;
  throw new VideoAnalysisError("invalid_output", `Model yanıtı düzeltme turundan sonra da şemaya uymadı: ${second.problems.replace(/\s+/g, " ").slice(0, 300)}`);
}
