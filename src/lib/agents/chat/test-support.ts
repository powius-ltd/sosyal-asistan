/** Sohbet testleri için ortak kurulum (yalnız testler import eder): mock depodan gerçek olgu paketi + model çıktısı kısayolları. */
import { collectFacts, type FactsContext } from "@/lib/agents/analyst/facts";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

/** Mock paketinde kendi en iyi videosu: lift/izlenme belirteçleri ölçülmüş, kanıt olarak geçerli. */
export const OWN_REF = "c:ci_048";

export const factsContext = (): FactsContext => ({ repo: createMockRepository(), workspaceId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) });

let cached: Promise<BriefingFacts> | undefined;
/** Mock çalışma alanının olgu paketi (bir kez kurulur; testler paketi DEĞİŞTİRMEZ). */
export const mockFacts = (): Promise<BriefingFacts> => (cached ??= collectFacts(factsContext()));

/** Geçerli bir `answer` çıktısı: kanıtlı, belirteçli. */
export function goodOutput(patch: Partial<ChatOutput> = {}): ChatOutput {
  return { kind: "answer", text: `En güçlü videon normalinin {lift:${OWN_REF}} izlendi. Böyle {g:own_best_count} videon var.`, evidence: [OWN_REF], ...patch };
}

/** `<facts>` bloğundaki paketi stdin metninden okur (modelin gördüğü). */
export function factsInInput(stdin: string): { contents: { ref: string; side?: string }[]; commands?: unknown } {
  const start = stdin.indexOf("<facts>\n") + "<facts>\n".length;
  return JSON.parse(stdin.slice(start, stdin.indexOf("\n</facts>", start)));
}
