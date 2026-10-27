/**
 * Mock üreteci: 15 fikir kartı (her durumdan). Her fikir ≥2 gerçek rakip içeriğine kanıt olarak
 * bağlanır (aynı konu öncelikli, yüksek lift'e göre); `liftAtCreation` fikrin üretildiği andaki
 * lift'tir (o zamandan beri izlenme arttığı için bugünkünden biraz düşük).
 */
import type { ContentItem } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import type { ContentAnalysis, Idea, IdeaEvidence, IdeaStatus } from "@/lib/domain/intel";
import { liftTimes } from "@/lib/plain-language";
import { OPENING_PLAIN } from "@/lib/plain-language-plan";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import { IDEA_TEMPLATES } from "@/lib/data/mock/catalog/ideas";
import { topicByKey } from "@/lib/data/mock/catalog/topics";
import type { ContentMeta } from "@/lib/data/mock/generators/content";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import type { Rng } from "@/lib/data/mock/prng";

/** Şablon sırasıyla eşleşen durumlar: 4 new, 3 saved, 2 scripted, 2 scheduled, 2 published, 2 dismissed. */
export const IDEA_STATUS_PLAN: readonly IdeaStatus[] = [
  "new", "new", "new", "new", "saved", "saved", "saved", "scripted", "scripted",
  "scheduled", "scheduled", "published", "published", "dismissed", "dismissed",
];

const CREATED_AGE: Record<IdeaStatus, [number, number]> = {
  new: [0.3, 4],
  saved: [4, 12],
  scripted: [6, 14],
  scheduled: [8, 18],
  published: [18, 40],
  dismissed: [5, 30],
};

const RANK: Record<IdeaStatus, [number, number]> = {
  new: [0.6, 0.94],
  saved: [0.5, 0.85],
  scripted: [0.55, 0.88],
  scheduled: [0.6, 0.9],
  published: [0.45, 0.8],
  dismissed: [0.2, 0.45],
};

const round2 = (v: number) => Math.round(v * 100) / 100;

function pickEvidence(
  rng: Rng,
  pool: ContentItem[],
  meta: Map<string, ContentMeta>,
  topicKey: string,
  createdMs: number,
  usage: Map<string, number>,
): ContentItem[] {
  const eligible = pool.filter((c) => c.publishedAt && new Date(c.publishedAt).getTime() < createdMs - DAY_MS);
  const rankOf = (c: ContentItem) =>
    (meta.get(c.id)?.topicKey === topicKey ? 100 : 0) + (c.score.lift ?? 0) - 2 * (usage.get(c.id) ?? 0);
  const chosen = [...eligible].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, rng.int(2, 3));
  chosen.forEach((c) => usage.set(c.id, (usage.get(c.id) ?? 0) + 1));
  return chosen;
}

export function buildIdeas(
  rng: Rng,
  clock: MockClock,
  items: ContentItem[],
  meta: Map<string, ContentMeta>,
  analyses: ContentAnalysis[],
): Idea[] {
  const analysisByItem = new Map(analyses.map((a) => [a.contentItemId, a]));
  const pool = items.filter(
    (c) => c.owner.kind === "competitor" && c.format === "short_video" && (c.score.lift ?? 0) >= 1.5,
  );
  const usage = new Map<string, number>();

  return IDEA_TEMPLATES.map((template, i) => {
    const status = IDEA_STATUS_PLAN[i];
    const [minAge, maxAge] = CREATED_AGE[status];
    const createdAge = rng.float(minAge, maxAge);
    const createdMs = clock.nowMs - createdAge * DAY_MS;
    const updatedMs = status === "new" ? createdMs : createdMs + rng.float(0.2, 0.8) * createdAge * DAY_MS;
    const topic = topicByKey(template.topicKey);

    const chosen = pickEvidence(rng, pool, meta, template.topicKey, createdMs, usage);
    const evidence: IdeaEvidence[] = chosen.map((c) => {
      // Kanıt içeriğin özeti (fikir listesi kanıt başına içerik okumasın): güncel içerikten türetilir.
      return {
        ...summarizeContent(c, analysisByItem.get(c.id)),
        liftAtCreation: round2((c.score.lift ?? 0) * rng.float(0.82, 1)),
      };
    });
    const proof = chosen.map((c, k) => `@${c.owner.handle} (${liftTimes(evidence[k].liftAtCreation) ?? "ölçülemedi"})`).join(", ");
    const leadHook = meta.get(chosen[0]?.id ?? "")?.hook.type;
    const ownTries = items.filter((c) => c.owner.kind === "own" && meta.get(c.id)?.topicKey === template.topicKey).length;
    const strong = evidence.some((e) => e.liftAtCreation !== undefined && e.liftAtCreation >= 3);
    const rationale =
      `Örnekler: ${proof}. "${topic.label}" konusu bu hesaplarda normalinin ` +
      (strong ? "belirgin üstünde izlendi" : "üstünde kaldı") +
      (leadHook ? `; ${OPENING_PLAIN.leadsWith(leadHook)}.` : ".") +
      (ownTries > 0 ? ` Kendi hesabında bu konu ${ownTries} kez denendi.` : " Kendi hesabında bu konu henüz denenmedi.");
    const [minRank, maxRank] = RANK[status];

    return {
      id: `id_${String(i + 1).padStart(2, "0")}`,
      workspaceId: WS,
      status,
      title: template.title,
      rationale,
      platform: "instagram",
      format: template.format ?? "short_video",
      source: "generated",
      hooks: [...template.hooks],
      hookType: leadHook,
      scriptOutline: [...template.outline],
      // Senaryosu yazılmış (scripted ve sonrası) fikirlerde tam konuşma metni ve açıklama taslağı da vardır.
      details:
        status === "new" || status === "saved" || status === "dismissed"
          ? { topic: topic.label }
          : {
              topic: topic.label,
              script: template.outline.join(" "),
              scriptLanguage: "tr",
              captionDraft: `${template.title}\n\n${template.hooks[0]}`,
              targetDurationSec: 45,
              durationBucket: "30_60",
            },
      rankScore: round2(rng.float(minRank, maxRank)),
      evidence,
      createdAt: new Date(createdMs).toISOString(),
      updatedAt: new Date(Math.min(updatedMs, clock.nowMs)).toISOString(),
    };
  });
}
