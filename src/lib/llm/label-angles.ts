/**
 * Görev — kreatif etiket (`label-angles`): her içeriği ANGLE (hangi kapıdan girdi) + FARKINDALIK KATMANI (hangi izleyiciye hitap ediyor)
 * ile etiketler; her etiket içeriğin kendi metninden birebir alıntıyla gelir. En çok 8'lik parti (`LABEL_BATCH_MAX`); partileme
 * orkestrasyonda (`lib/intel/label-run.ts`). Sayılabilir hiçbir şey LLM'e sorulmaz; hücre sayısı/lift/durum kodla hesaplanır (`lib/matrix`).
 *
 * KOD DOĞRULAMASI (1 düzeltme turu, sonra):
 *  - çıktı id'leri girdi id'leriyle BİREBİR aynı (eksik/fazla/yinelenen yok) ve "labeled" sonuç zod'dan geçer (`CREATIVE_LABEL_FIELDS`):
 *    düzeltme turundan sonra da bozuksa `invalid_output` (yapısal hata sessizce etikete dönüşmez).
 *  - alıntılar o içeriğin korpusunda (konuşma ∪ ekran yazısı ∪ açıklama) birebir aranır (`checkQuote` → `lib/intel/evidence`). Bulunamayan
 *    alıntı düzeltme turunu tetikler; yine de bulunamazsa etiket `evidenceVerified = false` ile DÖNER (saklanır, matrise girmez).
 * KARAR VERİLEMEYEN içerik `unsure`'dır: satır yazılmaz (rastgele hücre yok). Metni olmayan içerik modele gitmez (`unlabelable`).
 */
import "server-only";

import { z } from "zod";

import { CREATIVE_LABEL_FIELDS, type CreativeLabelFields } from "@/lib/data/creative-label-schema";
import type { CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import { checkQuote, hasAnyText, idSetProblem, indexById, type ContentText } from "@/lib/llm/content-text";
import { buildLabelAnglesSystemPrompt } from "@/lib/llm/label-angles-prompt";
import { clipForPrompt, dataBlock } from "@/lib/llm/prompt-blocks";
import { LlmError, type LlmBackend, type LlmCallMeta, type LlmKind } from "@/lib/llm/types";

export const PROMPT_VERSION = "label-angles-v1";
export const LABEL_BATCH_MAX = 8;
/**
 * `collection_runs.kind` değeri: açı etiketlemeye özel tür (konu eleğinden ayrı sayılır). Bu türe geçişten ÖNCEki etiketleme
 * koşuları `llm_topic_screen` olarak kayıtlıdır (geçmiş satırlar değişmez).
 */
export const LABEL_ANGLES_KIND: LlmKind = "llm_angle_label";

const HOOK_CHARS = 200;
const SPEECH_CHARS = 1800;
const SCREEN_CHARS = 500;
const CAPTION_CHARS = 700;
const DEFAULT_TIMEOUT_MS = 180_000;
/** Düzeltme isteğinde listelenen en çok sorun (istem şişmesin). */
const PROBLEM_LIST_MAX = 8;

export interface LabelAnglesItem extends ContentText {
  /** Video analizinin hook satırı (ipucu). */
  hookText?: string;
  /** Kural tabanlı CTA türü (`classifyCta`); bilinmiyorsa undefined. */
  ctaType?: string;
}

export interface AngleLabel {
  id: string;
  angle: CreativeAngle;
  funnelStage: FunnelStage;
  angleEvidence: string;
  funnelEvidence: string;
  /** İki alıntı da içeriğin korpusunda birebir bulundu mu. false ise etiket saklanır ama matrise girmez. */
  evidenceVerified: boolean;
}

export interface LabelAnglesOutcome {
  /** Girdi sırasında; `unsure` ve `unlabelable` olanlar yok. */
  labels: AngleLabel[];
  /** Modelin karar veremediği içerikler (satır yazılmaz). */
  unsure: string[];
  /** Metni olmayan içerikler (model çağrılmadı). */
  unlabelable: string[];
  promptVersion: string;
  /** Model çağrısı yapılmadıysa (hepsi metinsiz) undefined. */
  meta?: LlmCallMeta;
}

const FIELDS = CREATIVE_LABEL_FIELDS.shape;

export const LABEL_OUTPUT_SCHEMA = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("The item's id, copied exactly"),
      verdict: z.enum(["labeled", "unsure"]).describe("labeled when both axes can be decided from the text; unsure otherwise"),
      angle: FIELDS.angle.optional().describe("Angle id; only when labeled"),
      funnel_stage: FIELDS.funnel_stage.optional().describe("Awareness stage id; only when labeled"),
      angle_evidence: FIELDS.angle_evidence.optional().describe("Verbatim quote from the item's own text that shows the angle; only when labeled"),
      funnel_evidence: FIELDS.funnel_evidence.optional().describe("Verbatim quote from the item's own text that shows the stage; only when labeled"),
    }),
  ),
});
type LabelOutput = z.infer<typeof LABEL_OUTPUT_SCHEMA>;
type LabelEntry = LabelOutput["results"][number];

type ParsedEntry = { ok: true; fields: CreativeLabelFields } | { ok: false; problem: string };

