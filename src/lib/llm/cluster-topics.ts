/**
 * Görev 3 — konu kümeleme (`llm_topic_cluster`): analizli içeriklerin konu etiketlerinden "neye yüklen" için konu kümeleri
 * (`FocusGroup` "topic_cluster"). Yalnız gruplama + ad: kaç video, hangi lift gibi sayıların hepsi düz kod (`lib/insights`).
 *
 * KOD DOĞRULAMASI: kümelerdeki id'ler girdi id'lerinin alt kümesi olmalı ve her id EN ÇOK 1 kümede olmalı; küme anahtarları tekil olmalı.
 * İhlal olursa 1 düzeltme turu yapılır; yine olursa sonuç KODLA ONARILIR (bilinmeyen id atılır, yinelenen id ilk kümede kalır, yinelenen
 * anahtar ek alır, boşalan küme düşer) ve `problems` içinde raporlanır: onarılmış çıktı sözleşmeyi (alt küme, ≤ 1 küme) her zaman sağlar.
 * Anahtar model tarafından bozuk yazılırsa kodla taksonomi anahtarı biçimine (`TAXONOMY_KEY_PATTERN`) getirilir.
 */
import "server-only";

import { z } from "zod";

import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import { TAXONOMY_KEY_PATTERN } from "@/lib/llm/taxonomy";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";
import { foldTurkish } from "@/lib/text";

export const PROMPT_VERSION = "cluster-topics-v1";
export const DEFAULT_MAX_CLUSTERS = 8;
/** Kümelenecek en az içerik sayısı (altında model çağrılmaz: tek/iki videodan küme olmaz). */
export const MIN_ITEMS_TO_CLUSTER = 3;
const DEFAULT_TIMEOUT_MS = 180_000;
const KEY_MAX = 40;

export interface ClusterTopicsItem {
  id: string;
  /** Video analizi/konu eleğinden konu etiketi. */
  topic?: string;
  hookText?: string;
  caption?: string;
}

export interface ClusterTopicsInput {
  items: readonly ClusterTopicsItem[];
  /** En çok küme sayısı (varsayılan 8). */
  maxClusters?: number;
}

export interface TopicCluster {
  /** Taksonomi anahtar biçimi (`^[a-z][a-z0-9_]*$`), sonuçta tekil. */
  key: string;
  /** Türkçe kısa ad. */
  label: string;
  contentIds: string[];
}

export interface ClusterTopicsOutcome {
  /** Büyükten küçüğe. */
  clusters: TopicCluster[];
  /** Hiçbir kümeye girmeyen girdi id'leri (metinsiz olanlar dahil). */
  unclustered: string[];
  /** Onarılan sözleşme ihlalleri (Türkçe); boşsa model çıktısı olduğu gibi geçerliydi. */
  problems: string[];
  promptVersion: string;
  /** Model çağrılmadıysa (çok az içerik) undefined. */
  meta?: LlmCallMeta;
}

export const CLUSTER_OUTPUT_SCHEMA = z.object({
  clusters: z
    .array(
      z.object({
        key: z.string().min(1).max(80).describe("lowercase snake_case key"),
        label: z.string().min(1).max(60).describe("Short Turkish name, 2-4 words"),
        contentIds: z.array(z.string()).min(1).describe("Ids copied from the input"),
      }),
    )
    .min(1)
    .max(20),
});
type ClusterOutput = z.infer<typeof CLUSTER_OUTPUT_SCHEMA>;

