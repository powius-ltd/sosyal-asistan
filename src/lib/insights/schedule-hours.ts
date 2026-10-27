/**
 * Takvim slot SAATLERİ (kod, LLM yok): her slota hangi saatin ve hangi dayanağın düştüğü. Saatler HEDEF KİTLE diliminde.
 *  - Kendi en iyi saati ölçülebiliyorsa (aynı gün×saatte ≥ 3 paylaşım, `bestPostingSlots`) o saat slotların en çok `OWN_BEST_MAX_SHARE`'ini
 *    (%75: 4 slotta 3) alır — güvenilir (≥ 5 video) olsa bile; az örneğe (< 5 video) dayanıyorsa en çok yarısını alır (hepsi aynı saatte
 *    çıkıp hiç denemeden kalmasın). Kalanı KEŞİF: kendi diğer iyi saatleri → rakiplerin sabit saati → rakiplerin yaygın saatleri.
 *    Başka saat yoksa hepsi kendi en iyi saatinde kalır ve sebep yazılır. Güvenilir ve birden çok en iyi saat varsa zaten çeşitlidir.
 *  - Kendi en iyi saati yoksa: kendi iyi saatleri (≥ 2 videolu, medyan lift ≥ 1) + rakip sabit saatleri; hiçbiri yoksa varsayılan.
 * Her slot hangi dayanağı kullandığını `basis` + `note` ile taşır.
 */
import type { PostingHour } from "@/lib/domain/insights";
import type { SlotBasis } from "@/lib/domain/weekly-plan";
import { postingHours } from "@/lib/data/views/insights-posting";
import { formatPercent } from "@/lib/format";
import {
  CADENCE_MIN_POSTS,
  DEFAULT_SLOT_HOUR,
  FIXED_HOUR_MIN_SHARE,
  FIXED_HOUR_MIN_VIDEOS,
  GROUP_WINDOW_DAYS,
  OWN_BEST_CONFIDENT_N,
  OWN_BEST_MAX_SHARE,
  OWN_BEST_THIN_MAX_SHARE,
  OWN_GOOD_HOUR_MIN_N,
  RIVAL_COMMON_HOUR_MIN_N,
} from "@/lib/insights/constants";
import { groupByOwner, withinDays, type Pool } from "@/lib/insights/pool";
import { bestPostingSlots } from "@/lib/metrics/temporal";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

export interface HourChoice {
  hour: number;
  basis: SlotBasis;
  note: string;
}

export interface SlotHours {
  /** Slot sırasına göre (en erken gün ilk) saat seçimi; uzunluk = istenen adet. */
  choices: HourChoice[];
  /** Takvimin `unmeasuredReason`'ına eklenecek sebep (örn. çeşitlendirilemedi); yoksa undefined. */
  reason?: string;
}

interface RivalHour extends HourChoice {
  /** Bu saatte rakiplerin toplam video sayısı (sıralama için). */
  total: number;
}

/** Rakibin son 90 gündeki videoları, sahibe göre; saat başına profil (`postingHours`). */
function rivalProfiles(pool: Pool): { handle: string; hours: PostingHour[]; videos: number }[] {
  const recent = pool.allRivals.filter((pi) => withinDays(pi, pool.nowMs, GROUP_WINDOW_DAYS));
  return [...groupByOwner(recent).values()].map((items) => ({ handle: items[0].item.owner.handle, hours: postingHours(items.map((pi) => pi.item), pool.zone), videos: items.length }));
}

/** Rakip saatlerini saat başına toplar (toplam video azalan, eşitlikte erken saat); `pick` bir rakibin saat satırlarından hangilerinin sayılacağını seçer. */
function rivalHours(pool: Pool, basis: SlotBasis, minVideos: number, pick: (hours: PostingHour[]) => PostingHour[]): RivalHour[] {
  const byHour = new Map<number, { total: number; handle: string; n: number; share: number }>();
  for (const profile of rivalProfiles(pool)) {
    if (profile.videos < minVideos) continue;
    for (const h of pick(profile.hours)) {
      const entry = byHour.get(h.hour) ?? { total: 0, handle: profile.handle, n: 0, share: 0 };
      if (h.n > entry.n) Object.assign(entry, { handle: profile.handle, n: h.n, share: h.share });
      entry.total += h.n;
      byHour.set(h.hour, entry);
    }
  }
  return [...byHour]
    .sort((a, b) => b[1].total - a[1].total || a[0] - b[0])
    .map(([hour, e]) => ({ hour, basis, total: e.total, note: `@${e.handle} videolarının ${formatPercent(e.share, 0)} kadarını bu saatte yayınlıyor.` }));
}

/** Rakip sabit saatleri: videolarının ≥ %50'sini aynı saatte yayınlayan, ≥ 5 videolu rakipler (en sık saatleri). */
export const rivalFixedHours = (pool: Pool): RivalHour[] =>
  rivalHours(pool, "rival_fixed", FIXED_HOUR_MIN_VIDEOS, (hours) => (hours[0] !== undefined && hours[0].share >= FIXED_HOUR_MIN_SHARE ? [hours[0]] : []));

