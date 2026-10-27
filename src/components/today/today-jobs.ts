/**
 * "Bugün"ün iş durumu okuması: yönetici kartı ("Haftalık turu başlat") yalnız işler panelden başlatılabiliyorken ve çalışma alanında süren
 * iş yokken üretilir (`lib/today` `runRoutineCards`). Kapı ve etkin iş `jobs-state.ts`'ten gelir (durum şeridiyle AYNI istek önbelleği: ek
 * sorgu yok). Müşteri modunda hiç okunmaz; okuma fırlatırsa undefined döner (kart üretilmez, sayfa çökmez).
 */
import "server-only";

import { loadJobsState } from "@/components/jobs/jobs-state";
import { readSafe } from "@/lib/overview/read-safe";
import type { TodayJobsState } from "@/lib/today";

export async function loadTodayJobs(operator: boolean): Promise<TodayJobsState | undefined> {
  if (!operator) return undefined;
  const state = await readSafe("iş durumu", loadJobsState);
  if (state === undefined) return undefined;
  const active = state.seed.status.active;
  // Yanıt vermeyen iş engel sayılmaz: yeni istek onu kapatır (iş düğmeleriyle aynı kural).
  return { canRun: state.canRun, busy: active !== undefined && !active.stale };
}
