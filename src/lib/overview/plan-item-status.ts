/**
 * Plan maddesinin müşteriye görünen durumu: Sırada · Çekilecek · Yayınlandı · Sonucu bekleniyor · sonuç. Plan kartı ve Özet'in
 * "senden beklediğim" satırı AYNI hesabı kullanır (tek kural). Kaynak: fikrin durumu + aktif Reels bağı (`Idea.reelLink`) ve
 * "Geçen hafta" okuması (`getWeekReview`: kontrol noktaları). Okuma yoksa (`review` undefined) sonuç iddia edilmez.
 */
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { CHECKPOINT_DAYS, type CheckpointDay, type WeekReview, type WeekReviewItem } from "@/lib/domain/outcomes";
import type { WeeklyPlan, WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { liftPhrase } from "@/lib/plain-language";

export type PlanItemStatusKind =
  | "next"
  | "to_shoot"
  | "not_shot"
  | "skipped"
  | "published"
  | "awaiting_result"
  | "result";

export const PLAN_ITEM_STATUS_LABEL: Record<PlanItemStatusKind, string> = {
  next: "Sırada",
  to_shoot: "Çekilecek",
  not_shot: "Çekilmedi",
  skipped: "Vazgeçildi",
  published: "Yayınlandı",
  awaiting_result: "Sonucu bekleniyor",
  result: "Sonuç geldi",
};

export interface PlanItemStatus {
  kind: PlanItemStatusKind;
  /** `result`: düz cümle ("normalinin 2,3 katı izlendi"). */
  resultPhrase?: string;
  /** `result`: video "tutan" eşiğine (normalinin en az 3 katı) ulaştı. */
  strongResult?: boolean;
  /** `awaiting_result`: sıradaki ölçüm günü (1/3/7). */
  waitingDay?: CheckpointDay;
}

const OUTLIER_MIN_LIFT = LIFT_TIER_MIN[OUTLIER_MIN_TIER];

function checkpointOf(reviewItem: WeekReviewItem | undefined, day: CheckpointDay) {
  return reviewItem?.checkpoints.find((checkpoint) => checkpoint.day === day);
}

/** Yayınlanmış bir maddenin durumu: 7. gün sonucu varsa sonuç, ölçüm sürüyorsa bekleniyor, aksi halde yalnız "yayınlandı". */
function publishedStatus(reviewItem: WeekReviewItem | undefined): PlanItemStatus {
  const day7 = checkpointOf(reviewItem, 7);
  if (day7?.status === "measured") {
    const phrase = liftPhrase(day7.lift);
    if (phrase !== undefined) {
      return { kind: "result", resultPhrase: phrase, strongResult: day7.lift !== undefined && day7.lift >= OUTLIER_MIN_LIFT };
    }
  }
  const pending = CHECKPOINT_DAYS.find((day) => {
    const status = checkpointOf(reviewItem, day)?.status;
    return status === "due" || status === "upcoming";
  });
  return pending === undefined ? { kind: "published" } : { kind: "awaiting_result", waitingDay: pending };
}

function isPublished(item: WeeklyPlanItem, reviewItem: WeekReviewItem | undefined): boolean {
  const link = reviewItem?.link ?? item.idea.reelLink;
  // `awaiting_content`: kullanıcı yayınladığı videonun bağlantısını yapıştırdı, video henüz toplanmadı: yine de yayınlanmıştır.
  return item.idea.status === "published" || link?.status === "confirmed" || link?.status === "awaiting_content";
}

/**
 * `plan.items` ile aynı sırada durumlar. Yayınlanmamış ilk madde "Sırada", sonrakiler "Çekilecek"; plan geçmiş haftaysa
 * (`currentWeekStart`'tan eski) yayınlanmamışlar "Çekilmedi" olur (sıra yok).
 */
export function planItemStatuses(plan: WeeklyPlan, review: WeekReview | null | undefined, currentWeekStart?: string): PlanItemStatus[] {
  const stale = currentWeekStart !== undefined && plan.weekStart < currentWeekStart;
  let nextTaken = false;
  return plan.items.map((item) => {
    const reviewItem = review?.items.find((entry) => entry.ideaId === item.ideaId);
    if (isPublished(item, reviewItem)) return publishedStatus(reviewItem);
    if (item.idea.status === "dismissed") return { kind: "skipped" };
    if (stale) return { kind: "not_shot" };
    if (nextTaken) return { kind: "to_shoot" };
    nextTaken = true;
    return { kind: "next" };
  });
}

/** Sıradaki çekim (durumu `next` olan madde); yoksa undefined. */
export function nextPlanItem(plan: WeeklyPlan, statuses: readonly PlanItemStatus[]): WeeklyPlanItem | undefined {
  const index = statuses.findIndex((status) => status.kind === "next");
  return index === -1 ? undefined : plan.items[index];
}
