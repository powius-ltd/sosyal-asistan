/**
 * Mock depo: Kreatif Anatomisi. Hesap `lib/anatomy` `buildAnatomy` (Supabase ile AYNI fonksiyon); burada yalnız girdi kümesi
 * verilir: kendi hesaplar, rakipler, içerikler, analizler ve konu eleğinin niş dışı bulduğu içerikler (`getInsights` ile aynı girdi).
 */
import { buildAnatomy } from "@/lib/anatomy/aggregate";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";

export type AnatomyMethods = Pick<PanelRepository, "getAnatomy">;

export function createAnatomyMethods(ctx: MockContext): AnatomyMethods {
  const { state, clock, ws, requireWs, out } = ctx;

  return {
    async getAnatomy(wsId, query = {}) {
      requireWs(wsId);
      if (query.accountId !== undefined && !state.ownAccounts.some((a) => a.id === query.accountId)) {
        throw new RepositoryError("not_found", `Hesap bulunamadı: ${query.accountId}`);
      }
      return out(
        buildAnatomy(
          {
            workspaceId: ws.id,
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            analyses: state.analyses,
            offNicheContentIds: state.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
            now: new Date(clock.nowMs),
          },
          query,
        ),
      );
    },
  };
}
