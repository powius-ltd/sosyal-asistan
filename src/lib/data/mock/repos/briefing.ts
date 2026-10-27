/**
 * Mock depo: Analist brifingi. Tohumlu, DOLU bir brifing döner (kart mock'ta boş görünmesin): maddeler mock verinin gerçek
 * içeriklerine, matris hücresine ve plan haftasına bağlanır (ref'ler mock depoda çözülür), sayılar mock verideki değerlerden gelir.
 * Biçim `briefingItemSchema` ile uyumludur (sözleşme süiti doğrular). Saat: depo saati; üretim anı son toplamadan SONRA kurulur
 * (taze brifing). Gerçek brifingi `brief:now` (Analist) yazar; mock yazma yolu sunmaz. Metinler müşteri dilindedir (`lib/plain-language.ts`,
 * `PLAIN_LANGUAGE_RULE`): panel jargonu (lift, baz çizgisi, medyan, hook, hücre, matris) yok, çarpan "normalinin X katı" diye yazılır.
 */
import { latestSuccessfulCollectionAt, type Briefing, type BriefingItem } from "@/lib/domain/briefing";
import { cellRef, contentRef, dueRef, planRef } from "@/lib/domain/briefing-refs";
import type { ContentItem } from "@/lib/domain/content";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { createCreativeMatrixMethods } from "@/lib/data/mock/repos/creative-matrix";
import { checkpointPhrase, liftPhrase } from "@/lib/plain-language";

export type BriefingMethods = Pick<PanelRepository, "getLatestBriefing">;

const HOUR_MS = 60 * 60 * 1000;
export const MOCK_BRIEFING_ID = "br_01";
export const MOCK_BRIEFING_PROMPT_VERSION = "mock";
export const MOCK_PERSONA_VERSION = "mock";

const isMeasured = (item: ContentItem): item is ContentItem & { score: { lift: number } } => item.format === "short_video" && item.score.lift !== undefined;
const confidenceOf = (item: ContentItem): ConfidenceLevel => (item.score.lowConfidence ? "low" : "medium");

/** Lift'e göre en iyi (eşitlikte kimlik); ölçülenler içinde. */
function topByLift(items: readonly ContentItem[]): (ContentItem & { score: { lift: number } }) | undefined {
  return items.filter(isMeasured).sort((a, b) => b.score.lift - a.score.lift || (a.id < b.id ? -1 : 1))[0];
}

export function createBriefingMethods(ctx: MockContext): BriefingMethods {
  const { state, clock, ws, inWs, out } = ctx;

  return {
    async getLatestBriefing(wsId) {
      if (!inWs(wsId)) return null;
      const ownTop = topByLift(state.content.filter((c) => c.owner.kind === "own"));
      const rivalTop = topByLift(state.content.filter((c) => c.owner.kind === "competitor"));
      const matrix = await createCreativeMatrixMethods(ctx).getCreativeMatrix(ws.id);
      const opportunity = matrix.opportunities[0];
      const plan = [...state.weeklyPlans].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
      const planned = plan?.itemRefs.filter((r) => r.position !== undefined).length ?? 0;
      const ownLift = liftPhrase(ownTop?.score.lift);
      const rivalLift = liftPhrase(rivalTop?.score.lift);
      const oppLift = liftPhrase(opportunity?.rivals.medianLift);

      const items: BriefingItem[] = [];
      if (ownTop && ownLift) {
        items.push({
          kind: "worked",
          headline: "Son 90 günde en iyi videon normalinin üstünde izlendi",
          body: `@${ownTop.owner.handle} videosu ${ownLift}. Tek video: tesadüf olabilir, ikinci bir örnek bekle.`,
          evidence: [contentRef(ownTop.id)],
          confidence: confidenceOf(ownTop),
        });
      }
      if (rivalTop && rivalLift) {
        items.push({
          kind: "changed",
          headline: "Rakiplerde dikkat çeken bir video var",
          body: `@${rivalTop.owner.handle} hesabının videosu ${rivalLift}. Açılışına bakmaya değer.`,
          evidence: [contentRef(rivalTop.id)],
          confidence: confidenceOf(rivalTop),
        });
      }
      if (opportunity && oppLift) {
        items.push({
          kind: "opportunity",
          headline: "Henüz denemediğin bir yaklaşım var",
          body: `Rakiplerin ${opportunity.rivals.n} videosu bu yaklaşımda tipik olarak ${oppLift}, sen hiç denemedin. Örnek az: zayıf sinyal olarak oku.`,
          evidence: [cellRef(opportunity.stage, opportunity.angle)],
          action: { type: "open_matrix", label: "Yaklaşımı aç", target: cellRef(opportunity.stage, opportunity.angle), spendsMoney: false },
          confidence: opportunity.rivals.confidence,
        });
      }
      if (plan) {
        items.push({
          kind: "next_step",
          headline: "Bu haftanın planı onayını bekliyor",
          body: `${planned} içerik planlandı. Planı gözden geçirip onaylarsan takvim netleşir.`,
          evidence: [planRef(plan.weekStart)],
          action: { type: "open_plan", label: "Planı aç", target: planRef(plan.weekStart), spendsMoney: false },
          confidence: plan.confidence ?? "low",
        });
      }
      if (ownTop) {
        items.push({
          kind: "pending",
          headline: `Bir videonun ${checkpointPhrase(7)} geldi`,
          body: "Bu ölçüm para harcar ve onayın olmadan çalışmaz. Hazır olduğunda ölçümü kendin başlat.",
          evidence: [dueRef(ownTop.id, 7)],
          action: { type: "run_cmd", label: "Ölçüm koşusu", commandId: "measure", spendsMoney: true },
          confidence: "medium",
        });
      }

      const lastCollectedAt = latestSuccessfulCollectionAt(state.runs);
      const collectedMs = lastCollectedAt === undefined ? 0 : Date.parse(lastCollectedAt);
      const briefing: Briefing = {
        id: MOCK_BRIEFING_ID,
        agent: "analyst",
        generatedAt: new Date(Math.max(collectedMs, clock.nowMs - 2 * HOUR_MS)).toISOString(),
        items,
        basis: {
          analyzedCount: state.analyses.filter((a) => a.status === "ok").length,
          labeledCount: matrix.labeledCount,
          ...(lastCollectedAt === undefined ? {} : { lastCollectedAt }),
          ...(plan === undefined ? {} : { planWeek: plan.weekStart }),
        },
        promptVersion: MOCK_BRIEFING_PROMPT_VERSION,
        personaVersion: MOCK_PERSONA_VERSION,
        model: "mock",
      };
      return out(briefing);
    },
  };
}
