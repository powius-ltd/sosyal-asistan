/**
 * Zengin, tohumlu mock `PanelRepository` (Faz 0). Veri `generators/**`'tan tohumla üretilir
 * (aynı tohum → aynı veri); mutasyonlar bellek içidir ve depo örneği yaşadıkça kalır.
 *
 * Sözleşme davranışları (`repository.contract.ts` ile test edilir; Supabase deposu da aynısını sağlar):
 *  - bilinmeyen wsId → liste boş, tekil okuma null; özet okumalar ve tüm yazmalar `not_found`
 *  - geçersiz durum geçişi → `invalid_state`; geçersiz girdi → `invalid_input`
 *  - dönen nesneler kopyadır (çağıran depoyu bozamaz)
 */
import { rivalPlatformProblem, type Competitor } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import { canTransitionIdea, IDEA_STATUSES, type IdeaStatus } from "@/lib/domain/intel";
import { PLATFORMS } from "@/lib/domain/platform";
import type { CreditEntry, CreditHold } from "@/lib/domain/credits";
import type { CollectionRun } from "@/lib/domain/run";
import { parseHandleInput } from "@/lib/data/handle-input";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { parseWorkspacePatch } from "@/lib/data/workspace-patch";
import { maskExpiredTranscript } from "@/lib/data/views/transcript-expiry";
import { getIntegrationStatuses } from "@/lib/settings/integrations";
import {
  discoveryViews,
  filterCompetitors,
  filterContent,
  filterIdeas,
  filterOutliers,
  filterRuns,
  paginate,
} from "@/lib/data/mock/mock-filters";
import { DEFAULT_SEED } from "@/lib/data/mock/prng";
import { createMockContext, type MockRepositoryOptions } from "@/lib/data/mock/repos/context";
import { createAdsMethods } from "@/lib/data/mock/repos/ads";
import { createAnatomyMethods } from "@/lib/data/mock/repos/anatomy";
import { createBriefingMethods } from "@/lib/data/mock/repos/briefing";
import { createCollectionMethods } from "@/lib/data/mock/repos/collections";
import { createCreativeMatrixMethods } from "@/lib/data/mock/repos/creative-matrix";
import { createCredits } from "@/lib/data/mock/repos/credits";
import { createTopicHookMatrixMethods } from "@/lib/data/mock/repos/topic-hook-matrix";
import { createHookLibraryMethods } from "@/lib/data/mock/repos/hook-library";
import { applyIdeaRevision, parseIdeaRevision } from "@/lib/data/idea-revision-input";
import { createIdeaLinks } from "@/lib/data/mock/repos/idea-links";
import { createJobs } from "@/lib/data/mock/repos/jobs";
import { createManualIdeaMethods } from "@/lib/data/mock/repos/manual-ideas";
import { createNotificationMethods } from "@/lib/data/mock/repos/notifications";
import { createOnboardingMethods } from "@/lib/data/mock/repos/onboarding";
import { createStudioOrderMethods } from "@/lib/data/mock/repos/studio-orders";
import { createOutcomeMethods } from "@/lib/data/mock/repos/outcomes";
import { createPublishMethods } from "@/lib/data/mock/repos/publish";
import { createWeeklyPlanMethods } from "@/lib/data/mock/repos/weekly-plan";
import { monthKey, summarizeCost } from "@/lib/data/mock/views/cost";
import { buildOverview } from "@/lib/data/mock/views/overview";
import { buildUnmeasured } from "@/lib/data/mock/views/unmeasured";

/** Yeni rakip eklenince rezerve edilen profil koşusu tahmini (USD). */
const PROFILE_RUN_RESERVE_USD = 0.015;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const USER_COMPETITOR_STATUSES = ["candidate", "tracked", "ignored"] as const;

export type { MockRepositoryOptions } from "@/lib/data/mock/repos/context";

/** Mock depo + yalnız sözleşme testlerinin kullandığı sunucu tarafı kancaları (`testing`): gerçek depo arayüzünde YOK. */
export interface MockPanelRepository extends PanelRepository {
  testing: {
    suggestIdeaLink(input: { ideaId: string; contentItemId: string }): string;
    /** İşçi rolü: sıradaki panel işini alır (`running`); iş yoksa undefined. */
    claimJob(): string | undefined;
    /** İşçi rolü: aldığı panel işini bitirir (`succeeded`). */
    finishJob(jobId: string): void;
    /** Sunucu rolü: kredi verir (yeni parti). */
    grantCredits(input: unknown): CreditEntry;
    /** İşçi rolü: kredi ayırmasını kesinleştirir (düşer). */
    settleCredits(input: unknown): CreditHold;
  };
}

