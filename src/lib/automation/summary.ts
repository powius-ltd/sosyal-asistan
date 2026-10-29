/**
 * Bugün ekranının tek satırlık özeti (SAF): "Plan Paz 18:00 · ölçüm her gün". Yalnız AÇIK ve çalışabilen işler yazılır (paylaşım hep açık
 * olduğundan özete girmez; "yakında" satırı yazılmaz). Plan zamanı bilinmiyorsa uydurulmaz: "sıradaki turda".
 */
import { AUTOMATION_COPY as COPY } from "@/lib/copy/automation";
import type { AutomationRow } from "@/lib/automation/model";
import { DEFAULT_TIMEZONE, formatWeekdayTime } from "@/lib/format";

export function summarizeAutomation(rows: readonly AutomationRow[], timeZone: string = DEFAULT_TIMEZONE): string {
  const parts: string[] = [];
  for (const row of rows) {
    if (row.mode !== "toggle" || !row.enabled) continue;
    if (row.id === "weekly_plan") parts.push(`${COPY.summary.plan} ${(row.nextAt === undefined ? undefined : formatWeekdayTime(row.nextAt, timeZone)) ?? COPY.summary.planNext}`);
    else if (row.id === "daily_measure") parts.push(COPY.summary.measure);
    else if (row.id === "produce") parts.push(COPY.summary.produce);
  }
  return parts.length === 0 ? COPY.summary.allOff : parts.join(" · ");
}
