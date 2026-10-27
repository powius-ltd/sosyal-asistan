/**
 * Profil aşaması: platform başına TEK koşu (tüm hedefler) → parse → hesap başına erişim durumu → `account_snapshots` +
 * sahip güncellemesi → koşu `ingested`. Gizli/bulunamayan RAKİP `private`/`not_found` olur (sonraki içerik koşusu
 * onun için başlatılmaz); kendi hesapta erişim hatası DB'yi değiştirmez, raporlanır.
 */
import "server-only";

import { ownerKey } from "@/lib/collection/content-rows";
import { ingestProfiles, markCompetitorAccess, type ProfileEntry } from "@/lib/collection/ingest-profile";
import { resolveProfileAccess } from "@/lib/collection/profile-rows";
import { executeScrape, finishIngested, noteRunError } from "@/lib/collection/run-scrape";
import type { CollectContext, PlannedJob, TargetReport } from "@/lib/collection/types";
import { getPlatformModule } from "@/lib/platforms/registry";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

export async function collectProfiles(
  ctx: CollectContext,
  jobs: readonly PlannedJob[],
  reports: Map<string, TargetReport>,
): Promise<void> {
  for (const job of jobs) {
    const reasonForAll = (reason: string) => {
      for (const target of job.targets) {
        const report = reports.get(ownerKey(target.owner));
        if (report) report.profile = { state: "error", reason };
      }
    };
    if (ctx.stop) {
      reasonForAll(`atlandı (${ctx.stop})`);
      continue;
    }

    ctx.log(`Profil koşusu: ${job.label}`);
    const result = await executeScrape(ctx, job);
    if (!result.ok) {
      if (result.stop) ctx.stop = result.stop;
      ctx.notes.push(`Profil koşusu başarısız: ${result.reason}`);
      reasonForAll(result.reason);
      continue;
    }

    try {
      const adapter = getPlatformModule(job.targets[0].platform).publicData;
      const parsed = adapter.parseProfiles(result.items);
      const entries: ProfileEntry[] = [];
      for (const target of job.targets) {
        const { profile, access } = resolveProfileAccess(target.handle, parsed, job.targets.length);
        const report = reports.get(ownerKey(target.owner));
        if (report) report.profile = { state: access.state, reason: access.reason, followers: profile?.followers };
        if (profile) {
          entries.push({ owner: target.owner, profile });
          if (profile.followers !== undefined) ctx.followers.set(ownerKey(target.owner), profile.followers);
        }
        if (target.owner.kind === "competitor" && (access.state === "private" || access.state === "not_found")) {
          const changed = await markCompetitorAccess(
            { workspaceId: ctx.workspaceId, competitorId: target.owner.id, state: access.state, reason: access.reason },
            { client: ctx.deps.client },
          );
          if (changed && report) report.statusChanged = access.state;
        }
      }
      await ingestProfiles(
        { workspaceId: ctx.workspaceId, collectionRunId: result.runId, entries, now: ctx.now },
        { client: ctx.deps.client },
      );
      await finishIngested(ctx, result.runId, { itemCount: parsed.items.length, notItems: parsed.notItems });
    } catch (error) {
      const message = `Profil verisi işlenemedi: ${messageOf(error)}`;
      ctx.notes.push(message);
      await noteRunError(ctx, result.runId, message).catch(() => undefined);
    }
  }
}
