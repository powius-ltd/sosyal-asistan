/**
 * Toplama planının kapsadığı AYRIK hesap sayısı. Profil koşusu hepsini, reel koşusu tek hesabı kapsar; aynı hesap iki koşuda geçse de bir
 * sayılır. Kredi tahmininin birim sayısıdır (`domain/credit-pricing.ts`: hesap tarama / ölçüm hesap başınadır).
 */
import type { CollectPlan } from "@/lib/collection/types";

export function plannedAccountCount(plan: Pick<CollectPlan, "jobs">): number {
  return new Set(plan.jobs.flatMap((job) => job.targets.map((target) => `${target.platform}:${target.handle}`))).size;
}
