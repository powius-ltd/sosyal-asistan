import { ScrollHint } from "@/components/common/scroll-hint";
import { TopicHookCellView } from "@/components/matrix/topic-hook-cell";
import type { TopicCellRef } from "@/lib/matrix/topic-cell-param";
import type { TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { formatNumber } from "@/lib/format";
import { TOPIC_MAP_PLAIN } from "@/lib/matrix/plain";
import { openingTypeLabel } from "@/lib/plain-language-results";

/** Hücre sütunu en az bu genişlikte (rem): 13 hook türünün hepsi dolsa bile yatay kayar, 1440 px'te boş sütunlar gizli olduğundan sığar. */
const COLUMN_REM = 9;
const LABEL_REM = 11;

/**
 * Satır = konu grubu, sütun = açılış tarzı. Hiçbir satırda videosu olmayan açılış sütunları gizlenir (13 tarzın çoğu boş kalır; gizlenen sayısı
 * altta yazılır). Kutular `row.cells`'ten açılış tarzıyla bulunur: sıra varsayımı yok. Dar ekranda yatay kayar: ilk sütun (konu) yapışkan, kaydırma ipucu görünür.
 */
export function TopicHookGrid({ matrix, selected, video }: { matrix: TopicHookMatrix; selected?: TopicCellRef; video?: string }) {
  const used = new Set(matrix.rows.flatMap((row) => row.cells.filter((cell) => cell.own.n + cell.rivals.n > 0).map((cell) => cell.hookType)));
  const hooks = matrix.hookTypes.filter((hook) => used.has(hook));
  const hidden = matrix.hookTypes.length - hooks.length;
  const showRivals = matrix.rows.some((row) => row.rivals.n > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <ScrollHint label={TOPIC_MAP_PLAIN.gridLabel}>
        <table className="w-full table-fixed border-separate border-spacing-1.5 text-sm" style={{ minWidth: `${LABEL_REM + hooks.length * COLUMN_REM}rem` }}>
          <caption className="sr-only">{TOPIC_MAP_PLAIN.caption}</caption>
          <colgroup>
            <col style={{ width: `${LABEL_REM}rem` }} />
            {hooks.map((hook) => (
              <col key={hook} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-background px-1 pb-1 text-left text-xs font-medium text-muted-foreground">
                {TOPIC_MAP_PLAIN.corner}
              </th>
              {hooks.map((hook) => (
                <th key={hook} scope="col" className="px-1 pb-1 text-left text-sm font-semibold">
                  {openingTypeLabel(hook)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="sticky left-0 z-10 bg-background px-1 py-1 text-left align-top">
                  <span className="block text-sm font-semibold">{row.label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground tabular">
                    {formatNumber(row.own.n)} {TOPIC_MAP_PLAIN.own}{showRivals ? ` · ${formatNumber(row.rivals.n)} ${TOPIC_MAP_PLAIN.rival}` : ""}
                  </span>
                </th>
                {hooks.map((hook) => {
                  const cell = row.cells.find((c) => c.hookType === hook);
                  return (
                    <td key={hook} className="h-px p-0 align-top">
                      {cell ? <TopicHookCellView cell={cell} label={row.label} selected={selected?.clusterKey === row.key && selected.hookType === hook} showRivals={showRivals} video={video} /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollHint>
      {hidden > 0 ? <p className="text-xs text-muted-foreground">{TOPIC_MAP_PLAIN.hidden(formatNumber(hidden) ?? "0")}</p> : null}
    </div>
  );
}
