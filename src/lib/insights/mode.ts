/**
 * Plan modu: planın neye dayanarak öğrendiği. `rivals` (varsayılan): rakip tutanları ve rakip grupları; kendi hesap yenilik payı verir.
 * `own` (rakipsiz): rakip yok ya da yetersiz; yön, aday ve "ne tuttu" KENDİ videolarından üretilir (aynı büzme + güven mantığı, "yenilik"
 * çarpanı YOK: kendi denediği şey). Mod saf koddur; LLM'e sorulmaz. Metinlerdeki dayanak adı tek yerden gelir (`BASIS_LABEL`).
 */
import { RIVAL_DATA_MIN } from "@/lib/insights/constants";
import { withinDays, type Pool } from "@/lib/insights/pool";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

export type PlanMode = "rivals" | "own";

/** Gerekçe metinlerinde dayanak adı. */
export const BASIS_LABEL: Record<PlanMode, string> = { rivals: "rakiplerin", own: "kendi tutanların" };

/** Penceredeki (rakip grup penceresi) lift'i ölçülmüş rakip videosu sayısı (ölçülemeyen sayılmaz; undefined ≠ 0). */
export function measuredRivalCount(pool: Pool, days: number): number {
  return pool.rivals.filter((pi) => pi.lift !== undefined && withinDays(pi, pool.nowMs, days)).length;
}

/** Plan notu: hangi dayanakla çalışıldığı (dry-run ve kayıtlı planda aynı). */
export function modeNote(mode: PlanMode, measuredRivals: number): string {
  return mode === "own" ? REASON_PLAIN.modeOwn(measuredRivals, RIVAL_DATA_MIN) : REASON_PLAIN.modeRivals;
}
