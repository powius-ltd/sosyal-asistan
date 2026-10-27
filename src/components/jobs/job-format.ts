/**
 * İş ekranının küçük gösterim yardımcıları (saf; sunucu + istemci). Saat okunmaz: süre, işin kendi başlangıç ve bitiş anlarından
 * hesaplanır. Bilinmeyen değer `undefined` döner (0 ya da uydurma metin yok). Metinler sözlükte (`lib/plain-language.ts`), süre biçimi
 * `lib/format.ts`'tedir.
 */
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { formatElapsed } from "@/lib/format";
import { JOB_PREVIEW_PLAIN } from "@/lib/plain-language";

/** İşin süresi (işçinin aldığı andan bitişe; `formatElapsed`). İş hiç alınmadıysa ya da bitmediyse undefined. */
export function jobDurationLabel(view: Pick<JobStatusView, "startedAt" | "finishedAt">): string | undefined {
  if (view.startedAt === undefined || view.finishedAt === undefined) return undefined;
  return formatElapsed((Date.parse(view.finishedAt) - Date.parse(view.startedAt)) / 1000);
}

/** Önizlemenin ("Önce bak") düğme adı (sözlükten; iş düğmesi çizen her yer bunu kullanır). */
export const JOB_PREVIEW_LABEL = JOB_PREVIEW_PLAIN.label;
