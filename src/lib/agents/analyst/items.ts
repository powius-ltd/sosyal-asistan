/**
 * Doğrulanmış Analist çıktısını SON brifing maddelerine çevirir (saf): belirteçler yerleştirilir (`replaceTokens`), güven ajanın değil
 * kodun işidir (kanıt ref'lerinin ve kullanılan sayıların güvenlerinin EN ZAYIFI), eylem paketten gelir (ajan yalnız kimlik seçer). `verifyAnalystOutput`
 * sorunsuz demeden çağrılmamalıdır (bilinmeyen/ölçülemeyen belirteçte `replaceTokens` fırlatır).
 */
import { weakestConfidence } from "@/lib/agents/analyst/facts-entries";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import type { AnalystOutput } from "@/lib/agents/analyst/schema";
import { findTokens, replaceTokens } from "@/lib/agents/analyst/tokens";
import type { BriefingEvidenceRef, BriefingItem } from "@/lib/domain/briefing";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

/** Güven: kanıt ref'lerinin güvenleri + metinde kullanılan sayıların örnek güveni (`TokenEntry.confidence`) içinden en zayıfı. */
export function itemConfidence(evidence: readonly BriefingEvidenceRef[], text: string, facts: BriefingFacts): ConfidenceLevel {
  const levels: ConfidenceLevel[] = evidence.map((ref) => facts.refs.get(ref) ?? "low");
  for (const token of findTokens(text)) {
    const level = facts.tokens.get(token.key)?.confidence;
    if (level !== undefined) levels.push(level);
  }
  return weakestConfidence(levels);
}

export function buildBriefingItems(output: AnalystOutput, facts: BriefingFacts): BriefingItem[] {
  return output.items.map((item) => {
    const evidence = [...new Set(item.evidence)] as BriefingEvidenceRef[];
    const action = item.actionId === undefined ? undefined : facts.actions.get(item.actionId);
    return {
      kind: item.kind,
      headline: replaceTokens(item.headline, facts.tokens),
      body: replaceTokens(item.body, facts.tokens),
      evidence,
      ...(action === undefined ? {} : { action: { ...action } }),
      confidence: itemConfidence(evidence, `${item.headline} ${item.body}`, facts),
    };
  });
}
