/**
 * `PanelRepository`'nin gerçek (Supabase) uygulaması — Faz 1. Service role istemcisiyle çalışır (RLS'yi aşar); bu yüzden
 * HER sorgu açıkça `workspace_id` ile süzülür ve yetki/durum denetimi burada yapılır. Konu başına dosyalar:
 * `workspace`, `content-queries`, `outlier-query`, `overview-query`, `competitors`, `ideas`, `publish`, `collections`,
 * `notifications`, `weekly-digest-query`, `hook-library`, `weekly-plans` (plan + ses profili), `insights-query`, `runs`,
 * `idea-links` (fikir ↔ Reels bağı), `outcomes` (geçen hafta + ölçüm zamanı), `anatomy` (Kreatif Anatomisi),
 * `creative-matrix` (Kreatif Matris: açı × farkındalık katmanı), `topic-hook-matrix` (konu × hook türü), `briefings` (Analist brifingi),
 * `jobs` (panel işleri: iş kuyruğu satırı; işi ayrık işçi koşturur), `onboarding` (başlangıç akışı: türetilmiş durum + akış eylemleri),
 * `credits` (kredi defteri: bakiye, hareketler, ayır / bırak).
 * Ortak görünüm hesapları `lib/data/views/**` ve
 * `lib/metrics`'ten gelir (mock ile AYNI fonksiyonlar).
 *
 * Sözleşme: `repository.contract.ts` (bkz. `supabase-repository.db.test.ts`). Bilinmeyen workspace → liste boş, tekil
 * okuma null; özet okumalar ve yazmalar `not_found` (bkz. `repository.ts`).
 */
import type { PanelRepository } from "@/lib/data/repository";
import * as anatomy from "@/lib/data/supabase/anatomy";
import * as briefings from "@/lib/data/supabase/briefings";
import * as collections from "@/lib/data/supabase/collections";
import * as competitors from "@/lib/data/supabase/competitors";
import { createContext, type SupabaseRepositoryOptions } from "@/lib/data/supabase/context";
import * as content from "@/lib/data/supabase/content-queries";
import * as creativeMatrix from "@/lib/data/supabase/creative-matrix";
import * as credits from "@/lib/data/supabase/credits";
import * as topicHookMatrix from "@/lib/data/supabase/topic-hook-matrix";
import * as hooks from "@/lib/data/supabase/hook-library";
import * as ideaLinks from "@/lib/data/supabase/idea-links";
import * as ideas from "@/lib/data/supabase/ideas";
import * as insights from "@/lib/data/supabase/insights-query";
import * as ads from "@/lib/data/supabase/ads";
import * as jobs from "@/lib/data/supabase/jobs";
import * as notifications from "@/lib/data/supabase/notifications";
import * as onboarding from "@/lib/data/supabase/onboarding";
import * as studioOrders from "@/lib/data/supabase/studio-orders";
import * as outcomes from "@/lib/data/supabase/outcomes";
import * as manualIdeas from "@/lib/data/supabase/manual-ideas";
import * as outliers from "@/lib/data/supabase/outlier-query";
import * as overview from "@/lib/data/supabase/overview-query";
import * as publish from "@/lib/data/supabase/publish";
import * as runs from "@/lib/data/supabase/runs";
import * as digest from "@/lib/data/supabase/weekly-digest-query";
import * as plans from "@/lib/data/supabase/weekly-plans";
import * as workspace from "@/lib/data/supabase/workspace";

export type { SupabaseRepositoryOptions } from "@/lib/data/supabase/context";