export function createMockRepository(seed: number = DEFAULT_SEED, options: MockRepositoryOptions = {}): MockPanelRepository {
  const ctx = createMockContext(seed, options);
  const { state, clock, ws, snapshotsByItem, inWs, requireWs, findOrThrow, nextId, out } = ctx;
  const currentMonth = () => monthKey(clock.nowIso, ws.timezone);
  const ideaLinks = createIdeaLinks(ctx);
  const credits = createCredits(ctx);
  const jobs = createJobs(ctx, credits);
  const onboarding = createOnboardingMethods(ctx, jobs.methods);

  const repository: PanelRepository = {
    // ------------------------------------------------------ Workspace + hesaplar
    async getWorkspace(wsId) {
      return inWs(wsId) ? out(ws) : null;
    },

    async updateWorkspace(wsId, patch) {
      requireWs(wsId);
      const valid = parseWorkspacePatch(patch);
      // undefined = dokunma (tavan kaldırılamaz, yalnız değiştirilir); boş niş metni tanımı siler.
      if (valid.apifyMonthlyCapUsd !== undefined) ws.apifyMonthlyCapUsd = valid.apifyMonthlyCapUsd;
      if (valid.llmMonthlyCapUsd !== undefined) ws.llmMonthlyCapUsd = valid.llmMonthlyCapUsd;
      if (valid.measureMonthlyCapUsd !== undefined) {
        // Ölçüm tavanını vermek onaydır (Supabase ile aynı: tavan + onay anı birlikte).
        ws.measureMonthlyCapUsd = valid.measureMonthlyCapUsd;
        ws.measureCapApprovedAt = clock.tick();
      }
      if (valid.agentMonthlyCapUsd !== undefined) {
        // Ajan tavanını vermek onaydır (Supabase ile aynı: tavan + onay anı birlikte).
        ws.agentMonthlyCapUsd = valid.agentMonthlyCapUsd;
        ws.agentCapApprovedAt = clock.tick();
      }
      if (valid.collectEveryDays !== undefined) ws.collectEveryDays = valid.collectEveryDays;
      if (valid.collectVideoLimit !== undefined) ws.collectVideoLimit = valid.collectVideoLimit;
      if (valid.rivalTarget !== undefined) ws.rivalTarget = valid.rivalTarget;
      if (valid.nicheBrief !== undefined) ws.nicheBrief = valid.nicheBrief === "" ? undefined : valid.nicheBrief;
      if (valid.complianceRegion !== undefined) ws.complianceRegion = valid.complianceRegion;
      if (valid.contentLanguage !== undefined) ws.contentLanguage = valid.contentLanguage ?? undefined;
      if (valid.accountType !== undefined) ws.accountType = valid.accountType;
      return out(ws);
    },

    async listOwnAccounts(wsId) {
      return inWs(wsId) ? out(state.ownAccounts) : [];
    },

    async getConnections(wsId) {
      if (!inWs(wsId)) return { accounts: [], integrations: [] };
      return { accounts: out(state.ownAccounts), integrations: getIntegrationStatuses() };
    },

    // ------------------------------------------------------------- Genel bakış
    async getOverview(wsId, query) {
      requireWs(wsId);
      return out(
        buildOverview(
          {
            ws,
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            snapshotsByItem,
            accountSnapshots: state.accountSnapshots,
            runs: state.runs,
            clock,
          },
          query,
        ),
      );
    },

    // ------------------------------------------------------------------ İçerik
    async listContent(wsId, filter) {
      if (!inWs(wsId)) return { items: [], total: 0 };
      return out(paginate(filterContent(state.content, filter), filter?.limit, filter?.cursor));
    },

    async getContent(wsId, contentId) {
      if (!inWs(wsId)) return null;
      const item: ContentItem | undefined = state.content.find((c) => c.id === contentId);
      const baseline = state.baselines.get(contentId);
      if (!item || !baseline) return null;
      const transcript = state.transcripts.find((t) => t.contentItemId === contentId);
      // Açıklama skor önbelleğiyle aynı hesaplama anından saklanandır (yeniden hesaplanmaz).
      return out({
        item,
        snapshots: snapshotsByItem.get(contentId) ?? [],
        baseline,
        transcript: transcript ? maskExpiredTranscript(transcript, new Date(clock.nowIso)) : undefined, // süresi dolan metin görünmez (Supabase ile aynı kural)
        analysis: state.analyses.find((a) => a.contentItemId === contentId),
      });
    },

    // -------------------------------------------------------- Rakipler + keşif
    async listCompetitors(wsId, filter) {
      return inWs(wsId) ? out(filterCompetitors(state.competitors, filter)) : [];
    },

    async listDiscoveryCandidates(wsId, filter) {
      return inWs(wsId) ? out(discoveryViews(state.competitors, state.ownAccounts, filter)) : [];
    },

    async addCompetitor(wsId, input) {
      requireWs(wsId);
      if (!PLATFORMS.includes(input.platform)) {
        throw new RepositoryError("invalid_input", `Bilinmeyen platform: "${String(input.platform)}"`);
      }
      // Rakip, kendi hesapla AYNI platformdan olur (Supabase ile aynı kural).
      const platformProblem = rivalPlatformProblem(state.ownAccounts.map((account) => account.platform), input.platform);
      if (platformProblem !== undefined) throw new RepositoryError("invalid_input", platformProblem);
      const handle = parseHandleInput(input.platform, input.handle);
      const status = input.status ?? "tracked";
      const source = input.source ?? "manual";
      if (status !== "tracked" && status !== "candidate") {
        throw new RepositoryError("invalid_input", "Yeni rakip yalnız tracked ya da candidate olabilir.");
      }
      if (!["manual", "related", "search"].includes(source)) {
        throw new RepositoryError("invalid_input", `Bilinmeyen kaynak: "${String(source)}"`);
      }
      if (state.competitors.some((c) => c.platform === input.platform && c.handle === handle)) {
        throw new RepositoryError("already_exists", `@${handle} zaten ekli.`);
      }
      // Bütçe: tavan aşılırsa profil koşusu hiç başlamaz (Supabase'de reserve_budget RPC).
      const cap = ws.apifyMonthlyCapUsd;
      const committed = summarizeCost(state.runs, ws, currentMonth()).apify.committedUsd;
      if (cap !== undefined && committed + PROFILE_RUN_RESERVE_USD > cap) {
        throw new RepositoryError("budget_exceeded", "Aylık Apify tavanı aşılırdı; rakip eklenmedi.");
      }

      const now = clock.tick();
      const competitor: Competitor = {
        id: nextId("cp"),
        workspaceId: wsId,
        platform: input.platform,
        handle,
        status,
        source,
        // Profil henüz toplanmadı: sayılar ölçülmedi (0 değil).
        missingFields: ["followers", "following", "postsCount"],
        contentCount: 0,
        addedAt: now,
      };
      const run: CollectionRun = {
        id: nextId("run"),
        workspaceId: wsId,
        provider: "apify",
        kind: "profile",
        status: "reserved",
        billing: "metered",
        targetLabel: `@${handle}`,
        reservedUsd: PROFILE_RUN_RESERVE_USD,
        priceUnknown: false,
        itemsExpected: 1,
        startedAt: now,
      };
      state.competitors.push(competitor);
      state.runs.push(run);
      return out(competitor);
    },

    async setCompetitorStatus(wsId, competitorId, status) {
      requireWs(wsId);
      if (!(USER_COMPETITOR_STATUSES as readonly string[]).includes(status)) {
        throw new RepositoryError("invalid_input", `Kullanıcı bu durumu veremez: ${String(status)}`);
      }
      const competitor = findOrThrow(state.competitors, competitorId, "Rakip");
      const unreachable = competitor.status === "private" || competitor.status === "not_found";
      if (unreachable && status !== "ignored") {
        throw new RepositoryError("invalid_state", `@${competitor.handle} izlenemez (${competitor.status}); yalnız yoksayılabilir.`);
      }
      competitor.status = status;
      if (status !== "ignored") competitor.statusReason = undefined; // bayat erişim sebebi (Supabase ile aynı kural)
      return out(competitor);
    },

    // -------------------------------------------------------- Tutan içerikler
    async listOutliers(wsId, filter = {}) {
      if (!inWs(wsId)) return { items: [], total: 0 };
      return out(paginate(filterOutliers(state.content, filter, state.ownAccounts, state.competitors), filter.limit, filter.cursor));
    },

    // ---------------------------------------------------------------- Fikirler
    async listIdeas(wsId, filter) {
      return inWs(wsId) ? out(filterIdeas(state.ideas, filter)) : [];
    },

    async countIdeasByStatus(wsId) {
      requireWs(wsId);
      const counts = Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])) as Record<IdeaStatus, number>;
      for (const idea of state.ideas) counts[idea.status] += 1;
      return counts;
    },

    async getIdea(wsId, ideaId) {
      if (!inWs(wsId)) return null;
      const idea = state.ideas.find((i) => i.id === ideaId);
      return idea ? out(idea) : null;
    },

    async updateIdeaStatus(wsId, ideaId, status) {
      requireWs(wsId);
      if (!IDEA_STATUSES.includes(status)) {
        throw new RepositoryError("invalid_input", `Bilinmeyen fikir durumu: ${String(status)}`);
      }
      const idea = findOrThrow(state.ideas, ideaId, "Fikir");
      if (idea.status === status) return out(idea);
      if (!canTransitionIdea(idea.status, status as IdeaStatus)) {
        throw new RepositoryError("invalid_state", `Fikir durumu ${idea.status} → ${status} olamaz.`);
      }
      idea.status = status;
      idea.updatedAt = clock.tick();
      return out(idea);
    },

    async reviseIdea(wsId, ideaId, input, now) {
      requireWs(wsId);
      const idea = findOrThrow(state.ideas, ideaId, "Fikir");
      const parts = applyIdeaRevision(idea, parseIdeaRevision(input), now);
      idea.hooks = parts.hooks;
      idea.scriptOutline = parts.scriptOutline;
      idea.details = parts.details;
      idea.updatedAt = clock.tick();
      return out(idea);
    },

    ...createManualIdeaMethods(ctx),

    ...createPublishMethods(ctx),

    ...createCollectionMethods(ctx),

    ...createHookLibraryMethods(ctx),

    ...createNotificationMethods(ctx),

    ...createWeeklyPlanMethods(ctx),

    ...ideaLinks.methods,

    ...createOutcomeMethods(ctx),

    ...createAnatomyMethods(ctx),

    ...createCreativeMatrixMethods(ctx),

    ...createTopicHookMatrixMethods(ctx),

    ...createBriefingMethods(ctx),

    ...createAdsMethods(ctx),

    ...createStudioOrderMethods(ctx),

    ...jobs.methods,
    // Yoklama ucu (`/api/isler`) iş okur: örnek veride işçi yoktur, okuma işi ilerletir (`pollAdvance`; kapalıyken etkisiz).
    async listJobs(wsId, filter) {
      onboarding.advanceOnJobRead();
      return jobs.methods.listJobs(wsId, filter);
    },
    async getJob(wsId, jobId) {
      onboarding.advanceOnJobRead();
      return jobs.methods.getJob(wsId, jobId);
    },

    ...onboarding.methods,

    ...credits.methods,

    // --------------------------------------------- Maliyet + koşular + ölçülemeyenler
    async getCostSummary(wsId, month) {
      requireWs(wsId);
      if (month !== undefined && !MONTH_PATTERN.test(month)) {
        throw new RepositoryError("invalid_input", `Ay "YYYY-MM" biçiminde olmalı: ${month}`);
      }
      return out(summarizeCost(state.runs, ws, month ?? currentMonth()));
    },

    async listRuns(wsId, filter) {
      if (!inWs(wsId)) return { items: [], total: 0 };
      return out(paginate(filterRuns(state.runs, filter), filter?.limit, filter?.cursor));
    },

    async listUnmeasured(wsId) {
      if (!inWs(wsId)) return [];
      return out(buildUnmeasured(state.ownAccounts, state.competitors, state.content, state.runs));
    },
  };

  return Object.assign(repository, { testing: { suggestIdeaLink: ideaLinks.suggest, claimJob: jobs.claim, finishJob: jobs.finish, grantCredits: credits.grant, settleCredits: credits.settle },
  });
}

const SHARED_KEY = Symbol.for("panel.mock-repository");

/**
 * Süreç boyunca TEK örnek (uygulama yolu: `lib/data/index.ts`). Modül düzeyinde `let` yetmez: geliştirme sunucusunda sayfalar ile route
 * handler'lar (`/api/isler`) ayrı paketlerde yüklenir ve her biri kendi mock durumunu kurardı; ekran "ilk plan hazır" derken durum ucu
 * başka bir kopyadan eski işi okurdu. Anahtar `globalThis` üzerindedir; testler bunu kullanmaz (`createMockRepository` her çağrıda yeni kopya).
 */
export function sharedMockRepository(options: MockRepositoryOptions = {}): MockPanelRepository {
  const holder = globalThis as unknown as { [SHARED_KEY]?: MockPanelRepository };
  return (holder[SHARED_KEY] ??= createMockRepository(undefined, options));
}
