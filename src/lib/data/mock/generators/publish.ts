/**
 * Mock üreteci: 10 yayın işi — her durumdan bir tane, hepsi resmi API'ye bağlı kendi hesapta.
 * Kural: `approved` ve sonrası (container_pending, ready, publishing, published, failed, expired)
 * insan onaylıdır → `approvedAt` dolu; draft/awaiting_approval/cancelled onaysız.
 * Planlanan fikirler (scheduled/published) ilgili işe `publishJobId` ile bağlanır.
 */
import type { ContentItem } from "@/lib/domain/content";
import type { Idea } from "@/lib/domain/intel";
import type { PublishJob, PublishStatus } from "@/lib/domain/publish";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import { MOCK_USER_ID } from "@/lib/workspace/current";
import { topicByKey } from "@/lib/data/mock/catalog/topics";
import { IDEA_TEMPLATES } from "@/lib/data/mock/catalog/ideas";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import type { Rng } from "@/lib/data/mock/prng";

interface JobSpec {
  status: PublishStatus;
  /** Fikir durumu + sırası (o durumdaki kaçıncı fikir). */
  idea?: { status: Idea["status"]; nth: number; linkBack: boolean };
  createdAge: number;
  updatedAge: number;
  /** Negatif = gelecekte. undefined = onay sonrası hemen. */
  scheduledAge?: number;
  approvedAge?: number;
  container?: boolean;
  containerExpiresAge?: number;
  error?: string;
  /** Yayın denemesi sayısı; verilmezse 0. */
  attempts?: number;
  paidPartnership?: boolean;
  aiGenerated?: boolean;
  /** Ücretli iş birliğinde açıklamanın başındaki "Reklam" ibaresi eklenmesin (uyum denetimi `fail` örneği). */
  omitAdLabel?: boolean;
  /** Reklam veren adı; verilirse açıklamada "… tarafından sağlandı" ile geçer. */
  advertiser?: string;
  /** YZ beyanı açıklamada var mı (aiGenerated işlerde). */
  aiDisclosure?: boolean;
  trial?: PublishJob["trial"];
  media?: boolean;
}

