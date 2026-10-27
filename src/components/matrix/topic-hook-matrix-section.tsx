import { Shapes } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { MATRIX_FILL_JOB } from "@/components/matrix/matrix-copy";
import { MatrixNote } from "@/components/matrix/matrix-note";
import { TOPIC_SECTION_ANCHOR } from "@/components/matrix/topic-hook-cell";
import { TopicCellDetail } from "@/components/matrix/topic-cell-detail";
import { TopicHookGrid } from "@/components/matrix/topic-hook-grid";
import { TopicOpportunities, TopicWinners } from "@/components/matrix/topic-highlights";
import { topicLabel } from "@/components/matrix/topic-text";
import { JobCommand } from "@/components/workspace/job-command";
import type { TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { formatNumber } from "@/lib/format";
import { plainOrFallback } from "@/lib/plain-language-results";
import { TOPIC_MAP_PLAIN } from "@/lib/matrix/plain";
import type { TopicCellRef } from "@/lib/matrix/topic-cell-param";

/** Kümeleri oluşturan iş: kümeler yokken gösterilen tek yol (plan hazırlanırken yazılır; haftalık tur da planı hazırlar). */
const CLUSTER_JOB = { kind: MATRIX_FILL_JOB.topic_hook } as const;

interface TopicHookMatrixSectionProps {
  matrix: TopicHookMatrix;
  /** `?konu=` ile seçili kutu (doğrulanmış); haritada olmayan konu seçimsiz sayılır. */
  selected?: TopicCellRef;
  /** Adreste `?konu=` vardı (geçerli ya da değil): kutu bulunamazsa tek cümleyle söylenir. */
  requested?: boolean;
  /** `?video=` (anatomi bölümünün video seçimi): hücre bağlantıları bunu korur. */
  video?: string;
}

/**
 * Konu ve açılış haritası bölümü (içerik üreticisi ve karma hesap): kendi tutanların, fırsatlar, satır = konu grubu × sütun = açılış tarzı harita ve
 * seçili kutunun ayrıntısı. Veri `getTopicHookMatrix`; burada hesap yoktur (durum, sıra, cümle koddan gelir). Rakip yoksa rakip tarafı hiç
 * çizilmez ve öğrenme kaynağı kendi tutanlarındır. Küme yoksa tablo yerine açıklayıcı boş durum + "Planı hazırla" iş düğmesi (yalnız
 * yönetici görür; işler kapalıyken yerine komut metni yedek kalır).
 */
export function TopicHookMatrixSection({ matrix, selected, requested = false, video }: TopicHookMatrixSectionProps) {
  const selectedCell = selected && matrix.rows.find((row) => row.key === selected.clusterKey)?.cells.find((cell) => cell.hookType === selected.hookType);
  const hasRivals = matrix.rows.some((row) => row.rivals.n > 0);
  return (
    <section aria-labelledby={TOPIC_SECTION_ANCHOR} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id={TOPIC_SECTION_ANCHOR} className="scroll-mt-4 text-lg font-semibold tracking-tight">
          {TOPIC_MAP_PLAIN.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{TOPIC_MAP_PLAIN.intro(formatNumber(matrix.scope.days) ?? "", hasRivals)}</p>
        <p className="text-sm" data-testid="topic-counters">
          <span className="font-medium tabular">{formatNumber(matrix.clusteredCount)}</span> {TOPIC_MAP_PLAIN.counters.grouped}
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium tabular">{formatNumber(matrix.unclusteredCount)}</span> {TOPIC_MAP_PLAIN.counters.ungrouped}
          {!hasRivals && matrix.clusteredCount > 0 ? <span className="text-muted-foreground"> · {TOPIC_MAP_PLAIN.counters.noRivals}</span> : null}
        </p>
      </header>

      {requested && !selectedCell ? <MatrixNote>{TOPIC_MAP_PLAIN.missing}</MatrixNote> : null}

      {matrix.clusteredCount === 0 ? (
        <EmptyState
          icon={Shapes}
          title={TOPIC_MAP_PLAIN.empty.title}
          description={
            <>
              {matrix.unmeasuredReason ? <span className="block">{plainOrFallback(matrix.unmeasuredReason, TOPIC_MAP_PLAIN.empty.note)}</span> : null}
              <span className="mt-1 block">{TOPIC_MAP_PLAIN.empty.note}</span>
            </>
          }
          action={<JobCommand request={CLUSTER_JOB} className="items-center" />}
        />
      ) : (
        <>
          <TopicWinners matrix={matrix} video={video} />
          <TopicOpportunities matrix={matrix} hasRivals={hasRivals} video={video} />
          <TopicHookGrid matrix={matrix} selected={selected} video={video} />
          <p className="text-xs text-muted-foreground">{TOPIC_MAP_PLAIN.footnote}</p>
          {selectedCell && selected ? <TopicCellDetail cell={selectedCell} label={topicLabel(matrix, selected.clusterKey)} showRivals={hasRivals} video={video} /> : null}
        </>
      )}
    </section>
  );
}
