import { PlanItemCard } from "@/components/weekly-plan/plan-item-card";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { Badge } from "@/components/ui/badge";
import type { WeeklyPlanItem } from "@/lib/domain/weekly-plan";
import { ALTERNATIVES_PLAIN, OPENING_PLAIN } from "@/lib/plain-language-plan";

/** Yedekte bekleyenler: hazırlandı ama plana alınmadı; sade liste (başlık, açılış tarzı, kaç videoya dayandığı). */
function Alternatives({ items }: { items: WeeklyPlanItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{ALTERNATIVES_PLAIN.title}</h3>
      <p className="text-xs text-muted-foreground">{ALTERNATIVES_PLAIN.intro}</p>
      <ul className="divide-y rounded-xl border text-sm">
        {items.map((item) => (
          <li key={item.ideaId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="min-w-0 flex-1 font-medium">{item.idea.title}</span>
            <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              {item.idea.hookType ? <Badge variant="secondary">{OPENING_PLAIN.badge(item.idea.hookType)}</Badge> : null}
              <span className="tabular">{ALTERNATIVES_PLAIN.basis(item.idea.evidence.length)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bölüm 3 — İçerikler: plana alınan 3–5 fikir + ayrı, sade yedek listesi. */
export function PlanItemsSection({
  items,
  alternatives,
  audienceTimeZone,
  orderIdByIdea,
}: {
  items: WeeklyPlanItem[];
  alternatives: WeeklyPlanItem[];
  audienceTimeZone: string;
  /** Fikir kimliği → etkin fiş kimliği (sayfa düzeyinde tek okuma). */
  orderIdByIdea?: Readonly<Record<string, string>>;
}) {
  return (
    <PlanSection
      id="items"
      title="İçerikler"
      description="Bu hafta çekilecek içerikler: önerilen paylaşım saati, açılış cümleleri, script ve dayandığı videolar."
    >
      {items.length === 0 ? (
        <PlanNote>Bu plana alınmış içerik yok.</PlanNote>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.ideaId}>
              <PlanItemCard item={item} audienceTimeZone={audienceTimeZone} orderId={orderIdByIdea?.[item.ideaId]} />
            </li>
          ))}
        </ol>
      )}
      {alternatives.length > 0 ? <Alternatives items={alternatives} /> : null}
    </PlanSection>
  );
}