function systemPrompt(maxClusters: number): string {
  return [
    "You group short-form videos into topic clusters for a content-planning panel. Read <items>: each has an id and what is known about it (topic label, hook line, caption).",
    `Create at most ${maxClusters} clusters. A cluster is a recurring SUBJECT or angle a creator could make more videos about (for example a ritual, a belief, a struggle), not a format or a hook style.`,
    "For every cluster return key (lowercase snake_case), label and contentIds.",
    "",
    "Rules: use only ids that appear in the input; every id in at most one cluster; prefer clusters with 2 or more videos; a video that fits nothing may be left out (do not force it); never make a catch-all 'other' cluster; never invent ids.",
    PANEL_LANGUAGE_RULE,
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");
}

/** Serbest metinden taksonomi anahtarı: Türkçe katla, harf/rakam dışını `_` yap, harfle başlat, ≤ 40 karakter. */
export function toClusterKey(text: string): string {
  const slug = foldTurkish(text).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const key = (/^[a-z]/.test(slug) ? slug : slug === "" ? "cluster" : `k_${slug}`).slice(0, KEY_MAX).replace(/_+$/g, "");
  return TAXONOMY_KEY_PATTERN.test(key) ? key : "cluster";
}

/** Sözleşme ihlalleri (Türkçe), yoksa []. */
export function clusterProblems(output: ClusterOutput, inputIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const owner = new Map<string, number>();
  output.clusters.forEach((cluster, index) => {
    for (const id of cluster.contentIds) {
      if (!inputIds.has(id)) problems.push(`"${cluster.label}" kümesindeki "${id}" girdide yok.`);
      else if (owner.has(id) && owner.get(id) !== index) problems.push(`"${id}" birden fazla kümede (“${output.clusters[owner.get(id) as number].label}” ve “${cluster.label}”).`);
      else owner.set(id, index);
    }
  });
  const keys = output.clusters.map((cluster) => toClusterKey(cluster.key));
  if (new Set(keys).size !== keys.length) problems.push("Küme anahtarları tekil olmalı.");
  return problems;
}

/** Çıktıyı sözleşmeye getirir (bilinmeyen id at, yinelenen id'yi ilk kümede tut, anahtarı tekilleştir, boş kümeyi düşür). */
function repairClusters(output: ClusterOutput, inputIds: ReadonlySet<string>): TopicCluster[] {
  const claimed = new Set<string>();
  const usedKeys = new Set<string>();
  const clusters: TopicCluster[] = [];
  for (const raw of output.clusters) {
    const contentIds: string[] = [];
    for (const id of raw.contentIds) {
      if (inputIds.has(id) && !claimed.has(id)) {
        claimed.add(id);
        contentIds.push(id);
      }
    }
    if (contentIds.length === 0) continue;
    let key = toClusterKey(raw.key);
    for (let n = 2; usedKeys.has(key); n += 1) key = `${toClusterKey(raw.key).slice(0, KEY_MAX - 3)}_${n}`;
    usedKeys.add(key);
    clusters.push({ key, label: raw.label.trim(), contentIds });
  }
  return clusters.sort((a, b) => b.contentIds.length - a.contentIds.length || a.label.localeCompare(b.label, "tr"));
}

export interface ClusterTopicsOptions {
  timeoutMs?: number;
  model?: string;
}

export async function clusterTopics(backend: LlmBackend, input: ClusterTopicsInput, options: ClusterTopicsOptions = {}): Promise<ClusterTopicsOutcome> {
  const ids = input.items.map((item) => item.id);
  if (ids.some((id) => id.trim() === "") || new Set(ids).size !== ids.length) throw new LlmError("invalid_input", "İçerik id'leri boş olmamalı ve tekil olmalı.");
  const maxClusters = Math.max(1, Math.floor(input.maxClusters ?? DEFAULT_MAX_CLUSTERS));

  const described = input.items
    .map((item) => ({ id: item.id, topic: clipForPrompt(item.topic, 120), hookText: clipForPrompt(item.hookText, 200), caption: clipForPrompt(item.caption, 300) }))
    .filter((item) => item.topic !== undefined || item.hookText !== undefined || item.caption !== undefined);
  const describedIds = new Set(described.map((item) => item.id));
  const skipped = ids.filter((id) => !describedIds.has(id));
  if (described.length < MIN_ITEMS_TO_CLUSTER) return { clusters: [], unclustered: ids, problems: [], promptVersion: PROMPT_VERSION };

  const { value, meta, reviewFeedback } = await backend.runJson({
    task: "llm_topic_cluster",
    system: systemPrompt(maxClusters),
    input: dataBlock("items", described),
    schema: CLUSTER_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => {
      const problems = clusterProblems(output, describedIds);
      return problems.length > 0 ? `${problems.join("\n")}\nYalnız girdideki id'leri kullan; her id en çok bir kümede olsun; küme anahtarları tekil olsun.` : undefined;
    },
    reviewFailure: "accept",
  });

  const clusters = repairClusters(value, describedIds);
  const clustered = new Set(clusters.flatMap((cluster) => cluster.contentIds));
  const problems = reviewFeedback === undefined ? [] : clusterProblems(value, describedIds);
  return {
    clusters,
    unclustered: [...skipped, ...described.map((item) => item.id).filter((id) => !clustered.has(id))],
    problems,
    promptVersion: PROMPT_VERSION,
    meta,
  };
}