const SPECS: JobSpec[] = [
  {
    // Uyum: ücretli iş birliği ama "Reklam" ibaresi yok → taslak onaya gönderilemez (fail).
    status: "draft", idea: { status: "scripted", nth: 0, linkBack: false }, createdAge: 1.2, updatedAge: 0.6,
    paidPartnership: true, omitAdLabel: true,
  },
  {
    status: "awaiting_approval", idea: { status: "scripted", nth: 1, linkBack: false }, createdAge: 2.1, updatedAge: 0.8,
    // Uyum: ibare var, reklam veren yok (warn) + YZ işaretli ama beyan yok (fail) → onaylanamaz.
    scheduledAge: -1.8, media: true, paidPartnership: true, aiGenerated: true,
  },
  {
    status: "approved", idea: { status: "scheduled", nth: 0, linkBack: true }, createdAge: 3, updatedAge: 0.4,
    scheduledAge: -2.3, approvedAge: 0.4, media: true, paidPartnership: true, advertiser: "Notion Türkiye",
  },
  {
    status: "container_pending", createdAge: 2.5, updatedAge: 0.03, scheduledAge: -0.05, approvedAge: 0.9, container: true, media: true, attempts: 1,
    trial: { enabled: true, graduation: "performance" },
  },
  {
    status: "ready", idea: { status: "scheduled", nth: 1, linkBack: true }, createdAge: 4, updatedAge: 0.1,
    scheduledAge: -0.4, approvedAge: 1.1, container: true, containerExpiresAge: -0.9, media: true, attempts: 1,
    aiGenerated: true, aiDisclosure: true,
  },
  { status: "publishing", createdAge: 3.5, updatedAge: 0.005, scheduledAge: 0.01, approvedAge: 1.5, container: true, media: true, attempts: 1 },
  {
    status: "published", idea: { status: "published", nth: 0, linkBack: true }, createdAge: 8, updatedAge: 6.2,
    approvedAge: 6.8, container: true, media: true, attempts: 1,
  },
  {
    status: "failed", createdAge: 5, updatedAge: 3.1, scheduledAge: 3.1, approvedAge: 3.6, container: true, media: true, attempts: 3,
    error: "Meta API videoyu işleyemedi: en-boy oranı 9:16 olmalı (yüklenen 16:9). Videoyu yeniden yükleyin.",
  },
  {
    status: "expired", createdAge: 4.5, updatedAge: 1.9, scheduledAge: 1.9, approvedAge: 3, container: true,
    containerExpiresAge: 1.9, media: true, attempts: 2, trial: { enabled: true, graduation: "manual" },
    error: "Container 24 saat içinde yayınlanmadı ve süresi doldu; yeniden oluşturulması gerekiyor.",
  },
  { status: "cancelled", createdAge: 6, updatedAge: 5.2, scheduledAge: 2.5, media: true },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

export function buildPublishJobs(rng: Rng, clock: MockClock, ideas: Idea[], items: ContentItem[]): PublishJob[] {
  const accountId = "oa_1";
  // Yayınlanan iş, kendi hesaptaki ~6 günlük gerçek bir Reels'e karşılık gelir.
  const ownReels = items.filter((c) => c.owner.id === accountId && c.format === "short_video" && c.publishedAt);
  const published = ownReels.reduce<ContentItem | undefined>((best, c) => {
    const diff = Math.abs(clock.ageDays(c.publishedAt as string) - 6.2);
    return !best || diff < Math.abs(clock.ageDays(best.publishedAt as string) - 6.2) ? c : best;
  }, undefined);

  return SPECS.map((spec, i) => {
    const id = `pj_${pad2(i + 1)}`;
    const idea = spec.idea ? ideas.filter((x) => x.status === spec.idea?.status)[spec.idea.nth] : undefined;
    if (idea && spec.idea?.linkBack) idea.publishJobId = id;
    const template = idea ? IDEA_TEMPLATES[ideas.indexOf(idea)] : undefined;
    const hashtags = template ? topicByKey(template.topicKey).hashtags : ["yapayzeka", "verimlilik"];
    const lead = idea ? idea.hooks[0] : rng.pick(["Bu haftanın yapay zekâ ipucu.", "Mesaiyi kısaltan tek komut.", "Bugün ofiste denediğim otomasyon."]);
    const adLabel = spec.paidPartnership && !spec.omitAdLabel;
    const caption = [
      `${adLabel ? "Reklam · " : ""}${lead}`,
      spec.advertiser ? ` ${spec.advertiser} tarafından sağlandı.` : "",
      spec.aiDisclosure ? " Yapay zekâ ile üretildi." : "",
      ` ${hashtags.map((h) => `#${h}`).join(" ")}`,
      adLabel ? " #reklam #işbirliği" : "",
    ].join("");
    const isPublished = spec.status === "published" && published;
    // Yayınlanan işin zamanları gerçek içeriğin yayın anına göre: onay 0,4 gün önce, oluşturma 1,2 gün önce.
    const publishedAge = isPublished ? clock.ageDays(published.publishedAt as string) : undefined;
    const createdAge = publishedAge === undefined ? spec.createdAge : publishedAge + 1.2;
    const approvedAge = publishedAge === undefined ? spec.approvedAge : publishedAge + 0.4;
    const updatedAge = publishedAge ?? spec.updatedAge;
    const scheduledFor = isPublished
      ? published.publishedAt
      : spec.scheduledAge === undefined
        ? undefined
        : spec.scheduledAge < 0 ? clock.daysAhead(-spec.scheduledAge) : clock.daysAgo(spec.scheduledAge);

    return {
      id,
      workspaceId: WS,
      socialAccountId: accountId,
      platform: "instagram",
      ideaId: idea?.id,
      status: spec.status,
      caption,
      mediaPath: spec.media ? `${WS}/${id}/video.mp4` : undefined,
      coverPath: spec.media ? `${WS}/${id}/cover.jpg` : undefined,
      shareToFeed: i !== 5,
      scheduledFor,
      paidPartnership: spec.paidPartnership ?? false,
      aiGenerated: spec.aiGenerated ?? false,
      advertiserName: spec.advertiser,
      trial: spec.trial,
      approvedAt: approvedAge === undefined ? undefined : clock.daysAgo(approvedAge),
      approvedBy: approvedAge === undefined ? undefined : MOCK_USER_ID,
      containerId: spec.container ? `179${Array.from({ length: 14 }, () => rng.int(0, 9)).join("")}` : undefined,
      containerExpiresAt:
        spec.containerExpiresAge === undefined
          ? undefined
          : spec.containerExpiresAge < 0 ? clock.daysAhead(-spec.containerExpiresAge) : clock.daysAgo(spec.containerExpiresAge),
      externalId: isPublished ? published.externalId : undefined,
      permalink: isPublished ? published.url : undefined,
      error: spec.error,
      attemptCount: spec.attempts ?? 0,
      createdAt: clock.daysAgo(createdAge),
      updatedAt: clock.daysAgo(updatedAge),
    };
  });
}
