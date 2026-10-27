/**
 * Aday eleği + sıralama adımı: adayları niş özetiyle eler (Claude CLI, abonelik), sonucu `competitor_screens`'e yazar, sıralı listeyi döndürür.
 * Elek hatası FIRLATMAZ: sıralama eleksiz sürer (`screened: false`, `note`). Aday durumu değişmez, Apify'a çağrı yok.
 * Her başarılı parti ayrı bir abonelik `collection_runs` satırıdır (koşu türü `llm_topic_screen`, etiket "aday eleği").
 */
import "server-only";

import { rankCandidates, type RankedCandidate } from "@/lib/collection/candidate-rank";
import { loadLiftStats, loadNicheBrief, loadScreenableCandidates, loadScreens, saveCandidateScreens, type ScreenableCandidate } from "@/lib/collection/candidate-screen-store";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { SCREEN_CANDIDATE_BATCH_MAX, screenCandidatesBatched } from "@/lib/llm/screen-candidates";
import type { LlmBackend } from "@/lib/llm/types";
import type { AdminClient } from "@/lib/supabase/admin";

export interface ScreenAndRankInput {
  client: AdminClient;
  /** Verilmezse elek yapılmaz (yalnız mevcut sonuçlarla sıralanır). */
  llm?: LlmBackend;
  workspaceId: string;
  /** Hangi durumdaki satırlar adaydır (varsayılan yalnız `candidate`). */
  statuses?: readonly string[];
  /** Kendi hesabın takipçisi (boyut için); bilinmiyorsa yok. */
  ownFollowers?: number;
  /** Zaten elenmiş adayı yeniden eleme (varsayılan: elenmemiş adaylar elenir). */
  rescreen?: boolean;
  now: Date;
  model?: string;
  log?: (line: string) => void;
}

export interface ScreenAndRankResult {
  ranked: RankedCandidate<ScreenableCandidate>[];
  /** Bu çağrıda modele sorulan aday sayısı. */
  screenedNow: number;
  /** Elek bu çağrıda hatasız bitti mi (hiç aday sorulmadıysa true). */
  screened: boolean;
  note?: string;
}

export async function screenAndRankCandidates(input: ScreenAndRankInput): Promise<ScreenAndRankResult> {
  const { client, workspaceId } = input;
  const log = input.log ?? (() => undefined);
  const candidates = await loadScreenableCandidates(client, workspaceId, input.statuses);
  let screens = await loadScreens(client, workspaceId);
  let screenedNow = 0;
  let screened = true;
  let note: string | undefined;

  const todo = candidates.filter((candidate) => input.rescreen === true || !screens.has(candidate.id));
  if (input.llm !== undefined && todo.length > 0) {
    try {
      const niche = await loadNicheBrief(client, workspaceId);
      if (niche === undefined) {
        note = "Niş özeti ve etiket yok: aday eleği yapılmadı.";
        screened = false;
      } else {
        const outcome = await screenCandidatesBatched(input.llm, { niche, items: todo }, { model: input.model });
        const failedIds = new Set(outcome.failed.flatMap((entry) => entry.ids));
        let metaIndex = 0;
        for (let start = 0; start < todo.length; start += SCREEN_CANDIDATE_BATCH_MAX) {
          const batch = todo.slice(start, start + SCREEN_CANDIDATE_BATCH_MAX);
          if (failedIds.has(batch[0].id)) continue;
          const meta = outcome.metas[metaIndex++];
          const batchResults = outcome.results.filter((result) => batch.some((candidate) => candidate.id === result.id));
          // Tüm adaylar metinsizse model çağrılmamıştır (meta yok): koşu satırı açılmaz.
          const runId = meta === undefined ? undefined : await recordLlmRun(client, workspaceId, meta, `aday eleği (${batch.length} aday)`, batch.length);
          await saveCandidateScreens(client, batch, batchResults, { workspaceId, promptVersion: outcome.promptVersion, model: meta?.model, runId, now: input.now });
          screenedNow += batch.length;
        }
        for (const failure of outcome.failed) {
          log(`  aday eleği partisi başarısız (${failure.ids.length} aday): ${failure.error.message.slice(0, 160)}`);
          await recordFailedLlmRun(client, workspaceId, "llm_topic_screen", `aday eleği (${failure.ids.length} aday)`, failure.error.message).catch(() => undefined);
        }
        if (outcome.failed.length > 0) {
          screened = false;
          note = `${failedIds.size} aday elenemedi: sıralama o adaylar için konu bilgisi olmadan sürdü.`;
        }
        screens = await loadScreens(client, workspaceId);
      }
    } catch (error) {
      screened = false;
      note = `Aday eleği yapılamadı (${error instanceof Error ? error.message : "bilinmeyen hata"}): sıralama eleksiz sürdü.`;
      log(note);
    }
  }
  const liftStats = await loadLiftStats(client, workspaceId, candidates.map((candidate) => candidate.id));
  const ranked = rankCandidates(candidates, { ownFollowers: input.ownFollowers, screens, liftStats });
  return { ranked, screenedNow, screened, ...(note === undefined ? {} : { note }) };
}
