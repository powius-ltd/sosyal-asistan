/**
 * Genel bakış "Özet" bloğu: neredeyiz · bu hafta ne yaptık · senden ne bekliyoruz (`docs/GENEL-BAKIS-TASARIM.md` §3).
 * Saf fonksiyon: kod sayar, metin şablondur, LLM yok. Girdideki her parça okunamamış olabilir (`undefined`); ilgili cümle düşer.
 * Hesap/marka adı gömülmez.
 */
import { kpiOf } from "@/lib/overview/period-change";
import { buildAsks } from "@/lib/overview/summary-asks";
import { buildDoneLine, buildWhereLine, EMPTY_WHERE_TEXT } from "@/lib/overview/summary-lines";
import type { OverviewSummary, OverviewSummaryInput } from "@/lib/overview/types";

export { NO_ASKS_TEXT } from "@/lib/overview/summary-asks";
export { EMPTY_WHERE_TEXT, NO_NUMBERS_TEXT, NO_PLAN_YET_TEXT } from "@/lib/overview/summary-lines";
export { SUMMARY_ASKS_MAX } from "@/lib/overview/types";

/**
 * Hesaba hiç bakılmamış mı: bağlı hesap yok YA DA hiç başarılı toplama ve hiç ölçülmüş gösterge yok. Gösterge ölçülmüşse (sıfır dahil)
 * bakış yapılmıştır.
 */
function isEmptyWorkspace(input: OverviewSummaryInput): boolean {
  if (input.accounts !== undefined && input.accounts.length === 0) return true;
  if (input.lastCollectedAt !== undefined) return false;
  // Göstergeler okunamadıysa "hiç bakılmadı" denemez (bilinmiyor ≠ yok).
  if (input.overview === undefined) return false;
  return (["followers", "views", "posts"] as const).every((key) => kpiOf(input.overview, key)?.value === undefined);
}

export function buildOverviewSummary(input: OverviewSummaryInput): OverviewSummary {
  const asks = buildAsks(input);
  if (isEmptyWorkspace(input)) return { empty: true, where: { text: EMPTY_WHERE_TEXT }, asks };
  return { empty: false, where: buildWhereLine(input), done: buildDoneLine(input), asks };
}
