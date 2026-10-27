/**
 * "Boşa dönen" iş türleri (SAF): son aynı tür iş işi olmadığını söyleyerek (`nothing_to_do`) bittiyse ve ondan sonra veriyi değiştiren
 * bir iş koşmadıysa, zincir o adımı yeniden AÇMAZ (ölçüm sayacı işin kendi seçim kuralından farklı çıksa bile döngü kurulmaz).
 * `publish` için ek kapılar: insanca onaylanmış (`approved`) YENİ satır varsa atlanmaz; saati geçmiş `ready` satır varken atlama SÜRELİDİR
 * (son `publish` işinden 1 saat sonra bayatlar): Zernio hâlâ `scheduled` derse ya da yoklama ağ hatası verirse "yayında" haberi sonsuza gecikmez.
 */
import type { CycleLastJob, PublishQueueFacts } from "@/lib/cycle/types";
import type { JobKind } from "@/lib/domain/panel-job";
import { DAY_MS } from "@/lib/time";

export const NOTHING_TO_DO = "nothing_to_do";

/** Bunlardan biri sonradan başarıyla ve iş görerek bittiyse eski "yapacak iş yok" bilgisi bayatlar. */
const DATA_CHANGING_KINDS: readonly JobKind[] = ["collect", "routine", "onboarding", "discover", "order_return"];

/** Saati geçmiş `ready` satır varken boşa dönen `publish` atlamasının ömrü. */
export const IDLE_PUBLISH_STALE_MS = DAY_MS / 24;

/** `dueForPublish` = approved + saati geçmiş ready; fark saati geçmiş `ready` sayısıdır. */
const dueReadyOf = (queue?: PublishQueueFacts): number => Math.max(0, (queue?.dueForPublish ?? 0) - (queue?.approved ?? 0));

export function noProgressKinds(jobs: readonly CycleLastJob[], publishQueue?: PublishQueueFacts, now?: Date): Set<JobKind> {
  const skipped = new Set<JobKind>();
  const seen = new Set<JobKind>();
  let dataChanged = false;
  for (const job of jobs) {
    if (!seen.has(job.kind)) {
      seen.add(job.kind);
      const idle = (job.status === "succeeded" || job.status === "partial") && job.outcome === NOTHING_TO_DO;
      const finished = job.finishedAt === undefined ? undefined : Date.parse(job.finishedAt);
      const staleReady = job.kind === "publish" && now !== undefined && dueReadyOf(publishQueue) > 0 && finished !== undefined && !Number.isNaN(finished) && now.getTime() - finished >= IDLE_PUBLISH_STALE_MS;
      if (idle && !dataChanged && !staleReady && !(job.kind === "publish" && (publishQueue?.approved ?? 0) > 0)) skipped.add(job.kind);
    }
    const worked = (job.status === "succeeded" || job.status === "partial") && job.outcome !== NOTHING_TO_DO;
    if (worked && DATA_CHANGING_KINDS.includes(job.kind)) dataChanged = true;
  }
  return skipped;
}
