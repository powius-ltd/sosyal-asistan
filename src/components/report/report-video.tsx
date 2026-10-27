import type { ReactNode } from "react";

import { REPORT_COPY } from "@/lib/copy/report";
import type { ReportVideo } from "@/lib/report/types";

function Label({ children }: { children: ReactNode }) {
  return <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase break-after-avoid">{children}</h4>;
}

/**
 * Tek videonun sayfası: başlık, ne zaman, ne anlatıyor, açılış cümlesi, metin, açıklama. İlk video bölüm başlığıyla aynı sayfada başlar,
 * sonrakiler yeni sayfada (`break-before-page`); uzun metin paragraf ortasından bölünmez.
 */
export function ReportVideoBlock({ video, first }: { video: ReportVideo; first: boolean }) {
  const when = [video.when, video.duration].filter((part): part is string => part !== undefined).join(" · ");
  return (
    <article className={first ? "" : "mt-8 break-before-page print:mt-0"}>
      <h3 className="font-heading text-[1.2rem] leading-snug font-medium break-after-avoid">
        {video.position} · {video.title}
      </h3>
      {when ? <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{when}</p> : null}
      {video.summary ? <p className="mt-2">{video.summary}</p> : null}

      {video.opening ? (
        <>
          <Label>{REPORT_COPY.labelOpening}</Label>
          <p className="border-l-2 border-ai-rule pl-3 font-voice text-[1.05rem] leading-snug italic">{video.opening}</p>
          {video.otherOpenings.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {REPORT_COPY.labelOtherOpenings}: {video.otherOpenings.map((text) => `“${text}”`).join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}

      {video.body ? (
        <>
          <Label>{video.body.kind === "script" ? REPORT_COPY.labelScript : REPORT_COPY.labelOutline}</Label>
          {video.body.kind === "script" ? (
            <div className="space-y-2">
              {video.body.paragraphs.map((paragraph, index) => (
                <p key={index} className="break-inside-avoid">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <ol className="list-decimal space-y-1 pl-5">
              {video.body.paragraphs.map((step, index) => (
                <li key={index} className="break-inside-avoid">
                  {step}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}

      {video.caption ? (
        <>
          <Label>{REPORT_COPY.labelCaption}</Label>
          <p className="break-inside-avoid whitespace-pre-line text-muted-foreground">{video.caption}</p>
        </>
      ) : null}
    </article>
  );
}
