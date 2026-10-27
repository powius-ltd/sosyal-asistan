import { ReportSection } from "@/components/report/report-section";
import { ReportVideoBlock } from "@/components/report/report-video";
import { weekRangeLabel } from "@/components/weekly-plan/plan-header";
import { REPORT_COPY } from "@/lib/copy/report";
import type { ReportCalendarRow, WeeklyReport } from "@/lib/report/types";

function CalendarTable({ rows, showEndStep }: { rows: ReportCalendarRow[]; showEndStep: boolean }) {
  const head = "py-1.5 pr-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b">
          <th className={head}>{REPORT_COPY.columnDay}</th>
          <th className={head}>{REPORT_COPY.columnTime}</th>
          <th className={head}>{REPORT_COPY.columnVideo}</th>
          {showEndStep ? <th className={head}>{REPORT_COPY.columnEndStep}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b align-top break-inside-avoid">
            <td className="py-1.5 pr-3">{row.day ?? REPORT_COPY.slotMissing}</td>
            <td className="py-1.5 pr-3 tabular-nums">
              {row.timeLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </td>
            <td className="py-1.5 pr-3 font-medium">{row.title}</td>
            {showEndStep ? <td className="py-1.5 pr-3">{row.endStep ?? "—"}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Yazdırılabilir haftalık yol haritası. Bölümü olmayan alan hiç çizilmez; sıra: özet → neye baktık → takvim → uzak dur → geçen hafta →
 * güncel notlar → altbilgi → her video kendi sayfasında. Renk yalnız anlam belirteçleriyle; kâğıtta açık tema (bkz. `LightThemeScript`).
 */
export function WeeklyReportDocument({ report }: { report: WeeklyReport }) {
  const range = weekRangeLabel(report.weekStart) ?? report.weekStart;
  const reviewRange = report.review ? (weekRangeLabel(report.review.weekStart) ?? report.review.weekStart) : undefined;
  const subtitle = [report.workspaceName, report.handle ? `@${report.handle}` : undefined, range].filter((part): part is string => Boolean(part)).join(" · ");
  return (
    <article className="mx-auto w-full max-w-[210mm] rounded-sm border bg-card px-[16mm] py-[14mm] text-[10.5pt] leading-relaxed text-card-foreground print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:p-0">
      <header className="mb-5">
        <h1 className="font-heading text-[2rem] leading-tight font-medium tracking-tight">{REPORT_COPY.documentTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        {report.preparedOn ? <p className="text-xs text-muted-foreground">{REPORT_COPY.preparedOn(report.preparedOn)}</p> : null}
      </header>

      <p className="mb-6 border-l-2 border-ai-rule pl-3 font-voice text-[1.1rem] leading-snug">
        <strong className="font-semibold">{REPORT_COPY.leadLabel}</strong> {report.lead}
      </p>

      {report.directions.length > 0 ? (
        <ReportSection title={REPORT_COPY.directionsHeading}>
          <p className="mb-2 text-muted-foreground">{REPORT_COPY.directionsIntro}</p>
          <ul className="space-y-2">
            {report.directions.map((direction) => (
              <li key={direction.title} className="break-inside-avoid">
                <strong className="font-semibold">{direction.title}.</strong> {direction.sentence}
              </li>
            ))}
          </ul>
        </ReportSection>
      ) : null}

      {report.calendar.length > 0 ? (
        <ReportSection title={REPORT_COPY.calendarHeading}>
          <CalendarTable rows={report.calendar} showEndStep={report.showEndStepColumn} />
        </ReportSection>
      ) : null}

      {report.avoid.length > 0 ? (
        <ReportSection title={REPORT_COPY.avoidHeading}>
          <ul className="list-disc space-y-1 pl-5">
            {report.avoid.map((line) => (
              <li key={line} className="break-inside-avoid">
                {line}
              </li>
            ))}
          </ul>
        </ReportSection>
      ) : null}

      {report.review ? (
        <ReportSection title={REPORT_COPY.reviewHeading}>
          {reviewRange ? <p className="mb-2 text-muted-foreground">{REPORT_COPY.reviewIntro(reviewRange)}</p> : null}
          <ul className="space-y-1">
            {report.review.rows.map((row, index) => (
              <li key={index} className="break-inside-avoid">
                <strong className="font-semibold">{row.title}</strong> — {row.outcome}
              </li>
            ))}
          </ul>
          {report.review.directionLines.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {report.review.directionLines.map((line) => (
                <li key={line} className="break-inside-avoid">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </ReportSection>
      ) : null}

      {report.notes.length > 0 ? (
        <ReportSection title={REPORT_COPY.notesHeading}>
          <ul className="space-y-2">
            {report.notes.map((note) => (
              <li key={note.headline} className="break-inside-avoid">
                <strong className="font-semibold">{note.headline}.</strong> {note.body}
              </li>
            ))}
          </ul>
        </ReportSection>
      ) : null}

      <p className="mt-7 break-inside-avoid text-sm text-muted-foreground">
        {REPORT_COPY.footnote}
        {report.fewSamples ? ` ${REPORT_COPY.footnoteFewSamples}` : ""}
      </p>

      {report.videos.length > 0 ? (
        <div className="mt-8 break-before-page print:mt-0">
          <ReportSection title={REPORT_COPY.videosHeading}>
            {report.videos.map((video, index) => (
              <ReportVideoBlock key={video.position} video={video} first={index === 0} />
            ))}
          </ReportSection>
        </div>
      ) : null}
    </article>
  );
}
