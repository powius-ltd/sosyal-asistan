import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import { Badge } from "@/components/ui/badge";
import type { AvoidEntry, AvoidSection } from "@/lib/domain/weekly-plan";
import { AVOID_KIND_PLAIN, AVOID_PLAIN, avoidGroupPlain, plainOrFallback } from "@/lib/plain-language-plan";

/**
 * Sebep cümlesi: normalin altında kalan grupta yapısal alanlardan kurulur (sunucunun cümlesi "medyan … lift" diyebilir); konu dışı
 * videoda sunucu cümlesi kullanılır, panel jargonu taşıyorsa genel cümleye düşer.
 */
const reasonOf = (entry: AvoidEntry): string =>
  entry.kind === "low_lift" ? AVOID_PLAIN.lowSentence(entry.label, entry.sampleSize, entry.medianLift) : plainOrFallback(entry.reason, AVOID_PLAIN.offNicheFallback);

/** Bölüm 5 — Kaçın: en az 2 videolu, normalin altında kalan gruplar ve konu dışı videolar. */
export function AvoidSectionView({ avoid }: { avoid: AvoidSection }) {
  return (
    <PlanSection id="avoid" title="Kaçın" description="Ölçülen veride zayıf kalan gruplar ve hesabının konusunun dışındaki videolar.">
      {avoid.entries.length === 0 ? (
        <PlanNote>{AVOID_PLAIN.empty}</PlanNote>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {avoid.entries.map((entry) => (
            <li key={`${entry.kind}:${entry.group}:${entry.value}`} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={entry.kind === "off_niche" ? "outline" : "secondary"}>{AVOID_KIND_PLAIN[entry.kind]}</Badge>
                <span className="font-medium">{entry.label}</span>
                <span className="text-xs text-muted-foreground">{avoidGroupPlain(entry)}</span>
                <ConfidenceBadge level={entry.confidence} sampleSize={entry.sampleSize} className="ml-auto" />
              </div>
              <p className="text-muted-foreground">{reasonOf(entry)}</p>
            </li>
          ))}
        </ul>
      )}
    </PlanSection>
  );
}
