/**
 * Durumdan türetilen saf hesaplar (DB/ağ yok): Apify tahmin referansı ve "yeni içerik" sayısı. `state.ts` okur, bunlar hesaplar.
 */
import type { CollectionRun } from "@/lib/domain/run";

/** Aynı toplama oturumu sayılan aralık: profil koşusu + hedef başına reel koşuları art arda, birkaç dakikada başlar. */
export const COLLECTION_SESSION_MS = 60 * 60 * 1000;

/**
 * Son toplama OTURUMUNUN toplam tutarı (USD): en yeni normal (ölçüm olmayan) Apify koşusundan geriye `COLLECTION_SESSION_MS` içindeki
 * koşuların `actualUsd ?? reservedUsd` toplamı. Bu gerçek tahmin DEĞİL, geçmiş referanstır (gerçek tahmin `collectOnce` içinde, aktör
 * fiyatından). Hiç koşu yoksa undefined (0 değil).
 */
export function referenceCollectionUsd(runs: readonly Pick<CollectionRun, "provider" | "status" | "purpose" | "startedAt" | "actualUsd" | "reservedUsd">[]): number | undefined {
  const usable = runs
    .filter((run) => run.provider === "apify" && run.purpose === undefined && (run.status === "ingested" || run.status === "succeeded"))
    .map((run) => ({ run, ms: Date.parse(run.startedAt) }))
    .filter((entry) => !Number.isNaN(entry.ms));
  if (usable.length === 0) return undefined;
  const latest = Math.max(...usable.map((entry) => entry.ms));
  const session = usable.filter((entry) => latest - entry.ms <= COLLECTION_SESSION_MS);
  const total = session.reduce((sum, { run }) => sum + (run.actualUsd ?? run.reservedUsd), 0);
  return Math.round(total * 1_000_000) / 1_000_000;
}

/** `since`'ten sonra ilk kez görülen içerik sayısı; `since` yoksa (brifing yok) tüm içerik. Okunamayan zaman yeni sayılmaz. */
export function countNewContent(items: readonly { firstSeenAt: string }[], since: string | undefined): number {
  if (since === undefined) return items.length;
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return 0;
  return items.filter((item) => Date.parse(item.firstSeenAt) > sinceMs).length;
}
