/**
 * Mock veri kümesi: tüm üreteçleri tohumdan sırayla çalıştırır. Her üreteç kendi PRNG
 * alt akışını (`fork`) kullanır; biri değişince diğerlerinin verisi kaymaz.
 *
 * Aynı (tohum, şimdi) → birebir aynı veri kümesi.
 */
import type { CollectionItem } from "@/lib/domain/collection";
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { AccountSnapshot, BaselineExplanation, ContentItem, MetricSnapshot } from "@/lib/domain/content";
import type { ContentAnalysis, ContentTopicScreen, Idea, Transcript } from "@/lib/domain/intel";
import type { AlertSettings, Notification } from "@/lib/domain/notification";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { PublishJob } from "@/lib/domain/publish";
import type { CollectionRun, Workspace } from "@/lib/domain/run";
import type { VoiceProfile } from "@/lib/domain/voice-profile";
import type { Platform } from "@/lib/platforms/types";
import { buildAccounts } from "@/lib/data/mock/generators/accounts";
import { buildCollections, type StoredCollection } from "@/lib/data/mock/generators/collections";
import { buildContent, type ContentMeta } from "@/lib/data/mock/generators/content";
import { buildIdeas } from "@/lib/data/mock/generators/ideas";
import { buildIntel } from "@/lib/data/mock/generators/intel";
import { buildJobs } from "@/lib/data/mock/generators/jobs";
import { buildNotifications } from "@/lib/data/mock/generators/notifications";
import { buildAccountSnapshots } from "@/lib/data/mock/generators/metrics";
import { buildPublishJobs } from "@/lib/data/mock/generators/publish";
import { buildRuns } from "@/lib/data/mock/generators/runs";
import { buildWeeklyPlans, type StoredWeeklyPlan } from "@/lib/data/mock/generators/weekly-plan";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { ideasOnPlatform, toSinglePlatform } from "@/lib/data/mock/generators/platform-variant";
import { createRng, DEFAULT_SEED } from "@/lib/data/mock/prng";
import { applyScores } from "@/lib/data/mock/scoring";
import { applyCompetitorStats } from "@/lib/data/mock/views/competitor-stats";

export interface MockDataset {
  workspace: Workspace;
  ownAccounts: OwnAccount[];
  competitors: Competitor[];
  content: ContentItem[];
  /** Baz çizgisi açıklamaları (içerik kimliği → açıklama); skor önbelleğiyle AYNI hesaplama anından (bkz. scoring.ts). */
  baselines: Map<string, BaselineExplanation>;
  snapshots: MetricSnapshot[];
  accountSnapshots: AccountSnapshot[];
  transcripts: Transcript[];
  analyses: ContentAnalysis[];
  /** Konu eleği sonuçları (içerik başına en çok bir); `inNiche = false` olanlar karşılaştırma/plan gruplarına girmez. */
  topicScreens: ContentTopicScreen[];
  ideas: Idea[];
  publishJobs: PublishJob[];
  runs: CollectionRun[];
  /** Panel işleri (geçmiş; tohumda etkin iş yok). Yeni işler `requestJob` ile eklenir. */
  jobs: PanelJob[];
  /** Koleksiyonlar (`itemCount` saklanmaz, üyelerden türetilir) ve üyelikleri. */
  collections: StoredCollection[];
  collectionItems: CollectionItem[];
  /** Bildirimler (yeniden eskiye sıralama okuma anında) ve workspace'in uyarı ayarları (yazılabilir). */
  notifications: Notification[];
  alertSettings: AlertSettings;
  /** Haftalık planlar (şimdiki + geçen hafta; fikir kartları okuma anında `ideas`'tan eklenir) ve ses profilleri. */
  weeklyPlans: StoredWeeklyPlan[];
  voiceProfiles: VoiceProfile[];
  /** İçerik → katalog konusu/hook'u (yalnız üreteç ve testler için; depo dışına çıkmaz). */
  contentMeta: Map<string, ContentMeta>;
}

