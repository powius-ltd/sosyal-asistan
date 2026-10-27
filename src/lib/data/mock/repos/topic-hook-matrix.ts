/**
 * Mock depo: konu × hook türü matrisi. Hesap Supabase ile AYNI fonksiyondur (`lib/matrix` `buildTopicHookMatrix`); burada yalnız mock KÜME
 * ATAMALARI üretilir ve girdi toplanır. DOLU ÖRNEK: mock içerikler kimlikten deterministik 4 konu kümesinden birine atanır (~1/6'sı kümesiz
 * sayılır: atama satırı yok). Mock'ta hem kendi hem rakip videolar vardır: hücrelerin çoğu kendi/rakip karışık, bir kısmı yalnız rakipte
 * (fırsat) ya da yalnız kendide (tutan/zayıf).
 */
import type { ContentItem } from "@/lib/domain/content";
import type { PanelRepository } from "@/lib/data/repository";
import { hashString } from "@/lib/data/mock/prng";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { buildTopicHookMatrix, type TopicClusterAssignment } from "@/lib/matrix/topic-hook-build";

export type TopicHookMatrixMethods = Pick<PanelRepository, "getTopicHookMatrix">;

/** Mock konu kümeleri (anahtar → Türkçe ad). */
const MOCK_CLUSTERS: readonly { key: string; label: string }[] = [
  { key: "sabah_rutini", label: "Sabah rutini" },
  { key: "odak_ve_dikkat", label: "Odak ve dikkat" },
  { key: "zihin_ve_aliskanlik", label: "Zihin ve alışkanlık" },
  { key: "uyku_ve_enerji", label: "Uyku ve enerji" },
];

/** İçeriğin mock küme ataması; ~1/6'sı henüz kümelenmemiş (undefined: satır yok). */
function mockAssignmentFor(item: ContentItem): TopicClusterAssignment | undefined {
  const h = hashString(item.id);
  if (h % 6 === 0) return undefined;
  const cluster = MOCK_CLUSTERS[Math.floor(h / 6) % MOCK_CLUSTERS.length] as (typeof MOCK_CLUSTERS)[number];
  return { contentItemId: item.id, clusterKey: cluster.key, clusterLabel: cluster.label, clusteredAt: item.firstSeenAt };
}

export function createTopicHookMatrixMethods(ctx: MockContext): TopicHookMatrixMethods {
  const { state, clock, ws, requireWs, out } = ctx;

  return {
    async getTopicHookMatrix(wsId, query = {}) {
      requireWs(wsId);
      return out(
        buildTopicHookMatrix(
          {
            workspaceId: ws.id,
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            analyses: state.analyses,
            clusters: state.content.flatMap((item) => mockAssignmentFor(item) ?? []),
            offNicheContentIds: state.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
            now: new Date(clock.nowMs),
          },
          query,
        ),
      );
    },
  };
}
