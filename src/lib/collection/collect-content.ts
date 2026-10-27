/**
 * İçerik (reel) aşaması: her hedef için bir koşu → parse → ingest (`content_items` + `metric_snapshots`) → koşu
 * `ingested`. Bir hedef başarısız olursa diğerleri sürer; yalnız tavan/yapılandırma hatası (`ctx.stop`) kalanları durdurur.
 * Profil aşamasında erişilemez çıkan hedef için koşu HİÇ başlatılmaz (boşa para harcanmaz).
 */
import "server-only";

import { ownerKey } from "@/lib/collection/content-rows";
import { ingestContent } from "@/lib/collection/ingest-content";
import { markCompetitorAccess } from "@/lib/collection/ingest-profile";
import { classifyAccessReason } from "@/lib/collection/profile-rows";
import { executeScrape, finishIngested, noteRunError } from "@/lib/collection/run-scrape";
import type { CollectContext, PlannedJob, TargetReport } from "@/lib/collection/types";
import { getPlatformModule } from "@/lib/platforms/registry";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

const EMPTY = { parsed: 0, ingested: 0, snapshots: 0, notItems: 0, skipped: 0 };

export async function collectContent(
  ctx: CollectContext,
  jobs: readonly PlannedJob[],
  reports: Map<string, TargetReport>,
): Promise<void> {
  for (const job of jobs) {
    const target = job.targets[0];
    const report = reports.get(ownerKey(target.owner));
    if (!report) continue;

    const profileState = report.profile?.state;
    if (ctx.stop) {
      report.content = { ...EMPTY, skippedReason: `atlandı (${ctx.stop})` };
      continue;
    }
    if (profileState === "private" || profileState === "not_found") {
      report.content = { ...EMPTY, skippedReason: `hesap erişilemez (${profileState}); içerik koşusu başlatılmadı` };
      continue;
    }

    ctx.log(`İçerik koşusu: ${job.label}`);
    const result = await executeScrape(ctx, job);
    if (!result.ok) {
      if (result.stop) ctx.stop = result.stop;
      ctx.notes.push(`${job.label} içerik koşusu başarısız: ${result.reason}`);
      report.content = { ...EMPTY, error: result.reason };
      continue;
    }

    try {
      const parsed = getPlatformModule(target.platform).publicData.parseContent(result.items);
      // Başka profilin içeriği (ör. ortak yazarlı gönderi) bu hesaba yazılmaz.
      const own = parsed.items.filter(
        (item) => !item.ownerHandle || item.ownerHandle.toLowerCase() === target.handle.toLowerCase(),
      );
      const ingest = await ingestContent(
        {
          workspaceId: ctx.workspaceId,
          owner: target.owner,
          items: own,
          collectionRunId: result.runId,
          ownerFollowers: ctx.followers.get(ownerKey(target.owner)),
          now: ctx.now,
        },
        { client: ctx.deps.client },
      );
      report.content = {
        parsed: own.length,
        ingested: ingest.contentItems,
        snapshots: ingest.snapshots,
        notItems: parsed.notItems.length,
        skipped: parsed.items.length - own.length + ingest.skippedOtherOwner,
        accessError: parsed.accessError,
      };
      // İçerik koşusunda yalnız gizlilik hesap durumunu değiştirir ("içerik yok" hesabın olmadığı anlamına gelmez).
      if (
        target.owner.kind === "competitor" &&
        parsed.accessError !== undefined &&
        classifyAccessReason(parsed.accessError) === "private"
      ) {
        const changed = await markCompetitorAccess(
          { workspaceId: ctx.workspaceId, competitorId: target.owner.id, state: "private", reason: parsed.accessError },
          { client: ctx.deps.client },
        );
        if (changed) report.statusChanged = "private";
      }
      await finishIngested(ctx, result.runId, { itemCount: own.length, notItems: parsed.notItems });
    } catch (error) {
      const message = `İçerik verisi işlenemedi: ${messageOf(error)}`;
      ctx.notes.push(`${job.label}: ${message}`);
      report.content = { ...EMPTY, error: message };
      await noteRunError(ctx, result.runId, message).catch(() => undefined);
    }
  }
}
