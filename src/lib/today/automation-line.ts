/**
 * Bugün'ün "Otomatik" satırının metni: otomatik işlerin satır modeli (`buildAutomationRows`) + kısa özeti (`summarizeAutomation`).
 * Çalışma alanı ya da iş listesi okunamadıysa `undefined`: ekran yalnız "Otomatik işler" bağlantısını çizer.
 */
import { AUTOMATION_PRODUCE_READY } from "@/lib/automation/flags";
import { buildAutomationRows } from "@/lib/automation/model";
import { summarizeAutomation } from "@/lib/automation/summary";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { Workspace } from "@/lib/domain/run";

export function automationLine(workspace: Workspace | null | undefined, jobs: readonly PanelJob[] | undefined, now: Date): string | undefined {
  if (!workspace || jobs === undefined) return undefined;
  const rows = buildAutomationRows({ workspace, jobs, now, produceReady: AUTOMATION_PRODUCE_READY });
  return summarizeAutomation(rows, workspace.timezone) || undefined;
}
