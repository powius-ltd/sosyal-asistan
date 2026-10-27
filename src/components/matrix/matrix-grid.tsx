import { ScrollHint } from "@/components/common/scroll-hint";
import { MatrixCell } from "@/components/matrix/matrix-cell";
import { CREATIVE_ANGLES, FUNNEL_STAGES, type CreativeMatrix, type CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import type { MatrixCellRef } from "@/lib/matrix/cell-param";
import { ANGLE_COLUMN_PLAIN, ANGLE_MAP_PLAIN, STAGE_ROW_PLAIN } from "@/lib/matrix/plain";

/**
 * 5 satır (izleyici + zihinsel durum cümlesi) × 4 sütun (yaklaşım). Kutular `matrix.cells`'ten (stage, angle) ile bulunur: sıra
 * varsayımı yok. Dar ekranda yatay kayar (en az 56 rem): ilk sütun (izleyici) yapışkan, kenarda kaydırma gölgesi ve "yana kaydır" ipucu
 * görünür; 1440 px'te taşmaz (sabit sütun payı, kutu içeriği kırılır).
 */
export function MatrixGrid({ matrix, selected, video, operator = false }: { matrix: CreativeMatrix; selected?: MatrixCellRef; video?: string; operator?: boolean }) {
  const cells = new Map<string, CreativeMatrixCell>(matrix.cells.map((cell) => [`${cell.stage}|${cell.angle}`, cell]));
  return (
    <ScrollHint label={ANGLE_MAP_PLAIN.gridLabel}>
      <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-1.5 text-sm">
        <caption className="sr-only">{ANGLE_MAP_PLAIN.caption}</caption>
        <colgroup>
          <col className="w-40" />
          {CREATIVE_ANGLES.map((angle) => (
            <col key={angle.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-background px-1 pb-1 text-left text-xs font-medium text-muted-foreground">
              {ANGLE_MAP_PLAIN.corner}
            </th>
            {CREATIVE_ANGLES.map((angle) => (
              <th key={angle.id} scope="col" className="px-1 pb-1 text-left text-sm font-semibold">
                {ANGLE_COLUMN_PLAIN[angle.id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FUNNEL_STAGES.map((stage) => (
            <tr key={stage.id}>
              <th scope="row" className="sticky left-0 z-10 bg-background px-1 py-1 text-left align-top">
                <span className="block text-sm font-semibold">
                  <span className="tabular text-muted-foreground">{stage.order} · </span>
                  {STAGE_ROW_PLAIN[stage.id]}
                </span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">“{stage.mindset}”</span>
              </th>
              {CREATIVE_ANGLES.map((angle) => {
                const cell = cells.get(`${stage.id}|${angle.id}`);
                return (
                  <td key={angle.id} className="h-px p-0 align-top">
                    {cell ? <MatrixCell cell={cell} selected={selected?.stage === stage.id && selected.angle === angle.id} video={video} operator={operator} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollHint>
  );
}
