/**
 * Senaryo editörü yapıştırıcısı (görev 6): plana GİREN (`position` dolu) fikirlerin senaryosunu fikir başına TEK LLM turuyla inceler
 * (`llm/script-review.ts`), sonucu `details.scriptReview`'e yazar, düzeltilmiş senaryoyu `details.script`'e koyar ve `details.maxSharedWords`'ü
 * yeniden hesaplar (kopya denetimi `script-review-validate.ts` içinde: kopyalı düzeltme atılır). Adaylar (plana girmeyen
 * fikir) incelenmez. Tur başarısızsa (LLM hatası ya da kod denetimi) özgün senaryo kalır ve plan notuna yazılır: plan DÜŞMEZ. Turların toplam süre bütçesi
 * vardır (`SCRIPT_REVIEW_BUDGET_MS`): dolunca kalan fikirler atlanır ve notlanır (editör yalnız iyileştirme; plan hiçbir durumda onun yüzünden kaybolmaz). Her LLM çağrısı
 * abonelik koşusu olarak kaydedilir (`runIds`); DB'ye fikir burada yazılmaz (çağıran `save_weekly_plan` ile yazar). Abonelik: 0 USD.
 */
import "server-only";

import type { ContentLanguage } from "@/lib/domain/content-language";
import type { IntelContext } from "@/lib/intel/context";
import type { PayloadIdea } from "@/lib/intel/plan-payload";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { claimsStillInHooksOrOutline, correctedFactLines } from "@/lib/intel/script-review-claims";
import { reviewScript, SCRIPT_REVIEW_TIMEOUT_MS } from "@/lib/llm/script-review";
import { maxSharedWithRivals, rivalTexts, type RivalTextSource } from "@/lib/llm/script-rules";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

const RUN_LABEL = "senaryo editörü";
/** Editör turlarının TOPLAM süre bütçesi (tek yer): dolunca kalan fikirler özgün senaryoyla bırakılır, plan yine kaydedilir. */
export const SCRIPT_REVIEW_BUDGET_MS = 8 * 60_000;
/** Bütçeden bu kadar süre kalmadıysa yeni çağrı başlatılmaz. */
export const SCRIPT_REVIEW_MIN_CALL_MS = 30_000;

/** Dış bağımlılıklar (testte sahtesi verilir; varsayılanlar `ctx`'ten). */
export interface ScriptReviewDeps {
  record(meta: LlmCallMeta): Promise<string>;
  recordFailure(message: string): Promise<void>;
}

export function defaultScriptReviewDeps(ctx: IntelContext): ScriptReviewDeps {
  return {
    record: (meta) => recordLlmRun(ctx.client, ctx.workspaceId, meta, RUN_LABEL),
    recordFailure: (message) => recordFailedLlmRun(ctx.client, ctx.workspaceId, "llm_week_synthesis", RUN_LABEL, message),
  };
}

export interface ReviewPlannedParams {
  language: ContentLanguage;
  notes: string[];
  runIds: string[];
  log: (line: string) => void;
  /** Fikir kanıt havuzu (rakip metinleri kopya denetimine girer; kendi içerikler atlanır). */
  evidence: readonly RivalTextSource[];
  /** Saat (ms; testte sahtesi verilir). Varsayılan `Date.now`. */
  now?: () => number;
  /** Toplam süre bütçesi (ms). Varsayılan `SCRIPT_REVIEW_BUDGET_MS`. */
  budgetMs?: number;
}

/** Fikir listesini aynı sırada döndürür: plana girenlerin senaryosu incelenmiş (varsa), diğerleri dokunulmamış. */
export async function reviewPlannedScripts(llm: LlmBackend, ideas: readonly PayloadIdea[], params: ReviewPlannedParams, deps: ScriptReviewDeps): Promise<PayloadIdea[]> {
  const { notes, runIds, log, language } = params;
  const now = params.now ?? Date.now;
  const budgetMs = params.budgetMs ?? SCRIPT_REVIEW_BUDGET_MS;
  const rivals = rivalTexts(params.evidence);
  const startedAt = now();
  const skipped: string[] = [];
  const out: PayloadIdea[] = [];
  for (const idea of ideas) {
    const script = idea.details.script;
    if (idea.position === undefined || script === undefined || script.trim() === "") {
      out.push(idea);
      continue;
    }
    const remainingMs = budgetMs - (now() - startedAt);
    if (remainingMs < SCRIPT_REVIEW_MIN_CALL_MS) {
      skipped.push(idea.title);
      out.push(idea);
      continue;
    }
    log(`Senaryo editörü: ${idea.position}) ${idea.title}...`);
    try {
      const outcome = await reviewScript(
        llm,
        {
          title: idea.title,
          script,
          language,
          targetDurationSec: idea.details.targetDurationSec,
          evidenceQuotes: (idea.details.quotes ?? []).map((quote) => quote.text),
          personalQuotes: (idea.details.personalQuotes ?? []).map((quote) => quote.text),
          rivalTexts: rivals,
        },
        { timeoutMs: Math.min(SCRIPT_REVIEW_TIMEOUT_MS, remainingMs) }, // çağrı kalan bütçeyi aşamaz
      );
      runIds.push(await deps.record(outcome.meta));
      if (outcome.review === undefined) {
        notes.push(`Senaryo editörü "${idea.title}": kod denetiminden geçmedi (${outcome.problems.slice(0, 2).join("; ")}); özgün senaryo korundu.`);
        out.push(idea);
        continue;
      }
      const { review } = outcome;
      if (review.verifyBeforePublish.length > 0) notes.push(`"${idea.title}": yayından önce doğrula — ${review.verifyBeforePublish.join(" · ")}`);
      // Düzeltilen olgular görünür: web erişimsiz model doğru bir olguyu "düzeltmiş" olabilir, insan bakar.
      for (const line of correctedFactLines(review)) notes.push(`"${idea.title}": ${line}`);
      for (const text of claimsStillInHooksOrOutline(review, idea.hooks, idea.script_outline)) notes.push(`"${idea.title}": yanlış bulunan olgu hook'larda / adımlarda da geçiyor (düzeltilmedi, elle bak): "${text}"`);
      // Düzeltilmiş senaryo değiştiyse kopya ölçüsü yeniden hesaplanır (script + açıklama + hook'lar ↔ her rakip metni; fikir denetimiyle aynı ölçü).
      const shared = review.revised ? { maxSharedWords: maxSharedWithRivals([outcome.script, idea.details.captionDraft ?? "", ...idea.hooks], rivals).maxSharedWords } : {};
      out.push({ ...idea, details: { ...idea.details, script: outcome.script, scriptReview: review, ...shared } });
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      notes.push(`Senaryo editörü "${idea.title}": ${error.message}; özgün senaryo korundu.`);
      await deps.recordFailure(error.message);
      out.push(idea);
    }
  }
  if (skipped.length > 0) notes.push(`Senaryo editörü: süre bütçesi (${Math.round(budgetMs / 60_000)} dk) doldu; ${skipped.length} fikir özgün senaryoyla bırakıldı (editörden geçmedi): ${skipped.map((title) => `"${title}"`).join(", ")}.`);
  return out;
}
