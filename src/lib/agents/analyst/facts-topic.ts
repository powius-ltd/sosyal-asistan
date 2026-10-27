/**
 * Konu × hook matrisi hücresinin olgusu (`creator`/`mixed` hesap): `topic:<küme>:<hook>` ref'i, sayılar belirteçle (kod yerleştirir),
 * durum Türkçe sözcükle. Saf (veri okumaz). Ölçülemeyen alan gövdeye GİRMEZ, belirteci `unmeasured`'a sebebiyle yazılır (0 değil). Küme adı
 * LLM kümelemesinden gelir: kısaltılır ve veri sayılır (talimat değil).
 */
import { targetedAction, roundForPack, weakestConfidence } from "@/lib/agents/analyst/facts-entries";
import type { FactEntry } from "@/lib/agents/analyst/facts-types";
import type { TokenTable } from "@/lib/agents/analyst/tokens";
import { contentRef, topicRef } from "@/lib/domain/briefing-refs";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { type TopicHookCell } from "@/lib/domain/topic-hook-matrix";
import { clipForPrompt } from "@/lib/llm/prompt-blocks";
import { TOPIC_STATUS_LONG } from "@/lib/matrix/plain";

const TOPIC_LABEL_CHARS = 60;

/** `exampleIds`: hücrenin gösterilecek örnek videoları (içerik olgusu olarak ayrıca eklenir). `label` = konu kümesinin Türkçe adı. */
export function topicCellEntry(cell: TopicHookCell, label: string, tokens: TokenTable, rank: number, exampleIds: readonly string[]): FactEntry {
  const ref = topicRef(cell.clusterKey, cell.hookType);
  const { own, rivals } = cell;
  tokens.addRef("on", ref, "int", own.n);
  tokens.addRef("rn", ref, "int", rivals.n);
  tokens.addRef("olift", ref, "lift", own.medianLift, own.n === 0 ? "bu hücrede kendi videosu yok" : "kendi videolarının hiçbirinin lift'i ölçülemedi");
  tokens.addRef("rlift", ref, "lift", rivals.medianLift, rivals.n === 0 ? "bu hücrede rakip videosu yok" : "rakip videolarının hiçbirinin lift'i ölçülemedi");
  tokens.addRef("oout", ref, "int", own.liftN > 0 ? own.outlierCount : undefined, "tutan sayısı ölçülemedi (kendi videolarının lift'i yok)");
  tokens.addRef("rout", ref, "int", rivals.liftN > 0 ? rivals.outlierCount : undefined, "tutan sayısı ölçülemedi (rakip videolarının lift'i yok)");
  const sides = [own, rivals].filter((side) => side.n > 0);
  return {
    section: "cells",
    rank,
    ref,
    confidence: weakestConfidence(sides.map((side) => side.confidence)),
    json: {
      ref,
      topic: clipForPrompt(label, TOPIC_LABEL_CHARS) ?? cell.clusterKey,
      hook: hookTypeLabel(cell.hookType),
      status: TOPIC_STATUS_LONG[cell.status],
      on: own.n,
      rn: rivals.n,
      ...(own.medianLift === undefined ? {} : { olift: roundForPack(own.medianLift) }),
      ...(rivals.medianLift === undefined ? {} : { rlift: roundForPack(rivals.medianLift) }),
      ...(own.liftN > 0 ? { oout: own.outlierCount } : {}),
      ...(rivals.liftN > 0 ? { rout: rivals.outlierCount } : {}),
      ...(exampleIds.length === 0 ? {} : { examples: exampleIds.map(contentRef) }),
    },
    actions: [targetedAction("open_matrix", ref)],
  };
}
