/**
 * Mock depo: Kreatif Matris. Hesap Supabase ile AYNI fonksiyondur (`lib/matrix` `buildCreativeMatrix`); burada yalnız mock ETİKETLER
 * üretilir ve girdi toplanır. Etiketler içerik kimliğinden deterministik türetilir (`mockCellFor`): kendi videolar birkaç hücrede
 * (denendi), rakipler daha geniş bir hücre kümesinde (çoğu kanıtlı fırsat), ön matrisin "aykırı" bulduğu bazı hücreleri kimse denememiş
 * (boş); içeriklerin ~1/6'sı henüz etiketlenmemiş sayılır (etiket satırı yok).
 */
import type { ContentItem } from "@/lib/domain/content";
import type { ContentCreativeLabel, CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import type { PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { hashString } from "@/lib/data/mock/prng";
import { mockAdDataset } from "@/lib/data/mock/repos/ads";
import { buildAdMatrixSource } from "@/lib/matrix/ad-source";
import { buildCreativeMatrix } from "@/lib/matrix/build";

export type CreativeMatrixMethods = Pick<PanelRepository, "getCreativeMatrix">;

type Slot = readonly [CreativeAngle, FunnelStage];

/** Kendi hesabın denediği hücreler (üçü de ön matriste birincil). */
const OWN_SLOTS: readonly Slot[] = [
  ["sonuc-kazanim", "cozum-ariyor"],
  ["kimlik", "sorunu-biliyor"],
  ["aci-korku", "sorunu-biliyor"],
];

/** Rakiplerin denediği hücreler: ön matrisin "aykırı" bulduğu 5 hücre hariç (orası boş) + bir aykırı hücre ("ön matris yanılıyor mu?"). */
const RIVAL_SLOTS: readonly Slot[] = [
  ["aci-korku", "hic-farkinda-degil"],
  ["kimlik", "hic-farkinda-degil"],
  ["sonuc-kazanim", "sorunu-biliyor"],
  ["aci-korku", "sorunu-biliyor"],
  ["kimlik", "sorunu-biliyor"],
  ["sonuc-kazanim", "cozum-ariyor"],
  ["aci-korku", "cozum-ariyor"],
  ["sosyal-kanit", "cozum-ariyor"],
  ["kimlik", "cozum-ariyor"],
  ["sonuc-kazanim", "urunu-biliyor"],
  ["kimlik", "urunu-biliyor"],
  ["sosyal-kanit", "urunu-biliyor"],
  ["sonuc-kazanim", "sicak-musteri"],
  ["kimlik", "sicak-musteri"],
  ["sosyal-kanit", "sicak-musteri"],
];

/** Mock etiket satırı (kanıt doğrulanmış); ~1/6'sı henüz etiketlenmemiş (undefined). */
function mockLabelFor(item: ContentItem): ContentCreativeLabel | undefined {
  const h = hashString(item.id);
  if (h % 6 === 0) return undefined;
  const slots = item.owner.kind === "own" ? OWN_SLOTS : RIVAL_SLOTS;
  const [angle, funnelStage] = slots[Math.floor(h / 6) % slots.length] as Slot;
  return {
    contentItemId: item.id,
    angle,
    funnelStage,
    angleEvidence: "Örnek alıntı (mock): açıyı gösteren cümle.",
    funnelEvidence: "Örnek alıntı (mock): katmanı gösteren cümle.",
    evidenceVerified: true,
    promptVersion: "mock",
    labeledAt: item.firstSeenAt,
  };
}

export function createCreativeMatrixMethods(ctx: MockContext): CreativeMatrixMethods {
  const { state, clock, ws, requireWs, out } = ctx;

  return {
    async getCreativeMatrix(wsId, query = {}) {
      requireWs(wsId);
      const now = new Date(clock.nowMs);
      return out(
        buildCreativeMatrix(
          {
            workspaceId: ws.id,
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            analyses: state.analyses,
            labels: state.content.flatMap((item) => mockLabelFor(item) ?? []),
            offNicheContentIds: state.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
            ads: buildAdMatrixSource(mockAdDataset(ctx), now),
            now,
          },
          query,
        ),
      );
    },
  };
}
