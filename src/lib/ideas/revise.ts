/**
 * Fikri sohbetle düzeltme (SPN-35): fikri okur, düzenlenebilir mi diye bakar, modele yeniden yazdırır, sonucu KODLA denetler ve ancak
 * geçerse depoya yazar (`repo.reviseIdea`: eski hâl `details.revisions`'a gider). Hata FIRLATILMAZ: kullanıcıya tek düz Türkçe cümle
 * döner. Fikrin taslak fişi varsa yeni metinle yeniden kurulur (G6). Düzenlenemeyen durumlar: bırakılmış / zamanlanmış / yayınlanmış fikir ve fişi üretime gönderilmiş (taslak dışı) fikir.
 * Plan onayına dokunmaz (onay yalnız plan sayfasındaki düğmedir). İstek metni günlüğe yazılmaz.
 */
import "server-only";

import type { FactsContext } from "@/lib/agents/analyst/facts";
import { REVISABLE_STATUSES } from "@/lib/data/idea-revision-input";
import { RepositoryError } from "@/lib/data/repository";
import { isContentLanguage } from "@/lib/domain/content-language";
import type { Idea } from "@/lib/domain/intel";
import { reviseIdea } from "@/lib/llm/revise-idea";
import type { RivalText } from "@/lib/llm/script-rules";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";
import { REVISE_PLAIN as T } from "@/lib/plain-language-revise";
import { refreshDraftOrder } from "@/lib/studio-order/create-for-idea";
import { resolveContentLanguage } from "@/lib/workspace/content-language";

export interface ReviseResult {
  ok: boolean;
  /** Kullanıcıya gösterilecek tek düz Türkçe cümle (başarıda "ne değişti", başarısızlıkta sebep). */
  message: string;
  /** Model çağrıldıysa meta (koşu kaydı için); çağrılmadıysa undefined. */
  meta?: LlmCallMeta;
}

/** Fişi üretime gönderilmiş (taslak dışı, hata dışı) fikir değiştirilemez: üretilen video eski metne göredir. */
const SENT_TO_PRODUCTION = new Set(["uretiliyor", "uretildi", "paylasildi"]);

function rivalTextsOf(idea: Idea): RivalText[] {
  const quotes = (idea.details.quotes ?? []).map((q) => ({ id: q.contentItemId, text: q.text }));
  const captions = idea.evidence.filter((e) => e.caption !== undefined).map((e) => ({ id: e.contentItemId, text: e.caption ?? "" }));
  return [...quotes, ...captions];
}

export async function reviseIdeaFromRequest(ctx: Pick<FactsContext, "repo" | "workspaceId" | "now">, backend: LlmBackend, ideaId: string, request: string, log?: (line: string) => void): Promise<ReviseResult> {
  const { repo, workspaceId, now } = ctx;
  let meta: LlmCallMeta | undefined;
  try {
    const idea = await repo.getIdea(workspaceId, ideaId);
    if (idea === null) return { ok: false, message: T.notFound };
    if (!REVISABLE_STATUSES.includes(idea.status)) return { ok: false, message: T.locked };
    const orders = await repo.listStudioOrders(workspaceId, { ideaIds: [ideaId] });
    if (orders.some((o) => SENT_TO_PRODUCTION.has(o.status))) return { ok: false, message: T.inProduction };

    const workspace = await repo.getWorkspace(workspaceId);
    const configured = idea.details.scriptLanguage !== undefined && isContentLanguage(idea.details.scriptLanguage) ? idea.details.scriptLanguage : workspace?.contentLanguage;
    const { language } = resolveContentLanguage({ configured, complianceRegion: workspace?.complianceRegion });

    const outcome = await reviseIdea(backend, {
      idea: { title: idea.title, rationale: idea.rationale, hooks: idea.hooks, scriptOutline: idea.scriptOutline, script: idea.details.script },
      request,
      niche: workspace?.nicheBrief,
      language,
      rivals: rivalTextsOf(idea),
    });
    meta = outcome.meta;
    if (!outcome.ok) {
      log?.("fikir değişikliği denetimden geçmedi");
      return { ok: false, message: T.rejected, meta };
    }
    const { value } = outcome;
    await repo.reviseIdea(workspaceId, ideaId, { request, hooks: value.hooks, scriptOutline: value.outline, script: value.script }, now);
    // Taslak fiş eski metinle kalmasın (G6). Yenileme düşerse düzeltme yine geçerlidir: fiş sayfası eski metni gösterir, günlüğe yazılır.
    await refreshDraftOrder({ repo, wsId: workspaceId, now, ideaId }).catch((e) => log?.(`taslak fiş yenilenemedi: ${e instanceof RepositoryError ? e.code : "hata"}`));
    return { ok: true, message: T.done(idea.title, value.summary), meta };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "invalid_state") return { ok: false, message: T.locked, meta };
    log?.(`fikir değişikliği yapılamadı: ${error instanceof LlmError ? error.code : error instanceof RepositoryError ? error.code : "hata"}`);
    return { ok: false, message: T.failed, meta };
  }
}