/** `platform` verilirse örnek veri o platformun tek hesaplı çeşidi olur (`platform-variant.ts`); verilmezse varsayılan veri. */
export function buildMockDataset(clock: MockClock, seed: number = DEFAULT_SEED, options: { platform?: Platform } = {}): MockDataset {
  const rng = createRng(seed);
  const variant = options.platform;
  const seeded = buildAccounts(rng.fork("accounts"), clock);
  const accounts = variant === undefined ? seeded : toSinglePlatform(seeded, variant);

  const addedAtMs = new Map<string, number>([
    ...accounts.ownAccounts.map((a) => [a.id, new Date(a.createdAt).getTime()] as const),
    ...accounts.competitors.map((c) => [c.id, new Date(c.addedAt).getTime()] as const),
  ]);
  const content = buildContent(rng.fork("content"), clock, accounts.plans, addedAtMs);
  const baselines = applyScores(content.items, clock.nowMs);

  for (const c of accounts.competitors) {
    c.contentCount = content.items.filter((item) => item.owner.kind === "competitor" && item.owner.id === c.id).length;
  }

  const accountSnapshots = buildAccountSnapshots(rng.fork("account-snapshots"), clock, accounts.plans);
  applyCompetitorStats(accounts.competitors, content.items, accountSnapshots);

  // Koşular önce kurulur: yeni (agy) analizler abonelik koşusuna bağlanır (`ContentAnalysis.runId`). Koşular kendi akışını kullanır.
  const runs = buildRuns(rng.fork("runs"), clock);
  const analysisRun = runs.find((r) => r.kind === "video_analysis" && r.status === "ingested");
  const intel = buildIntel(rng.fork("intel"), clock, content.items, content.meta, { analysisRunId: analysisRun?.id });
  const seededIdeas = buildIdeas(rng.fork("ideas"), clock, content.items, content.meta, intel.analyses);
  const ideas = variant === undefined ? seededIdeas : ideasOnPlatform(seededIdeas, variant);
  // Tek platformlu çeşitte hesap resmi API'ye bağlı değildir: yayın işi tohumlanmaz (akış üreteçlerin sırasını bozmasın diye yine çağrılır).
  const seededPublishJobs = buildPublishJobs(rng.fork("publish"), clock, ideas, content.items);
  const publishJobs = variant === undefined ? seededPublishJobs : [];
  // Plan fikirleri mevcut fikirlerden seçilir ve yerinde zenginleştirilir (rastgelelik yok: diğer üreteçlerin akışı kaymaz).
  const weekly = buildWeeklyPlans({
    clock,
    workspace: accounts.workspace,
    ownAccounts: accounts.ownAccounts,
    competitors: accounts.competitors,
    content: content.items,
    analyses: intel.analyses,
    transcripts: intel.transcripts,
    ideas,
    offNicheContentIds: intel.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
  });
  const collections = buildCollections(rng.fork("collections"), clock, content.items, content.meta);
  const alerts = buildNotifications(rng.fork("notifications"), clock, {
    items: content.items,
    competitors: accounts.competitors,
    ownAccounts: accounts.ownAccounts,
    ideas,
  });

  return {
    workspace: accounts.workspace,
    ownAccounts: accounts.ownAccounts,
    competitors: accounts.competitors,
    content: content.items,
    baselines,
    snapshots: content.snapshots,
    accountSnapshots,
    transcripts: intel.transcripts,
    analyses: intel.analyses,
    topicScreens: intel.topicScreens,
    ideas,
    publishJobs,
    runs,
    jobs: buildJobs(clock),
    collections: collections.collections,
    collectionItems: collections.items,
    notifications: alerts.notifications,
    alertSettings: alerts.alertSettings,
    weeklyPlans: weekly.plans,
    voiceProfiles: weekly.voiceProfiles,
    contentMeta: content.meta,
  };
}
