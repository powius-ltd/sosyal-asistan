/**
 * Apify koşu durumları ve `collection_runs.status` karşılıkları — tek yerde.
 * Apify durumu tire ile yazar (`TIMED-OUT`), webhook olay adı alt çizgiyle (`ACTOR.RUN.TIMED_OUT`).
 */
import "server-only";
import type { RunStatus } from "@/lib/domain/run";

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTING"
  | "ABORTED"
  | "TIMING-OUT"
  | "TIMED-OUT";

/** Apify'da artık değişmeyen durumlar. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set<ApifyRunStatus>([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);

export function isTerminalRunStatus(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_RUN_STATUSES.has(status);
}

/** Bitmiş Apify durumu → bizim koşu durumu. Bitmemiş ya da bilinmeyen durum → `undefined`. */
export function toCollectionRunStatus(status: string | undefined): RunStatus | undefined {
  switch (status) {
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "ABORTED":
      return "aborted";
    case "TIMED-OUT":
      return "timed_out";
    default:
      return undefined;
  }
}
