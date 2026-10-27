import { PlanSection } from "@/components/weekly-plan/plan-section";
import type { UnmeasuredInsight } from "@/lib/domain/insights";
import { COMPARISON_PLAIN, INSIGHT_SECTION_PLAIN, plainOrFallback } from "@/lib/plain-language-results";

/**
 * Hesaplanamayan bölümler ve sebepleri: boş tablo yerine neden boş olduğu yazılır (dürüstlük yüzeyi). Hiç yoksa bunu söyler ve tablodaki
 * "—" hücrelerinin sebebinin üzerine gelince yazdığını belirtir (boş durum tablodaki tireyle çelişmesin). Sunucu sebebi jargon taşıyorsa
 * yerine genel cümle yazılır.
 */
export function UnmeasuredInsights({ items }: { items: UnmeasuredInsight[] }) {
  const { unmeasured } = COMPARISON_PLAIN;
  return (
    <PlanSection id="unmeasured" title={unmeasured.title} description={unmeasured.description}>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{unmeasured.none}</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {items.map((item) => (
            <li key={`${item.section}:${item.reason}`} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
              <span className="w-56 shrink-0 font-medium">{INSIGHT_SECTION_PLAIN[item.section] ?? item.section}</span>
              <span className="text-muted-foreground">{plainOrFallback(item.reason, unmeasured.fallback)}</span>
            </li>
          ))}
        </ul>
      )}
    </PlanSection>
  );
}
