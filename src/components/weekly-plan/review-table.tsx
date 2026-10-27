import { CheckpointCell, checkpointOf, LiftCell, LinkCell, VerdictCell } from "@/components/weekly-plan/review-cells";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHECKPOINT_DAYS, CHECKPOINT_LABEL, type WeekReviewItem } from "@/lib/domain/outcomes";
import { DEFAULT_TIMEZONE, formatDateTime } from "@/lib/format";
import { REVIEW_PLAIN } from "@/lib/plain-language-plan";

function ItemTitle({ item }: { item: WeekReviewItem }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {item.position === undefined ? "" : `${item.position}. `}
        {item.title}
      </span>
      {item.plannedAt ? <span className="text-xs text-muted-foreground">Planlanan: {formatDateTime(item.plannedAt, DEFAULT_TIMEZONE)}</span> : null}
    </div>
  );
}

/** Dar ekranda tablo yerine kart listesi: yatay kaydırma ve gizli sütun yok (D2-04). `md`+ ta gizlidir. */
function ReviewCards({ items, noun }: { items: readonly WeekReviewItem[]; noun: string }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label="Geçen haftanın içerikleri">
      {items.map((item) => (
        <li key={item.ideaId} className="flex flex-col gap-3 rounded-xl border p-3 text-sm">
          <ItemTitle item={item} />
          <LinkCell item={item} noun={noun} />
          <dl className="grid grid-cols-3 gap-2">
            {CHECKPOINT_DAYS.map((day) => (
              <div key={day} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{CHECKPOINT_LABEL[day]}</dt>
                <dd>
                  <CheckpointCell checkpoint={checkpointOf(item, day)} align="start" />
                </dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{REVIEW_PLAIN.columns.day7}</dt>
              <dd>
                <LiftCell checkpoint={checkpointOf(item, 7)} />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{REVIEW_PLAIN.columns.verdict}</dt>
              <dd>
                <VerdictCell item={item} />
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** "Geçen hafta": plan öğesi, yayın durumu, 1/3/7. gün izlenmesi, 7. gün durumu, yön hükmü. Dar ekranda kart listesi, `md`+ ta tablo. */
export function ReviewTable({ items, noun }: { items: readonly WeekReviewItem[]; noun: string }) {
  return (
    <>
      <ReviewCards items={items} noun={noun} />
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{REVIEW_PLAIN.columns.item}</TableHead>
              <TableHead>{REVIEW_PLAIN.columns.link}</TableHead>
              {CHECKPOINT_DAYS.map((day) => (
                <TableHead key={day} className="text-right">
                  {CHECKPOINT_LABEL[day]}
                </TableHead>
              ))}
              <TableHead>{REVIEW_PLAIN.columns.day7}</TableHead>
              <TableHead>{REVIEW_PLAIN.columns.verdict}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.ideaId}>
                <TableCell className="max-w-56 whitespace-normal">
                  <ItemTitle item={item} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <LinkCell item={item} noun={noun} />
                </TableCell>
                {CHECKPOINT_DAYS.map((day) => (
                  <TableCell key={day} className="text-right">
                    <CheckpointCell checkpoint={checkpointOf(item, day)} />
                  </TableCell>
                ))}
                <TableCell>
                  <LiftCell checkpoint={checkpointOf(item, 7)} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <VerdictCell item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
