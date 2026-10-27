/**
 * Prompt "Kanıt" bölümü: tek kanıt videoyu madde satırlarına çevirir. Rakip/kullanıcı kaynaklı her metin (hook, bölüm,
 * transcript, alt yazı) TEK SATIRDA ve tırnak içinde girer: satır sonu içermez, başlık ya da madde işareti taklit edemez.
 * Ölçülemeyen alan "bilinmiyor" yazılır (0 değil).
 */
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { cap, CAPS, TRANSCRIPT_MAX_CHARS, type FitLimits } from "@/lib/prompt/limits";
import { promptLift, promptNumber } from "@/lib/prompt/numbers";
import { quoteUntrusted as quote } from "@/lib/prompt/quote";
import { promptStrings, type PromptStrings } from "@/lib/prompt/strings";
import type { PromptLanguage, PromptVideo } from "@/lib/prompt/types";
import { safeExternalUrl } from "@/lib/safe-url";
import { truncateText } from "@/lib/text";

/** "Baz çizgisinin kaç katı" cümlesi + güven notları; ölçülemediyse sebebiyle "bilinmiyor". */
function liftText(video: PromptVideo, language: PromptLanguage, t: PromptStrings): string {
  const lift = promptLift(video.lift, language);
  if (lift === undefined) return t.evidence.liftUnknown(video.liftUnmeasuredReason);

  const baselineViews = promptNumber(video.baselineViews, language);
  const base =
    baselineViews === undefined
      ? t.evidence.liftWithoutBaseline(lift)
      : t.evidence.liftWithBaseline({
          lift,
          times: lift.replace(/x$/, ""),
          format: t.formatLabel[video.format],
          baselineViews,
          baselineN: promptNumber(video.baselineN, language),
        });
  const notes = [video.lowConfidence ? t.evidence.lowConfidence : undefined, video.immature ? t.evidence.immature : undefined];
  return [base, ...notes].filter(Boolean).join(" ");
}

function viewsText(video: PromptVideo, language: PromptLanguage, t: PromptStrings): string {
  const views = promptNumber(video.views, language);
  if (views === undefined) return t.unknown;
  return video.viewsKind ? `${views} (${t.viewsKindLabel(video.viewsKind)})` : views;
}

function accountText(video: PromptVideo, t: PromptStrings): string {
  const owner = video.isOwn === undefined ? "" : ` (${video.isOwn ? t.evidence.own : t.evidence.competitor})`;
  return `@${video.ownerHandle}${owner} · ${PLATFORM_LABEL[video.platform]} · ${t.formatLabel[video.format]}`;
}

/** Transcript satırı: kısaltılmış alıntı; süresi doldu/yok/sığmadı durumları açıkça yazılır. */
function transcriptLine(video: PromptVideo, limits: FitLimits, t: PromptStrings): string {
  const label = t.evidence.transcript;
  if (video.transcript.state === "expired") return `- ${label}: ${t.evidence.transcriptExpired}`;
  if (video.transcript.state === "none") return `- ${label}: ${t.evidence.transcriptNone}`;
  if (limits.transcriptMax <= 0) return `- ${label}: ${t.evidence.transcriptOmitted}`;

  const flat = video.transcript.text.replace(/\s+/g, " ").trim();
  if (flat === "") return `- ${label}: ${t.evidence.transcriptNone}`;
  const shortened = truncateText(flat, Math.min(limits.transcriptMax, TRANSCRIPT_MAX_CHARS));
  return `- ${shortened === flat ? label : t.evidence.transcriptShortened}: ${quote(shortened)}`;
}

/** Tek videonun satırları (başlık dahil). `heading`: "Kanıt 1: @x" ya da "Kaynak video: @x". */
export function evidenceLines(
  video: PromptVideo,
  heading: string,
  language: PromptLanguage,
  limits: FitLimits,
): string[] {
  const t = promptStrings(language);
  const e = t.evidence;
  const hook = cap(video.hookText, CAPS.hook);
  const sections =
    limits.sectionCount > 0
      ? video.sections.slice(0, limits.sectionCount).flatMap((s, i) => {
          const text = cap(s.quote, limits.sectionQuoteMax);
          return text ? [`  ${i + 1}. ${cap(s.type, 40) ?? "?"}: ${quote(text)}`] : [];
        })
      : [];
  const caption = limits.captionMax > 0 ? cap(video.caption, Math.min(limits.captionMax, CAPS.caption)) : undefined;
  const url = safeExternalUrl(video.url);

  return [
    `### ${heading}`,
    `- ${e.account}: ${accountText(video, t)}`,
    `- ${e.views}: ${viewsText(video, language, t)}`,
    `- ${e.lift}: ${liftText(video, language, t)}`,
    `- ${e.hook}: ${hook ? quote(hook) : e.hookMissing}`,
    `- ${e.hookType}: ${video.hookType ? t.hookTypeLabel(video.hookType) : t.unknown}`,
    ...(sections.length > 0 ? [`- ${e.sections}:`, ...sections] : []),
    transcriptLine(video, limits, t),
    ...(caption ? [`- ${e.caption}: ${quote(caption)}`] : []),
    ...(url ? [`- ${e.link}: ${url}`] : []),
  ];
}
