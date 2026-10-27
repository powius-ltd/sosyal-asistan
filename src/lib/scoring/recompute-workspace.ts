/**
 * Çalışma alanının tüm skor önbelleğini yeniden hesaplar: tüm kendi hesaplar + `tracked` rakipler, sahip sahip
 * (baz çizgisi hesap içidir; sahipler birbirini etkilemez). Bir sahibin hatası diğerlerini durdurmaz: hata
 * `failures`'a yazılır, çağıran (cron) raporlar. Sahip listesi okunamazsa fırlatır.
 */
import "server-only";

import {
  assertValidNow,
  recomputeAccountScores,
  type AccountScoresResult,
  type ScoringDeps,
} from "@/lib/scoring/recompute";
import { defaultScoringStore } from "@/lib/scoring/supabase-store";
import type { ScoringOwner } from "@/lib/scoring/types";

export interface WorkspaceScoresResult {
  /** Başarıyla skorlanan sahipler (liste sırasıyla). */
  owners: AccountScoresResult[];
  /** Skorlanamayan sahipler ve hata iletisi. */
  failures: { owner: ScoringOwner; message: string }[];
  /** Toplam yazılan içerik sayısı. */
  items: number;
}

export async function recomputeWorkspaceScores(
  wsId: string,
  now: Date,
  deps: ScoringDeps = {},
): Promise<WorkspaceScoresResult> {
  assertValidNow(now);
  const store = deps.store ?? defaultScoringStore();
  const result: WorkspaceScoresResult = { owners: [], failures: [], items: 0 };

  // Sıralı: bellekte aynı anda tek sahibin içerikleri durur; her sahibin okuma/yazması kendi içinde toplu ve eşzamanlı.
  for (const owner of await store.listOwners(wsId)) {
    try {
      const scored = await recomputeAccountScores(wsId, owner, now, { store });
      result.owners.push(scored);
      result.items += scored.items;
    } catch (error) {
      result.failures.push({ owner, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
