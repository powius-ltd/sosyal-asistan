/** Halka durumunun insan okuyabilir dökümü (terminal). */
import type { CycleState, CycleStatus } from "@/lib/cycle/types";

const MARK: Record<CycleStatus, string> = { done: "✓ tamam", due: "→ sırada", needs_approval: "$ onay ister", blocked: "✗ engelli", not_built: "· kodu yok" };

export function formatCycleState(state: CycleState): string[] {
  const rows = state.steps.map((step) => `  ${step.id.padEnd(8)} ${MARK[step.status].padEnd(12)} ${step.reason}${step.jobKind === undefined || step.status === "done" ? "" : ` [iş: ${step.jobKind}]`}`);
  return [...rows, state.next === undefined ? "Sıradaki adım: yok (halka bu tur için tamam)." : `Sıradaki adım: ${state.next}.`];
}
