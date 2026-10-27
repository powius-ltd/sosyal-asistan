/**
 * Kreatif Anatomisi kovaları (`domain/anatomy.ts`'teki anahtarlar ve etiketler): hook uzunluğu, ilk bölüme geçiş, CTA konumu,
 * tempo. Saf; ölçülemeyen girdi (undefined, sonlu olmayan, negatif) → `undefined` (hiçbir kovaya ve 0'a düşmez). Alt sınırlar
 * DAHİLDİR: "5–10 sn" = 5 ≤ x < 10; "4+ kesme/dk" = x ≥ 4.
 */
import type { CtaPosition, FirstSectionBucket, HookLengthBucket, TempoBucket } from "@/lib/domain/anatomy";

const usable = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;

/** Hook uzunluğu (kelime): 1–6 / 7–12 / 13+. 0 kelime = hook metni yok → kovasız. */
export function hookLengthBucket(words: number | undefined): HookLengthBucket | undefined {
  if (!usable(words) || words < 1) return undefined;
  if (words <= 6) return "1_6";
  if (words <= 12) return "7_12";
  return "13_plus";
}

/** İlk bölüme geçiş (sn): <5 / 5–10 / 10–20 / 20+. */
export function firstSectionBucket(sec: number | undefined): FirstSectionBucket | undefined {
  if (!usable(sec)) return undefined;
  if (sec < 5) return "under_5";
  if (sec < 10) return "5_10";
  if (sec < 20) return "10_20";
  return "over_20";
}

/** CTA konumu: CTA'nın başladığı an, videonun bitişine kaç sn kala (`secondsBeforeEnd`): ≤5 son 5 sn · ≤15 sondan 6–15 sn · fazlası daha önce. */
export function ctaPositionBucket(secondsBeforeEnd: number | undefined): Exclude<CtaPosition, "none"> | undefined {
  if (!usable(secondsBeforeEnd)) return undefined;
  if (secondsBeforeEnd <= 5) return "last_5s";
  if (secondsBeforeEnd <= 15) return "6_15s";
  return "earlier";
}

/** Tempo (kesme/dk): <2 / 2–4 / 4+. */
export function tempoBucket(cutsPerMinute: number | undefined): TempoBucket | undefined {
  if (!usable(cutsPerMinute)) return undefined;
  if (cutsPerMinute < 2) return "under_2";
  if (cutsPerMinute < 4) return "2_4";
  return "over_4";
}
