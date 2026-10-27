/**
 * Mock depo: hook kütüphanesi. Giriş ayrı saklanmaz; her okumada analizlerden türetilir (Supabase: `content_analyses` ⨝
 * `content_items` görünümü). Kapsam kuralı `lib/domain/hook-library.ts`'tedir.
 */
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { HookLibraryEntry, HookTypeStat } from "@/lib/domain/hook-library";
import { median } from "@/lib/metrics/stats";
import type { HookLibraryFilter } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { compareDescending, fold, paginate } from "@/lib/data/mock/mock-filters";
import type { MockContext } from "@/lib/data/mock/repos/context";

export type HookLibraryMethods = Pick<PanelRepository, "listHookLibrary" | "hookTypeStats">;

const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : undefined);

export function createHookLibraryMethods(ctx: MockContext): HookLibraryMethods {
  const { state, inWs, out } = ctx;

  function entries(): HookLibraryEntry[] {
    const items = new Map(state.content.map((c) => [c.id, c]));
    const trackedIds = new Set(state.competitors.filter((c) => c.status === "tracked").map((c) => c.id));
    const language = new Map(state.transcripts.map((t) => [t.contentItemId, t.language]));
    const list: HookLibraryEntry[] = [];
    for (const a of state.analyses) {
      if (a.status !== "ok" || !a.evidenceVerified || !a.hookText || !a.hookType) continue;
      const item = items.get(a.contentItemId);
      if (!item) continue;
      const isOwn = item.owner.kind === "own";
      if (!isOwn && !trackedIds.has(item.owner.id)) continue;
      list.push({
        contentId: item.id,
        hookText: a.hookText,
        hookSource: a.hookSource,
        hookType: a.hookType,
        hookTypeEvidence: a.hookTypeEvidence,
        ownerHandle: item.owner.handle,
        platform: item.platform,
        isOwn,
        lift: item.score.lift,
        liftTier: item.score.liftTier,
        language: language.get(item.id),
        publishedAt: item.publishedAt,
      });
    }
    return list;
  }

  return {
    async listHookLibrary(wsId, filter: HookLibraryFilter = {}) {
      if (!inWs(wsId)) return { items: [], total: 0 };
      const q = filter.q?.trim() ? fold(filter.q.trim()) : undefined;
      const matched = entries().filter((e) => {
        if (filter.hookType !== undefined && e.hookType !== filter.hookType) return false;
        if (filter.minTier !== undefined && (e.liftTier === undefined || e.liftTier < filter.minTier)) return false;
        if (filter.own !== undefined && e.isOwn !== filter.own) return false;
        return !q || fold(`${e.hookText} ${e.ownerHandle} ${hookTypeLabel(e.hookType)}`).includes(q);
      });
      matched.sort((a, b) =>
        (filter.sort ?? "lift") === "recent"
          ? compareDescending(time(a.publishedAt), time(b.publishedAt)) || a.contentId.localeCompare(b.contentId)
          : compareDescending(a.lift, b.lift) || compareDescending(time(a.publishedAt), time(b.publishedAt)) || a.contentId.localeCompare(b.contentId),
      );
      return out(paginate(matched, filter.limit, filter.cursor));
    },

    async hookTypeStats(wsId) {
      if (!inWs(wsId)) return [];
      const byType = new Map<string, HookLibraryEntry[]>();
      for (const e of entries()) byType.set(e.hookType, [...(byType.get(e.hookType) ?? []), e]);
      const stats: HookTypeStat[] = [...byType].map(([hookType, group]) => ({
        hookType,
        count: group.length,
        medianLift: median(group.flatMap((e) => (e.lift === undefined ? [] : [e.lift]))),
      }));
      return stats.sort((a, b) => compareDescending(a.medianLift, b.medianLift) || b.count - a.count || a.hookType.localeCompare(b.hookType));
    },
  };
}
