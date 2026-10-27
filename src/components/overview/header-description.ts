import { briefingAgeLabel } from "@/components/briefing/age-label";
import type { Briefing } from "@/lib/domain/briefing";
import { formatDateTime } from "@/lib/format";

/**
 * Başlık satırı açıklaması: veri ne kadar taze. "Hesabına son bakışım: 1 Eki 2026 18:26 · notlarım 2 saat önce". Hiç toplama yoksa
 * "Hesabına henüz bakmadım"; notlar yoksa o parça yazılmaz; yaşı okunamayan notun zamanı uydurulmaz.
 */
export function overviewDescription({
  lastCollectedAt,
  briefing,
  now,
  timeZone,
}: {
  lastCollectedAt?: string;
  briefing: Briefing | null;
  now: Date;
  timeZone?: string;
}): string {
  const collected = lastCollectedAt === undefined ? undefined : formatDateTime(lastCollectedAt, timeZone);
  const lead = collected === undefined ? "Hesabına henüz bakmadım" : `Hesabına son bakışım: ${collected}`;
  const age = briefing === null ? undefined : briefingAgeLabel(briefing.generatedAt, now);
  return age === undefined ? lead : `${lead} · notlarım ${age}`;
}
