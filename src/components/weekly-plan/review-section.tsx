import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { planWeekLabel } from "@/components/ideas/plan-link";
import { ReviewTable } from "@/components/weekly-plan/review-table";
import type { OptionalRead } from "@/components/weekly-plan/optional-read";
import type { WeekReview } from "@/lib/domain/outcomes";
import type { Platform } from "@/lib/platforms/types";
import { contentNoun } from "@/lib/platforms/text";
import { REVIEW_PLAIN } from "@/lib/plain-language-plan";

/** Okuma sonucu: bir plan ya da `null` (o hafta için plan yok); `available: false` = veri kaynağı bunu henüz desteklemiyor. */
export type WeekReviewRead = OptionalRead<WeekReview | null>;

function Summary({ review }: { review: WeekReview }) {
  return <p className="text-sm text-muted-foreground">{REVIEW_PLAIN.summary(review.summary)}</p>;
}

/**
 * Bölüm 6 — Geçen hafta: bir önceki haftanın PLANI nasıl sonuçlandı (okuma anında hesaplanır; kayıtlı `sections.review` yer tutucudur,
 * kullanılmaz). Plan yoksa ya da veri kaynağı desteklemiyorsa sebep yazılır; ölçülemeyen hücre "—" + sebeptir (0 değil). `platform`:
 * içerik türünün adı ("Reels" / "video") platformdan gelir; bilinmiyorsa tarafsız "video".
 */
export function ReviewSectionView({ review, platform }: { review: WeekReviewRead; platform?: Platform }) {
  return (
    <PlanSection
      id="review"
      title="Geçen hafta"
      description={review.value ? REVIEW_PLAIN.intro(planWeekLabel(review.value.weekStart)) : undefined}
    >
      {!review.available ? (
        <PlanNote>Geçen hafta sonucu bu veri kaynağında henüz okunamıyor.</PlanNote>
      ) : review.value === null ? (
        <PlanNote>Geçen hafta için kayıtlı plan yok; sonuç, plan hazırlandıktan ve içerikler yayınlandıktan sonra burada görünür.</PlanNote>
      ) : review.value.items.length === 0 ? (
        <PlanNote>Geçen haftanın planında içerik yok.</PlanNote>
      ) : (
        <div className="flex flex-col gap-3">
          <Summary review={review.value} />
          <ReviewTable items={review.value.items} noun={contentNoun(platform)} />
        </div>
      )}
    </PlanSection>
  );
}
