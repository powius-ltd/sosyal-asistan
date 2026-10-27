/**
 * "Geçen hafta" sonucu: bir haftalık planın her öğesi için bağ durumu, yayın/süre, D+1/3/7 kontrol noktaları, D+7 lift/kademe ve
 * plan yönlerinin hükmü. SAF fonksiyon: mock ve Supabase aynı girdiyi kurar, burayı çağırır (kayıtlı `sections.review` yer
 * tutucudur; sonuç okuma anında hesaplanır, `now` çağıranın tek saatidir).
 *
 * Kurallar: içerik yalnız ONAYLI bağdan gelir (`awaiting_content` bağın içeriği yoktur → nokta yok, "henüz yayınlandı mı
 * bilinmiyor" değil "içerik bekleniyor"); bağ yoksa nokta/hüküm yok. Yön hükmü `directionOutcomes` (D+7 dışında lift yok).
 */
import type { DirectionReview, WeekReview, WeekReviewItem, WeekReviewSummary } from "@/lib/domain/outcomes";
import type { WeeklyPlan, WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { buildCheckpoints } from "@/lib/outcomes/checkpoints";
import type { OutcomeContent } from "@/lib/outcomes/content";
import { directionOutcomes } from "@/lib/outcomes/verdict";

export interface WeekReviewInput {
  plan: WeeklyPlan;
  /** Onaylı bağların içerikleri (içerik kimliği → hesap girdisi); bulunamayan içerik "yok" sayılır. */
  contents: ReadonlyMap<string, OutcomeContent>;
  /** Fikir kimliği → bekleyen otomatik öneri sayısı (yoksa 0). */
  suggestionCounts?: ReadonlyMap<string, number>;
  now: Date;
}

function reviewItem(item: WeeklyPlanItem, plan: WeeklyPlan, input: WeekReviewInput): WeekReviewItem {
  const { idea } = item;
  const link = idea.reelLink;
  const content = link?.status === "confirmed" && link.contentItemId !== undefined ? input.contents.get(link.contentItemId) : undefined;

  const checkpoints = content
    ? buildCheckpoints({
        publishedAt: content.publishedAt,
        snapshots: content.snapshots,
        followers: content.followers,
        baselineViews: content.baselineViews,
        baselineViewsKind: content.baselineViewsKind,
        now: input.now,
      })
    : [];
  const d7 = checkpoints.find((checkpoint) => checkpoint.day === 7);

  return {
    ideaId: item.ideaId,
    title: idea.title,
    position: item.position,
    plannedAt: item.slotAt,
    link,
    suggestionCount: input.suggestionCounts?.get(item.ideaId) ?? 0,
    publishedAt: content?.publishedAt,
    durationSec: content?.durationSec,
    checkpoints,
    // Yayın bilinmiyorsa (içerik yok) hangi yöne uyduğu da bilinmez: hüküm listesi boş.
    directions: content ? directionOutcomes(plan.sections.focus.directions, idea, content, d7) : [],
  };
}

function summarize(items: readonly WeekReviewItem[]): WeekReviewSummary {
  const verdicts = items.flatMap((item) => item.directions.map((d) => d.verdict));
  return {
    planned: items.length,
    linked: items.filter((item) => item.link !== undefined).length,
    measuredD7: items.filter((item) => item.checkpoints.some((c) => c.day === 7 && c.status === "measured")).length,
    held: verdicts.filter((v) => v === "held").length,
    missed: verdicts.filter((v) => v === "missed").length,
    unmeasured: verdicts.filter((v) => v === "unmeasured").length,
  };
}

/** Planın odak yönlerinin hafta toplamı: her plan yönü için bir satır vardır (hiçbir yayın uymadıysa sayılar 0: hüküm verilmedi). */
function reviewDirections(plan: WeeklyPlan, items: readonly WeekReviewItem[]): DirectionReview[] {
  return plan.sections.focus.directions.map((direction) => {
    const outcomes = items.flatMap((item) => item.directions.filter((d) => d.group === direction.group && d.value === direction.value));
    return {
      group: direction.group,
      value: direction.value,
      label: direction.label,
      held: outcomes.filter((o) => o.verdict === "held").length,
      missed: outcomes.filter((o) => o.verdict === "missed").length,
      unmeasured: outcomes.filter((o) => o.verdict === "unmeasured").length,
    };
  });
}

export function buildWeekReview(input: WeekReviewInput): WeekReview {
  const { plan } = input;
  const items = [...plan.items]
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.ideaId.localeCompare(b.ideaId))
    .map((item) => reviewItem(item, plan, input));
  return {
    planId: plan.id,
    weekStart: plan.weekStart,
    planGeneratedAt: plan.generatedAt,
    computedAt: input.now.toISOString(),
    items,
    directions: reviewDirections(plan, items),
    summary: summarize(items),
  };
}
