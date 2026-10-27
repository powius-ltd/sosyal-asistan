import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { confidencePhrase } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

/** Güven düzeyinin dolu dilim sayısı (3 üzerinden). */
export const CONFIDENCE_SEGMENTS: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

const SEGMENT_COUNT = 3;

/**
 * Güven ölçeği: 3 dilim + düz dil yazısı ("kısmen eminim"). Düzeyi RENK değil dolu dilim SAYISI söyler (tek renk); dilimler süs
 * sayılır (`aria-hidden`), ekran okuyucu "Güven: kısmen eminim" duyar.
 */
export function ConfidenceMeter({ level, className }: { level: ConfidenceLevel; className?: string }) {
  const filled = CONFIDENCE_SEGMENTS[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} data-confidence={level}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
          <span
            key={index}
            data-filled={index < filled}
            className={cn("h-1.5 w-2.5 rounded-[1px]", index < filled ? "bg-confidence-fill" : "bg-confidence-track")}
          />
        ))}
      </span>
      <span>
        <span className="sr-only">Güven: </span>
        {confidencePhrase(level)}
      </span>
    </span>
  );
}
