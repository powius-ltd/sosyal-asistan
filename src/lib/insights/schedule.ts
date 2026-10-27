/**
 * "Takvim" bölümü (kod, LLM yok): haftalık paylaşım adedi ve slotlar, HEDEF KİTLE saat diliminde (ET).
 *  - Adet = clamp(rakip medyan haftalık paylaşım / 2, 3, 5) (`plannedPostCount`); rakip sıklığı ölçülemezse alt sınır 3.
 *  - Saat ve dayanak: `schedule-hours.ts` (kendi en iyi saat az örneğe dayanıyorsa slotların en çok yarısı o saate, kalanı keşif:
 *    rakip saatleri / kendi diğer iyi saatleri). Her slot hangi dayanağa ait olduğunu taşır (`basis`, `note`).
 *  - Günler `weekDayKeys` haftasına eşit aralıkla yayılır; geçmişte kalan slot ÖNERİLMEZ (bugünün saati geçtiyse sonraki boş
 *    güne kayar, gün kalmadıysa slot azalır ve sebep yazılır).
 *  - `at` mutlak an (UTC); İstanbul karşılığı aynı andır, yalnız gösterim dilimi değişir (ekranın işi). `weekday`/`hour`
 *    hedef kitle dilimindedir. Slot sırası kronolojiktir; `position` = aday sırası (1 = en erken, en yüksek sıralı aday).
 */
import { fromZonedTime } from "date-fns-tz";

import { plannedPostCount, SLOT_BASIS_LABEL, weekDayKeys, type ScheduleSection, type ScheduleSlot } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { CADENCE_MIN_POSTS, GROUP_WINDOW_DAYS } from "@/lib/insights/constants";
import { groupByOwner, withinDays, type Pool } from "@/lib/insights/pool";
import { planSlotHours, type HourChoice } from "@/lib/insights/schedule-hours";
import { median } from "@/lib/metrics/stats";
import { computeCadence } from "@/lib/metrics/temporal";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Rakiplerin medyan haftalık paylaşımı (≥ 3 tarihli videosu olan rakipler, son 90 gün); hiçbiri ölçülemezse undefined. */
function rivalMedianPostsPerWeek(pool: Pool): number | undefined {
  const recent = pool.allRivals.filter((pi) => withinDays(pi, pool.nowMs, GROUP_WINDOW_DAYS));
  const rates: number[] = [];
  for (const items of groupByOwner(recent).values()) {
    if (items.length < CADENCE_MIN_POSTS) continue;
    const perWeek = computeCadence(items.map((pi) => ({ id: pi.item.id, format: pi.item.format, publishedAt: new Date(pi.at) }))).postsPerWeek;
    if (perWeek !== undefined) rates.push(perWeek);
  }
  return median(rates);
}

/** `choices[i]` = i'inci (en erken) slotun saati. */
function placeSlots(pool: Pool, weekDays: readonly string[], count: number, choices: readonly HourChoice[]): ScheduleSlot[] {
  const todayKey = toDayKey(new Date(pool.nowMs), pool.zone) ?? "";
  const free = weekDays.flatMap((day, idx) => (day >= todayKey ? [idx] : []));
  const picks = free.length >= count ? Array.from({ length: count }, (_, i) => free[Math.floor((i * free.length) / count)]) : [...free];
  const instant = (dayIdx: number, hour: number) => fromZonedTime(`${weekDays[dayIdx]}T${pad2(hour)}:00:00`, pool.zone).getTime();

  const used = new Set<number>();
  const slots: Omit<ScheduleSlot, "position">[] = [];
  picks.forEach((pick, i) => {
    const choice = choices[i];
    let dayIdx = pick;
    if (instant(dayIdx, choice.hour) <= pool.nowMs) {
      const next = free.find((d) => d > dayIdx && !picks.includes(d) && !used.has(d));
      if (next === undefined) return;
      dayIdx = next;
    }
    used.add(dayIdx);
    slots.push({ at: new Date(instant(dayIdx, choice.hour)).toISOString(), weekday: dayIdx, hour: choice.hour, basis: choice.basis, note: choice.note });
  });
  return slots.sort((a, b) => a.at.localeCompare(b.at)).map((slot, i) => ({ position: i + 1, ...slot }));
}

export function buildSchedule(pool: Pool, weekStart: string): ScheduleSection {
  const rivalWeekly = rivalMedianPostsPerWeek(pool);
  const postsPerWeek = plannedPostCount(rivalWeekly);
  const { choices, reason: hourReason } = planSlotHours(pool, postsPerWeek);
  const slots = placeSlots(pool, weekDayKeys(weekStart), postsPerWeek, choices);

  const reasons: string[] = [];
  if (rivalWeekly === undefined) reasons.push(`Rakip paylaşım sıklığı ölçülemedi; alt sınır (${postsPerWeek}) kullanıldı.`);
  if (choices.every((h) => h.basis === "default")) reasons.push(`Saat verisi yok (${SLOT_BASIS_LABEL.default.toLowerCase()} kullanıldı).`);
  if (hourReason !== undefined) reasons.push(hourReason);
  if (slots.length < postsPerWeek) reasons.push(REASON_PLAIN.scheduleTooFewDays(postsPerWeek, slots.length));
  return { postsPerWeek, audienceTimeZone: pool.zone, slots, rivalMedianPostsPerWeek: rivalWeekly, unmeasuredReason: reasons.length > 0 ? reasons.join(" ") : undefined };
}
