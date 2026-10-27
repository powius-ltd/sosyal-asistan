/**
 * Rapor yazımı (adım 7): `docs/rutin/<slug>/<tarih>.md` (gitignore'da; çalışma alanı başına klasör) + `system` bildirimi (`dedupe_key: routine:<hafta>`; aynı hafta ikinci
 * rutin için bildirim yinelenmez). İki yazım birbirinden bağımsızdır: biri düşerse diğeri yine denenir, hata satır olarak döner.
 */
import "server-only";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { toDayKey } from "@/lib/format";
import { audienceZone } from "@/lib/insights";
import type { IntelContext } from "@/lib/intel/context";
import { renderRoutineMarkdown, routineNotification } from "@/lib/orchestrator/report";
import { routineWeeks } from "@/lib/orchestrator/state";
import type { RoutineReport } from "@/lib/orchestrator/types";
import { workspaceDocDir } from "@/lib/workspace/doc-dir";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "bilinmeyen hata");

/** Aynı gün ikinci rapor öncekinin üstüne yazılmaz: `<tarih>.md`, doluysa `<tarih>-<n>.md`. */
function reportPath(dir: string, dayKey: string): string {
  let file = join(dir, `${dayKey}.md`);
  for (let i = 2; existsSync(file); i++) file = join(dir, `${dayKey}-${i}.md`);
  return file;
}

export async function writeRoutineReport(ctx: IntelContext, report: RoutineReport, rootDir: string = process.cwd()): Promise<string[]> {
  const lines: string[] = [];

  try {
    const dir = workspaceDocDir(rootDir, "rutin", { id: ctx.workspaceId, slug: ctx.workspaceSlug });
    mkdirSync(dir, { recursive: true });
    const file = reportPath(dir, toDayKey(ctx.now, audienceZone(ctx.workspace)) as string);
    writeFileSync(file, renderRoutineMarkdown(report), "utf8");
    lines.push(`Rapor: ${file}`);
  } catch (error) {
    lines.push(`Uyarı: rapor dosyası yazılamadı: ${errorMessage(error)}`);
  }

  try {
    const draft = routineNotification(report, routineWeeks(ctx).currentWeek);
    const { error } = await ctx.client
      .from("notifications")
      .insert({ workspace_id: ctx.workspaceId, kind: "system", title: draft.title, body: draft.body, dedupe_key: draft.dedupeKey });
    if (!error) lines.push(`Bildirim yazıldı (${draft.dedupeKey}).`);
    else if (error.code === "23505") lines.push(`Bildirim bu hafta için zaten var (${draft.dedupeKey}): yinelenmedi.`);
    else lines.push(`Uyarı: bildirim yazılamadı: ${error.message}`);
  } catch (error) {
    lines.push(`Uyarı: bildirim yazılamadı: ${errorMessage(error)}`);
  }
  return lines;
}