/** "labeled" sonucun alanları tam ve geçerli mi (aynı zod şeması DB yazımında da kullanılır). */
function parseLabeled(entry: LabelEntry): ParsedEntry {
  const parsed = CREATIVE_LABEL_FIELDS.safeParse({
    angle: entry.angle,
    funnel_stage: entry.funnel_stage,
    angle_evidence: entry.angle_evidence,
    funnel_evidence: entry.funnel_evidence,
  });
  if (parsed.success) return { ok: true, fields: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
  return { ok: false, problem: `${entry.id}: "labeled" sonuçta eksik ya da geçersiz alan (${fields})` };
}

/** YAPISAL sorun: id kümesi ya da "labeled" sonucun alanları. Düzeltme turundan sonra da sürerse görev hata verir. */
function structuralProblem(expectedIds: readonly string[], output: LabelOutput): string | undefined {
  const ids = idSetProblem(expectedIds, output.results.map((entry) => entry.id));
  if (ids !== undefined) return ids;
  const broken = output.results.filter((entry) => entry.verdict === "labeled").flatMap((entry) => {
    const parsed = parseLabeled(entry);
    return parsed.ok ? [] : [parsed.problem];
  });
  return broken.length === 0 ? undefined : `${broken.slice(0, PROBLEM_LIST_MAX).join("; ")}. Eksik alanları doldur ya da o içerik için verdict "unsure" de.`;
}

const QUOTE_FIELDS = [
  ["angle_evidence", "angleEvidence"],
  ["funnel_evidence", "funnelEvidence"],
] as const;

/** Bir etiketin iki alıntısı da korpusta var mı; yoksa sebep listesi. */
function checkLabelQuotes(content: ContentText | undefined, fields: CreativeLabelFields): { verified: boolean; failures: string[] } {
  const failures = QUOTE_FIELDS.flatMap(([name]) => {
    const check = checkQuote(content, fields[name]);
    return check.ok ? [] : [`${name} (${check.reason})`];
  });
  return { verified: failures.length === 0, failures };
}

/** ANLAMSAL sorun: bulunamayan alıntılar. Düzeltme turu tetikler; son denemede de sürerse etiket `evidenceVerified = false` olur. */
function quoteProblem(byId: ReadonlyMap<string, ContentText>, output: LabelOutput): string | undefined {
  const problems = output.results.flatMap((entry) => {
    if (entry.verdict !== "labeled") return [];
    const parsed = parseLabeled(entry);
    if (!parsed.ok) return [];
    const { failures } = checkLabelQuotes(byId.get(entry.id), parsed.fields);
    return failures.length === 0 ? [] : [`${entry.id}: ${failures.join(", ")}`];
  });
  if (problems.length === 0) return undefined;
  return `Bazı alıntılar içeriğin kendi metninde birebir bulunamadı: ${problems.slice(0, PROBLEM_LIST_MAX).join("; ")}. Alıntıyı metinden harfi harfine kopyala; bulamıyorsan o içerik için verdict "unsure" de.`;
}

export interface LabelAnglesOptions {
  timeoutMs?: number;
  /** Hafif model (`LLM_MODEL_LIGHT`); verilmezse CLI varsayılanı. */
  model?: string;
}

/** Tek parti (≤ 8 içerik). */
export async function labelAngles(backend: LlmBackend, items: readonly LabelAnglesItem[], options: LabelAnglesOptions = {}): Promise<LabelAnglesOutcome> {
  if (items.length === 0) throw new LlmError("invalid_input", "Etiketlenecek içerik yok.");
  if (items.length > LABEL_BATCH_MAX) throw new LlmError("invalid_input", `Bir partide en çok ${LABEL_BATCH_MAX} içerik etiketlenir (${items.length} verildi).`);
  const ids = items.map((item) => item.id);
  if (ids.some((id) => id.trim() === "") || new Set(ids).size !== ids.length) throw new LlmError("invalid_input", "İçerik id'leri boş olmamalı ve tekil olmalı.");

  const sendable = items.filter(hasAnyText);
  const unlabelable = items.filter((item) => !hasAnyText(item)).map((item) => item.id);
  if (sendable.length === 0) return { labels: [], unsure: [], unlabelable, promptVersion: PROMPT_VERSION };

  const payload = sendable.map((item) => ({
    id: item.id,
    hook_text: clipForPrompt(item.hookText, HOOK_CHARS),
    transcript: clipForPrompt(item.transcript, SPEECH_CHARS),
    screen_text: clipForPrompt(item.screenText, SCREEN_CHARS),
    caption: clipForPrompt(item.caption, CAPTION_CHARS),
    cta_type: item.ctaType,
  }));
  const expectedIds = sendable.map((item) => item.id);
  const byId = indexById(sendable);

  const { value, meta } = await backend.runJson({
    task: LABEL_ANGLES_KIND,
    system: buildLabelAnglesSystemPrompt(),
    input: dataBlock("items", payload),
    schema: LABEL_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => structuralProblem(expectedIds, output) ?? quoteProblem(byId, output),
    // Son denemede yalnız alıntı sorunu kaldıysa kabul (etiket `evidenceVerified = false`); yapısal sorun aşağıda hata olur.
    reviewFailure: "accept",
  });

  const structural = structuralProblem(expectedIds, value);
  if (structural !== undefined) throw new LlmError("invalid_output", `Yanıt düzeltme turundan sonra da geçersiz: ${structural}`, meta);

  const entryById = new Map(value.results.map((entry) => [entry.id, entry]));
  const labels: AngleLabel[] = [];
  const unsure: string[] = [];
  for (const id of expectedIds) {
    const entry = entryById.get(id) as LabelEntry;
    const parsed = entry.verdict === "labeled" ? parseLabeled(entry) : undefined;
    if (parsed === undefined || !parsed.ok) {
      unsure.push(id);
      continue;
    }
    const { fields } = parsed;
    labels.push({
      id,
      angle: fields.angle,
      funnelStage: fields.funnel_stage,
      angleEvidence: fields.angle_evidence,
      funnelEvidence: fields.funnel_evidence,
      evidenceVerified: checkLabelQuotes(byId.get(id), fields).verified,
    });
  }
  return { labels, unsure, unlabelable, promptVersion: PROMPT_VERSION, meta };
}
