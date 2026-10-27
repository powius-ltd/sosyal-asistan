/**
 * Olgu paketini toplar ve boyutunu sınırlar (saf): olgular önem sırasına göre tutulur; JSON `FACTS_MAX_BYTES`'ı aşarsa en az önemli
 * (en büyük `rank`) olgu atılır ve bölüm başına atılan adet `omitted`'a yazılır. Atılan olgunun ref'i, eylemi ve belirteçleri geçersiz
 * olur (ajan bilmediği şeye atıf yapamaz; atıf yaparsa `verify` reddeder).
 */
import { FACTS_MAX_BYTES, type AccountFacts, type ActionOption, type BriefingFacts, type FactEntry, type FactSection, type FactsPack } from "@/lib/agents/analyst/facts-types";
import type { TokenTable } from "@/lib/agents/analyst/tokens";
import type { AccountType } from "@/lib/domain/account-type";
import type { BriefingAction, BriefingBasis, BriefingEvidenceRef } from "@/lib/domain/briefing";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

export interface PackInput {
  weekday: string;
  accountType: AccountType;
  account: AccountFacts;
  numbers: Record<string, number>;
  niche?: string;
  entries: readonly FactEntry[];
  /** Genel komut eylemleri (olguya bağlı değil). */
  commands: readonly ActionOption[];
  tokens: TokenTable;
  basis: BriefingBasis;
  maxBytes?: number;
}

const byteLength = (text: string) => Buffer.byteLength(text, "utf8");

/** Aynı bölümde aynı ref iki kez girmez (en önemli olan kalır). */
function dedupe(entries: readonly FactEntry[]): FactEntry[] {
  const best = new Map<string, FactEntry>();
  for (const entry of entries) {
    const key = `${entry.section}|${entry.ref}`;
    const current = best.get(key);
    if (current === undefined || entry.rank < current.rank) best.set(key, entry);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
}

function buildPack(kept: readonly FactEntry[], input: PackInput, omitted: Partial<Record<FactSection, number>>): FactsPack {
  const keptRefs = new Set<string>(kept.map((entry) => entry.ref));
  input.tokens.dropSubjects((subject) => keptRefs.has(subject));
  const section = (name: FactSection) =>
    kept
      .filter((entry) => entry.section === name)
      .map((entry) => (Array.isArray(entry.json.examples) ? { ...entry.json, examples: (entry.json.examples as string[]).filter((ref) => keptRefs.has(ref)) } : entry.json));

  const hasOmitted = Object.keys(omitted).length > 0;
  return {
    weekday: input.weekday,
    account: input.account,
    numbers: input.numbers,
    contents: section("contents"),
    cells: section("cells"),
    plans: section("plans"),
    due: section("due"),
    links: section("links"),
    ...(input.niche === undefined ? {} : { niche: input.niche }),
    commands: input.commands.map(({ id, action }) => ({ id, label: action.label, spendsMoney: action.spendsMoney })),
    unmeasured: input.tokens.unmeasured(),
    ...(hasOmitted ? { omitted } : {}),
  };
}

export function assembleFacts(input: PackInput): BriefingFacts {
  const maxBytes = input.maxBytes ?? FACTS_MAX_BYTES;
  const kept = dedupe(input.entries);
  const omitted: Partial<Record<FactSection, number>> = {};

  let pack = buildPack(kept, input, omitted);
  let json = JSON.stringify(pack);
  while (byteLength(json) > maxBytes && kept.length > 0) {
    const dropped = kept.pop() as FactEntry; // en büyük rank
    omitted[dropped.section] = (omitted[dropped.section] ?? 0) + 1;
    pack = buildPack(kept, input, omitted);
    json = JSON.stringify(pack);
  }

  const refs = new Map<BriefingEvidenceRef, ConfidenceLevel>(kept.map((entry) => [entry.ref, entry.confidence]));
  const actions = new Map<string, BriefingAction>();
  for (const option of [...kept.flatMap((entry) => entry.actions), ...input.commands]) actions.set(option.id, option.action);
  return { accountType: input.accountType, pack, json, bytes: byteLength(json), refs, actions, tokens: input.tokens, basis: input.basis, omitted };
}