/** Rakip yaygın saatleri (`commonHours`): her rakibin en sık 3 saati, o saatte ≥ 2 video olanlar. */
export const rivalCommonHours = (pool: Pool): RivalHour[] =>
  rivalHours(pool, "rival_common", CADENCE_MIN_POSTS, (hours) => hours.slice(0, 3).filter((h) => h.n >= RIVAL_COMMON_HOUR_MIN_N));

interface OwnHours {
  best: HourChoice[];
  /** En iyi saat dilimlerindeki toplam paylaşım (örnek büyüklüğü). */
  bestSample: number;
  good: HourChoice[];
}

function ownHours(pool: Pool): OwnHours {
  const samples = pool.allOwn.map((pi) => ({ format: pi.item.format, views: pi.item.metrics.views, viewsKind: pi.item.metrics.viewsKind, publishedAt: new Date(pi.at) }));
  const slots = bestPostingSlots(samples, { timeZone: pool.zone }).slots;
  const bestHours = [...new Set(slots.map((s) => s.hour))];
  const good = postingHours(pool.allOwn.map((pi) => pi.item), pool.zone)
    .filter((h) => h.liftN >= OWN_GOOD_HOUR_MIN_N && (h.medianLift ?? 0) >= 1)
    .sort((a, b) => (b.medianLift ?? 0) - (a.medianLift ?? 0) || b.liftN - a.liftN || a.hour - b.hour);
  return {
    best: bestHours.map((hour) => ({ hour, basis: "own_best", note: REASON_PLAIN.scheduleBestHour })),
    bestSample: slots.reduce((sum, s) => sum + s.posts, 0),
    good: good.map((h) => ({ hour: h.hour, basis: "own_good", note: REASON_PLAIN.scheduleGoodHour })),
  };
}

const EXPLORE_TAG: Partial<Record<SlotBasis, string>> = {
  own_good: "Keşif (kendi diğer iyi saatin)",
  rival_fixed: "Keşif (rakip saati)",
  rival_common: "Keşif (rakip saati)",
};

const exploring = (choice: HourChoice): HourChoice => ({ hour: choice.hour, basis: choice.basis, note: `${EXPLORE_TAG[choice.basis] ?? "Keşif"}: ${choice.note}` });
const uniqueHours = (choices: readonly HourChoice[]): HourChoice[] => choices.filter((c, i, all) => all.findIndex((o) => o.hour === c.hour) === i);

/**
 * Kendi en iyi saati `ownMax` slota konur, kalanı keşiftir. Keşif slotları eşit aralıkla yayılır (Bresenham), sıra kendi saatiyle
 * başlar: yarım payda dönüşümlü (kendi, keşif, kendi, …), %75 payda keşif sona kalır (kendi, kendi, kendi, keşif): en yüksek sıralı
 * adaylar (erken slotlar) denenmiş saate düşer.
 */
function interleave(own: readonly HourChoice[], explore: readonly HourChoice[], count: number, ownMax: number): HourChoice[] {
  const exploreCount = count - Math.max(1, ownMax);
  let ownUsed = 0;
  let exploreUsed = 0;
  return Array.from({ length: count }, (_, i) => {
    const isExplore = Math.floor(((i + 1) * exploreCount) / count) > Math.floor((i * exploreCount) / count);
    return isExplore ? explore[exploreUsed++ % explore.length] : own[ownUsed++ % own.length];
  });
}

export function planSlotHours(pool: Pool, count: number): SlotHours {
  const own = ownHours(pool);
  const cycle = (hours: readonly HourChoice[]) => Array.from({ length: count }, (_, i) => hours[i % hours.length]);

  if (own.best.length > 0) {
    const confident = own.bestSample >= OWN_BEST_CONFIDENT_N;
    if (confident && own.best.length > 1) return { choices: cycle(own.best) }; // birden çok en iyi saat zaten çeşitli
    const maxShare = confident ? OWN_BEST_MAX_SHARE : OWN_BEST_THIN_MAX_SHARE;
    const suffix = confident
      ? ` ${REASON_PLAIN.scheduleSpread}`
      : REASON_PLAIN.scheduleFewSamples(own.bestSample);
    const best = own.best.map((c) => ({ ...c, note: `${c.note}${suffix}` }));
    const bestHours = new Set(own.best.map((c) => c.hour));
    const explore = uniqueHours([...own.good, ...rivalFixedHours(pool), ...rivalCommonHours(pool)]).filter((c) => !bestHours.has(c.hour)).map(exploring);
    if (explore.length === 0) {
      return { choices: cycle(best), reason: REASON_PLAIN.scheduleSingleHour(own.bestSample, confident) };
    }
    return { choices: interleave(best, explore, count, Math.floor(count * maxShare)) };
  }

  const combined = uniqueHours([...own.good, ...rivalFixedHours(pool)]);
  return { choices: cycle(combined.length > 0 ? combined : [{ hour: DEFAULT_SLOT_HOUR, basis: "default", note: "Yeterli saat verisi yok; varsayılan akşam saati." }]) };
}
