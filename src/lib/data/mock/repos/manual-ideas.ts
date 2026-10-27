/**
 * Mock depo: hesap sahibinin elle (sohbetten) eklediği fikir. Supabase karşılığı `supabase/manual-ideas.ts`; kurallar aynıdır
 * (`manual-idea-input.ts`): doğrulama, kendi hesap platformu, 24 saatlik sınır. Fikir `state.ideas`'a yazılır (liste / plan aynı kaynağı görür).
 */
import { MANUAL_IDEA_DAILY_MAX, parseManualIdea } from "@/lib/data/manual-idea-input";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { Idea } from "@/lib/domain/intel";
import { DAY_MS } from "@/lib/time";

export type ManualIdeaMethods = Pick<PanelRepository, "createManualIdea">;

export function createManualIdeaMethods(ctx: MockContext): ManualIdeaMethods {
  const { state, clock, requireWs, out } = ctx;
  return {
    async createManualIdea(wsId, input, now) {
      requireWs(wsId);
      const value = parseManualIdea(input);
      const account = state.ownAccounts[0];
      if (account === undefined) throw new RepositoryError("invalid_state", "Fikir eklemek için önce bir hesap bağlanmalı.");
      const since = now.getTime() - DAY_MS;
      const recent = state.ideas.filter((i) => i.source === "manual" && new Date(i.createdAt).getTime() >= since).length;
      if (recent >= MANUAL_IDEA_DAILY_MAX) throw new RepositoryError("invalid_state", "Bugün çok fikir ekledin; yarın devam edebilirsin.");
      const stamp = clock.tick();
      const idea: Idea = {
        id: crypto.randomUUID(),
        workspaceId: wsId,
        status: "new",
        title: value.title,
        rationale: value.note,
        platform: account.platform,
        format: value.format,
        source: "manual",
        hooks: [],
        scriptOutline: [],
        details: {},
        rankScore: 0,
        evidence: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      state.ideas.push(idea);
      return out(idea);
    },
  };
}
