/**
 * Mock depo: "Geçen hafta" sonucu ve "ölçüm zamanı geldi" listesi. Hesap `lib/outcomes/*` saf fonksiyonlarıdır (Supabase ile
 * AYNI); burada yalnız mock durumundan girdi kurulur. Aktif bağ plan fikrinin `reelLink`'inden gelir (bağ durumu fikre
 * yansıtılır: `repos/idea-links.ts`); bekleyen öneri sayısı mock'ta izlenmez (0): öneriler bağ modülünün kapanışındadır.
 */
import type { PanelRepository } from "@/lib/data/repository";
import { parseWeekStart } from "@/lib/data/weekly-plan-input";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { createWeeklyPlanMethods } from "@/lib/data/mock/repos/weekly-plan";
import { buildMeasurementDue, measureLookbackStart } from "@/lib/outcomes/due";
import { toOutcomeContent, type OutcomeContent } from "@/lib/outcomes/content";
import { buildWeekReview } from "@/lib/outcomes/review";

export type OutcomeMethods = Pick<PanelRepository, "getWeekReview" | "listMeasurementDue">;

export function createOutcomeMethods(ctx: MockContext): OutcomeMethods {
  const { state, snapshotsByItem, inWs } = ctx;
  // Plan okuması durumsuzdur (`state.weeklyPlans` + `state.ideas`): ayrı örnek aynı planı görür.
  const plans = createWeeklyPlanMethods(ctx);

  const contentOf = (id: string): OutcomeContent | undefined => {
    const item = state.content.find((c) => c.id === id && c.owner.kind === "own");
    if (!item) return undefined;
    return toOutcomeContent(item, snapshotsByItem.get(item.id) ?? [], state.analyses.find((a) => a.contentItemId === item.id));
  };

  return {
    async getWeekReview(wsId, weekStart, now) {
      const week = parseWeekStart(weekStart);
      if (!inWs(wsId)) return null;
      const plan = await plans.getWeeklyPlan(wsId, week);
      if (!plan) return null;
      const contents = new Map<string, OutcomeContent>();
      for (const item of plan.items) {
        const link = item.idea.reelLink;
        const content = link?.status === "confirmed" && link.contentItemId !== undefined ? contentOf(link.contentItemId) : undefined;
        if (content) contents.set(content.id, content);
      }
      return ctx.out(buildWeekReview({ plan, contents, now }));
    },

    async listMeasurementDue(wsId, now) {
      if (!inWs(wsId)) return [];
      const since = Date.parse(measureLookbackStart(now));
      const recent = state.content.filter((item) => {
        const published = item.publishedAt === undefined ? Number.NaN : Date.parse(item.publishedAt);
        return item.owner.kind === "own" && item.format === "short_video" && published >= since && published <= now.getTime();
      });
      const contents = recent.flatMap((item) => contentOf(item.id) ?? []);
      const ideaByContent = new Map(
        state.ideas.flatMap((idea) =>
          idea.reelLink?.status === "confirmed" && idea.reelLink.contentItemId !== undefined ? [[idea.reelLink.contentItemId, idea.id] as const] : [],
        ),
      );
      return ctx.out(buildMeasurementDue(contents, now, ideaByContent));
    },
  };
}
