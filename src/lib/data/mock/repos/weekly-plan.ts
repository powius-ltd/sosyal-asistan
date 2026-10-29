/**
 * Mock depo: haftalık plan, ses profili ve içgörüler (Faz 2). Plan öğeleri okuma anında `state.ideas`'tan kurulur (fikir
 * durumu değişince plana yansır; Supabase'de fikirler `ideas` tablosundan okunur). İçgörü hesabı Supabase ile AYNI
 * fonksiyondur (`views/insights`). Plan yalnız sunucu tarafından üretilir: depo yazma metodu yoktur.
 */
import { RepositoryError } from "@/lib/data/repository";
import { DEFAULT_PAGE_LIMIT } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { parseWeekStart } from "@/lib/data/weekly-plan-input";
import { buildInsights } from "@/lib/data/views/insights";
import type { Idea } from "@/lib/domain/intel";
import type { WeeklyPlan, WeeklyPlanItem, WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import type { StoredWeeklyPlan } from "@/lib/data/mock/generators/weekly-plan";
import type { MockContext } from "@/lib/data/mock/repos/context";

export type WeeklyPlanMethods = Pick<PanelRepository, "getWeeklyPlan" | "approveWeeklyPlan" | "listWeeklyPlans" | "getVoiceProfile" | "getInsights">;

function toPlan(stored: StoredWeeklyPlan, ideas: readonly Idea[]): WeeklyPlan {
  const { itemRefs, ...plan } = stored;
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  const all = itemRefs.flatMap((ref): WeeklyPlanItem[] => {
    const idea = byId.get(ref.ideaId);
    return idea ? [{ ideaId: ref.ideaId, position: ref.position, slotAt: ref.slotAt, slotNote: ref.slotNote, idea }] : [];
  });
  return {
    ...plan,
    items: all.filter((i) => i.position !== undefined).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    alternatives: all.filter((i) => i.position === undefined).sort((a, b) => b.idea.rankScore - a.idea.rankScore || (a.ideaId < b.ideaId ? -1 : 1)),
  };
}

export function createWeeklyPlanMethods(ctx: MockContext): WeeklyPlanMethods {
  const { state, clock, ws, inWs, requireWs, findOrThrow, out } = ctx;

  return {
    async getWeeklyPlan(wsId, weekStart) {
      const week = parseWeekStart(weekStart);
      if (!inWs(wsId)) return null;
      const stored = state.weeklyPlans.find((p) => p.weekStart === week);
      return stored ? out(toPlan(stored, state.ideas)) : null;
    },

    async approveWeeklyPlan(wsId, weekStart, now) {
      const week = parseWeekStart(weekStart);
      requireWs(wsId);
      const stored = state.weeklyPlans.find((p) => p.weekStart === week);
      if (!stored) throw new RepositoryError("not_found", `Bu hafta için plan yok: ${week}`);
      if (stored.status !== "ready") throw new RepositoryError("invalid_state", "Plan hazır değil; onaylanamaz.");
      if (stored.approvedAt === undefined) {
        // Tek işlem: plana giren (sırası olan) yeni fikirler seçilir; bırakılmış / ilerlemiş fikirlere dokunulmaz.
        const inPlan = new Set(stored.itemRefs.filter((r) => r.position !== undefined).map((r) => r.ideaId));
        for (const idea of state.ideas) {
          if (inPlan.has(idea.id) && idea.status === "new") {
            idea.status = "saved";
            idea.updatedAt = clock.tick();
          }
        }
        stored.approvedAt = now.toISOString();
      }
      return out(toPlan(stored, state.ideas));
    },

    async listWeeklyPlans(wsId, query = {}) {
      if (!inWs(wsId)) return [];
      const limit = Math.min(Math.max(Math.floor(query.limit ?? DEFAULT_PAGE_LIMIT), 1), 200);
      const summaries: WeeklyPlanSummary[] = [...state.weeklyPlans]
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          weekStart: p.weekStart,
          status: p.status,
          confidence: p.confidence,
          summary: p.summary,
          plannedCount: p.itemRefs.filter((r) => r.position !== undefined).length,
          alternativeCount: p.itemRefs.filter((r) => r.position === undefined).length,
          generatedAt: p.generatedAt,
        }));
      return out(summaries);
    },

    async getVoiceProfile(wsId, accountId) {
      if (!inWs(wsId)) return null;
      const profile = state.voiceProfiles.find((p) => p.accountId === accountId);
      return profile ? out(profile) : null;
    },

    async getInsights(wsId, query = {}) {
      requireWs(wsId);
      if (query.accountId !== undefined) findOrThrow(state.ownAccounts, query.accountId, "Hesap");
      // Supabase ile AYNI girdi kümesi: analizler (hook türü grupları) ve konu eleğinin niş dışı bulduğu içerikler.
      return out(
        buildInsights(
          {
            workspace: ws,
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            now: new Date(clock.nowMs),
            analyses: state.analyses,
            offNicheContentIds: state.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
          },
          query,
        ),
      );
    },
  };
}