export function createSupabaseRepository(options: SupabaseRepositoryOptions): PanelRepository {
  const ctx = createContext(options);
  return {
    // Workspace + hesaplar
    getWorkspace: (wsId) => workspace.getWorkspace(ctx, wsId),
    updateWorkspace: (wsId, patch) => workspace.updateWorkspace(ctx, wsId, patch),
    listOwnAccounts: (wsId) => workspace.listOwnAccounts(ctx, wsId),
    getConnections: (wsId) => workspace.getConnections(ctx, wsId),

    // Genel bakış
    getOverview: (wsId, query) => overview.getOverview(ctx, wsId, query),

    // İçerik
    listContent: (wsId, filter) => content.listContent(ctx, wsId, filter),
    getContent: (wsId, contentId) => content.getContent(ctx, wsId, contentId),

    // Rakipler + keşif
    listCompetitors: (wsId, filter) => competitors.listCompetitors(ctx, wsId, filter),
    listDiscoveryCandidates: (wsId, filter) => competitors.listDiscoveryCandidates(ctx, wsId, filter),
    addCompetitor: (wsId, input) => competitors.addCompetitor(ctx, wsId, input),
    setCompetitorStatus: (wsId, competitorId, status) => competitors.setCompetitorStatus(ctx, wsId, competitorId, status),

    // Tutan içerikler
    listOutliers: (wsId, filter) => outliers.listOutliers(ctx, wsId, filter),

    // Fikirler
    listIdeas: (wsId, filter) => ideas.listIdeas(ctx, wsId, filter),
    countIdeasByStatus: (wsId) => ideas.countIdeasByStatus(ctx, wsId),
    getIdea: (wsId, ideaId) => ideas.getIdea(ctx, wsId, ideaId),
    updateIdeaStatus: (wsId, ideaId, status) => ideas.updateIdeaStatus(ctx, wsId, ideaId, status),
    reviseIdea: (wsId, ideaId, input, now) => ideas.reviseIdea(ctx, wsId, ideaId, input, now),
    createManualIdea: (wsId, input, now) => manualIdeas.createManualIdea(ctx, wsId, input, now),

    // Yayın
    listPublishJobs: (wsId, filter) => publish.listPublishJobs(ctx, wsId, filter),
    createPublishJob: (wsId, input) => publish.createPublishJob(ctx, wsId, input),
    submitPublishJob: (wsId, jobId) => publish.submitPublishJob(ctx, wsId, jobId),
    approvePublishJob: (wsId, jobId) => publish.approvePublishJob(ctx, wsId, jobId),
    cancelPublishJob: (wsId, jobId) => publish.cancelPublishJob(ctx, wsId, jobId),
    getPublishSummary: (wsId, now) => publish.getPublishSummary(ctx, wsId, now),

    // Koleksiyonlar
    listCollections: (wsId) => collections.listCollections(ctx, wsId),
    getCollection: (wsId, collectionId) => collections.getCollection(ctx, wsId, collectionId),
    createCollection: (wsId, input) => collections.createCollection(ctx, wsId, input),
    renameCollection: (wsId, collectionId, name) => collections.renameCollection(ctx, wsId, collectionId, name),
    deleteCollection: (wsId, collectionId) => collections.deleteCollection(ctx, wsId, collectionId),
    addToCollection: (wsId, collectionId, contentId, note) => collections.addToCollection(ctx, wsId, collectionId, contentId, note),
    removeFromCollection: (wsId, collectionId, contentId) => collections.removeFromCollection(ctx, wsId, collectionId, contentId),
    listCollectionsForContent: (wsId, contentId) => collections.listCollectionsForContent(ctx, wsId, contentId),
    listCollectionMembership: (wsId, contentIds) => collections.listCollectionMembership(ctx, wsId, contentIds),

    // Hook kütüphanesi
    listHookLibrary: (wsId, filter) => hooks.listHookLibrary(ctx, wsId, filter),
    hookTypeStats: (wsId) => hooks.hookTypeStats(ctx, wsId),

    // Bildirimler + uyarı ayarları + haftalık özet
    getAlertSettings: (wsId) => notifications.getAlertSettings(ctx, wsId),
    updateAlertSettings: (wsId, patch) => notifications.updateAlertSettings(ctx, wsId, patch),
    listNotifications: (wsId, filter) => notifications.listNotifications(ctx, wsId, filter),
    countUnreadNotifications: (wsId) => notifications.countUnreadNotifications(ctx, wsId),
    markNotificationRead: (wsId, notificationId) => notifications.markNotificationRead(ctx, wsId, notificationId),
    markAllNotificationsRead: (wsId) => notifications.markAllNotificationsRead(ctx, wsId),
    getWeeklyDigest: (wsId, now) => digest.getWeeklyDigest(ctx, wsId, now),

    // Haftalık plan + ses profili + içgörü
    getWeeklyPlan: (wsId, weekStart) => plans.getWeeklyPlan(ctx, wsId, weekStart),
    approveWeeklyPlan: (wsId, weekStart, now) => plans.approveWeeklyPlan(ctx, wsId, weekStart, now),
    listWeeklyPlans: (wsId, query) => plans.listWeeklyPlans(ctx, wsId, query),
    getVoiceProfile: (wsId, accountId) => plans.getVoiceProfile(ctx, wsId, accountId),
    getInsights: (wsId, query) => insights.getInsights(ctx, wsId, query),

    // Fikir ↔ Reels bağı + ölçüm + geçen hafta + anatomi (Faz 2 kapanış)
    listIdeaLinks: (wsId, filter) => ideaLinks.listIdeaLinks(ctx, wsId, filter),
    linkIdeaToReel: (wsId, input) => ideaLinks.linkIdeaToReel(ctx, wsId, input),
    resolveIdeaLink: (wsId, linkId, decision) => ideaLinks.resolveIdeaLink(ctx, wsId, linkId, decision),
    unlinkIdea: (wsId, ideaId) => ideaLinks.unlinkIdea(ctx, wsId, ideaId),
    getWeekReview: (wsId, weekStart, now) => outcomes.getWeekReview(ctx, wsId, weekStart, now),
    listMeasurementDue: (wsId, now) => outcomes.listMeasurementDue(ctx, wsId, now),
    getAnatomy: (wsId, query) => anatomy.getAnatomy(ctx, wsId, query),
    getCreativeMatrix: (wsId, query) => creativeMatrix.getCreativeMatrix(ctx, wsId, query),
    getTopicHookMatrix: (wsId, query) => topicHookMatrix.getTopicHookMatrix(ctx, wsId, query),
    getLatestBriefing: (wsId) => briefings.getLatestBriefing(ctx, wsId),

    // Reklam (yalnız okuma)
    listAdAccounts: (wsId) => ads.listAdAccounts(ctx, wsId),
    getAdReport: (wsId, query, now) => ads.getAdReport(ctx, wsId, query, now),
    getAdDetail: (wsId, adId, query, now) => ads.getAdDetail(ctx, wsId, adId, query, now),
    listAdUsage: (wsId, contentIds, now) => ads.listAdUsage(ctx, wsId, contentIds, now),
    updateAdAccountGoal: (wsId, patch) => ads.updateAdAccountGoal(ctx, wsId, patch),

    // Panel işleri
    requestJob: (wsId, input) => jobs.requestJob(ctx, wsId, input),
    listJobs: (wsId, filter) => jobs.listJobs(ctx, wsId, filter),
    getJob: (wsId, jobId) => jobs.getJob(ctx, wsId, jobId),
    cancelJob: (wsId, jobId) => jobs.cancelJob(ctx, wsId, jobId),

    // Fiş (stüdyo siparişi)
    createStudioOrder: (wsId, input, now) => studioOrders.createStudioOrder(ctx, wsId, input, now),
    getStudioOrder: (wsId, id) => studioOrders.getStudioOrder(ctx, wsId, id),
    listStudioOrders: (wsId, query) => studioOrders.listStudioOrders(ctx, wsId, query),
    updateStudioOrder: (wsId, id, patch, now) => studioOrders.updateStudioOrder(ctx, wsId, id, patch, now),
    advanceStudioOrder: (wsId, id, patch, now) => studioOrders.advanceStudioOrder(ctx, wsId, id, patch, now),
    requestOrderRevision: (wsId, orderId, note, now) => studioOrders.requestOrderRevision(ctx, wsId, orderId, note, now),

    // Başlangıç akışı
    getOnboardingState: (wsId) => onboarding.getOnboardingState(ctx, wsId),
    startOnboardingProbe: (wsId) => onboarding.startOnboardingProbe(ctx, wsId),
    confirmOnboardingAccount: (wsId, input) => onboarding.confirmOnboardingAccount(ctx, wsId, input),
    startOnboardingBuild: (wsId, input) => onboarding.startOnboardingBuild(ctx, wsId, input),
    discardOnboardingWorkspace: (wsId) => onboarding.discardOnboardingWorkspace(ctx, wsId),
    addOnboardingRival: (wsId, input) => onboarding.addOnboardingRival(ctx, wsId, input),

    // Kredi defteri
    getCreditBalance: (wsId) => credits.getCreditBalance(ctx, wsId),
    listCreditEntries: (wsId, filter) => credits.listCreditEntries(ctx, wsId, filter),
    reserveCredits: (wsId, input) => credits.reserveCredits(ctx, wsId, input),
    releaseCredits: (wsId, key) => credits.releaseCredits(ctx, wsId, key),

    // Maliyet + koşular + ölçülemeyenler
    getCostSummary: (wsId, month) => runs.getCostSummary(ctx, wsId, month),
    listRuns: (wsId, filter) => runs.listRuns(ctx, wsId, filter),
    listUnmeasured: (wsId) => runs.listUnmeasured(ctx, wsId),
  };
}
