import { Grid2x2X } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { CellDetail } from "@/components/matrix/cell-detail";
import { MATRIX_FILL_JOB } from "@/components/matrix/matrix-copy";
import { MatrixGrid } from "@/components/matrix/matrix-grid";
import { MatrixNote } from "@/components/matrix/matrix-note";
import { OpportunityList } from "@/components/matrix/opportunity-list";
import { JobCommand } from "@/components/workspace/job-command";
import type { CreativeMatrix } from "@/lib/domain/creative-matrix";
import { formatNumber } from "@/lib/format";
import { adUnlabeledPhrase } from "@/lib/plain-language-ads";
import type { MatrixCellRef } from "@/lib/matrix/cell-param";
import { ANGLE_MAP_PLAIN } from "@/lib/matrix/plain";
import { plainOrFallback } from "@/lib/plain-language-results";

/** Etiketleme işi: etiket yokken / eksikken gösterilen tek yol (yalnız yönetici görür; işler kapalıyken yerine komut metni yedek kalır). */
const LABEL_JOB = { kind: MATRIX_FILL_JOB.angle_funnel } as const;

interface CreativeMatrixSectionProps {
  matrix: CreativeMatrix;
  /** `?hucre=` ile seçili kutu (doğrulanmış); yoksa ayrıntı gösterilmez. */
  selected?: MatrixCellRef;
  /** Adreste `?hucre=` vardı (geçerli ya da değil): kutu bulunamazsa tek cümleyle söylenir. */
  requested?: boolean;
  /** `?video=` (anatomi bölümünün video seçimi): kutu bağlantıları bunu korur. */
  video?: string;
  /** Yönetici modu (`isOperatorMode()`): reklam işareti, reklam ayrıntısı ve etiketsiz reklam notu yalnız bu durumda çizilir. */
  operator?: boolean;
}

/**
 * Yaklaşım haritası bölümü: denemediğin yaklaşımlar, 5 × 4 harita (izleyici × yaklaşım) ve seçili kutunun ayrıntısı. Veri `getCreativeMatrix`;
 * burada hesap yoktur (durum, sıra, cümle koddan gelir). Videolara bakılmamışsa tablo yerine açıklayıcı boş durum; sayaç bakılan/bakılmayan
 * video sayısını söyler. Bakılmamış video varken "Açıları etiketle" iş düğmesi çizilir (hiç bakılmamışsa boş durumda, kısmen bakıldıysa
 * sayacın altında). Adresteki kutu haritada yoksa tek cümleyle söylenir.
 */
export function CreativeMatrixSection({ matrix, selected, requested = false, video, operator = false }: CreativeMatrixSectionProps) {
  const selectedCell = selected && matrix.cells.find((c) => c.stage === selected.stage && c.angle === selected.angle);
  const { counters, empty } = ANGLE_MAP_PLAIN;
  const unlabeledAds = adUnlabeledPhrase(matrix.unlabeledAdCount ?? 0);
  return (
    <section aria-labelledby="creative-matrix-title" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id="creative-matrix-title" className="text-lg font-semibold tracking-tight">
          {ANGLE_MAP_PLAIN.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{ANGLE_MAP_PLAIN.intro(formatNumber(matrix.scope.days) ?? "")}</p>
        <p className="text-sm" data-testid="matrix-counters">
          <span className="font-medium tabular">{formatNumber(matrix.labeledCount)}</span> {counters.looked}
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium tabular">{formatNumber(matrix.unlabeledCount)}</span> {counters.notLooked}
        </p>
        {matrix.unlabeledCount > 0 && matrix.labeledCount > 0 ? <JobCommand request={LABEL_JOB} lead={empty.lead} /> : null}
      </header>

      {requested && !selectedCell ? <MatrixNote>{ANGLE_MAP_PLAIN.missing}</MatrixNote> : null}

      {matrix.labeledCount === 0 ? (
        <EmptyState
          icon={Grid2x2X}
          title={empty.title}
          description={plainOrFallback(matrix.unmeasuredReason, empty.fallback)}
          action={<JobCommand request={LABEL_JOB} lead={empty.lead} className="items-center" />}
        />
      ) : (
        <>
          <OpportunityList opportunities={matrix.opportunities} video={video} operator={operator} />
          <MatrixGrid matrix={matrix} selected={selected} video={video} operator={operator} />
          <p className="text-xs text-muted-foreground">{ANGLE_MAP_PLAIN.footnote}</p>
          {operator && unlabeledAds !== undefined ? <p className="text-xs text-muted-foreground" data-testid="matrix-unlabeled-ads">{unlabeledAds}</p> : null}
          {selectedCell ? <CellDetail cell={selectedCell} video={video} operator={operator} /> : null}
        </>
      )}
    </section>
  );
}
