import { AvoidSectionView } from "@/components/weekly-plan/avoid-section";
import { FocusSectionView } from "@/components/weekly-plan/focus-section";
import { PlanHeader } from "@/components/weekly-plan/plan-header";
import { PlanItemsSection } from "@/components/weekly-plan/plan-items-section";
import { ReviewSectionView, type WeekReviewRead } from "@/components/weekly-plan/review-section";
import { ScheduleSectionView } from "@/components/weekly-plan/schedule-section";
import { WinnersSectionView } from "@/components/weekly-plan/winners-section";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";

/** Geçen hafta sonucu okunamadıysa (ya da çağıran vermediyse) bölüm "henüz okunamıyor" der; plan yine çizilir. */
const REVIEW_UNAVAILABLE: WeekReviewRead = { available: false, value: undefined };

/**
 * Bir haftalık planın tüm bölümleri, sırayla: ne tuttu → yönler → içerikler → takvim → kaçın → geçen hafta. `review` = bir önceki
 * haftanın planının sonucu (sayfa okur: okuma anında hesaplanır).
 */
export function WeeklyPlanView({
  plan,
  review = REVIEW_UNAVAILABLE,
  orderIdByIdea,
}: {
  plan: WeeklyPlan;
  review?: WeekReviewRead;
  /** Fikir kimliği → etkin fiş kimliği (sayfa okur); plan öğesinde "Fişi aç" / "Fiş hazırla" düğmesi bundan türer. */
  orderIdByIdea?: Readonly<Record<string, string>>;
}) {
  const { sections } = plan;
  return (
    <div className="flex flex-col gap-10">
      <PlanHeader plan={plan} />
      <WinnersSectionView winners={sections.winners} />
      <FocusSectionView focus={sections.focus} />
      <PlanItemsSection
        items={plan.items}
        alternatives={plan.alternatives}
        audienceTimeZone={sections.schedule.audienceTimeZone}
        orderIdByIdea={orderIdByIdea}
      />
      <ScheduleSectionView schedule={sections.schedule} weekStart={plan.weekStart} items={plan.items} />
      <AvoidSectionView avoid={sections.avoid} />
      <ReviewSectionView review={review} platform={plan.platform} />
    </div>
  );
}
