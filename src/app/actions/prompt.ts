"use server";

import { z } from "zod";

import { actionFail, actionOk, toActionError, type ActionResult } from "@/lib/actions/result";
import { getPanelContext, type PanelRepository } from "@/lib/data";
import { DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import {
  buildContentPrompt,
  buildIdeaPrompt,
  ideaForPrompt,
  MAX_EVIDENCE_VIDEOS,
  PROMPT_LANGUAGES,
  videoFromDetail,
  videoFromEvidence,
  type PromptLanguage,
} from "@/lib/prompt";

const id = z.string().trim().min(1).max(128);

const inputSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("idea"), ideaId: id }),
    z.object({ kind: z.literal("content"), contentId: id }),
  ]),
  language: z.enum(PROMPT_LANGUAGES),
});

export type BuildPromptResult = ActionResult<{ text: string; language: PromptLanguage }>;

type PromptSource = z.infer<typeof inputSchema>["source"];

/** Prompt'a giren workspace bilgisi: niş tanımı + uyum bölgesi (workspace yoksa varsayılan bölge, niş yok). */
async function workspaceContext(repo: PanelRepository, wsId: string) {
  const workspace = await repo.getWorkspace(wsId);
  return {
    nicheBrief: workspace?.nicheBrief,
    complianceRegion: workspace?.complianceRegion ?? DEFAULT_COMPLIANCE_REGION,
  };
}

/**
 * "Prompt olarak kopyala": kaynağı (fikir kartı ya da içerik) depodan okuyup tek metne çevirir. Salt okuma: veri yazılmaz,
 * `revalidatePath` gerekmez. Girdi sunucuda zod ile doğrulanır (action doğrudan POST ile çağrılabilir); workspace
 * istemciden değil `getPanelContext()`'ten gelir. Prompt metnini `lib/prompt` (saf) kurar.
 */
export async function buildPromptAction(source: unknown, language: unknown): Promise<BuildPromptResult> {
  const parsed = inputSchema.safeParse({ source, language });
  if (!parsed.success) return actionFail("Geçersiz istek: prompt kaynağı ya da dil hatalı.");
  const { language: lang } = parsed.data;

  try {
    const { repo, wsId } = await getPanelContext();
    const text = await promptText(repo, wsId, parsed.data.source, lang);
    return text === undefined ? notFound(parsed.data.source) : actionOk({ text, language: lang });
  } catch (error) {
    return toActionError(error);
  }
}

function notFound(source: PromptSource) {
  return actionFail(
    source.kind === "idea"
      ? "Fikir bulunamadı; silinmiş olabilir. Sayfayı yenileyip tekrar dene."
      : "İçerik bulunamadı; silinmiş olabilir. Sayfayı yenileyip tekrar dene.",
    "not_found",
  );
}

/** Kaynağa göre metin; kaynak yoksa undefined. */
async function promptText(
  repo: PanelRepository,
  wsId: string,
  source: PromptSource,
  language: PromptLanguage,
): Promise<string | undefined> {
  if (source.kind === "content") {
    const [detail, context] = await Promise.all([repo.getContent(wsId, source.contentId), workspaceContext(repo, wsId)]);
    return detail ? buildContentPrompt({ video: videoFromDetail(detail), language, ...context }) : undefined;
  }

  const [idea, context] = await Promise.all([repo.getIdea(wsId, source.ideaId), workspaceContext(repo, wsId)]);
  if (!idea) return undefined;
  // Kanıt başına detay okunur (izlenme, baz çizgisi, transcript); içerik silinmişse özetle yetinilir.
  const evidence = await Promise.all(
    idea.evidence.slice(0, MAX_EVIDENCE_VIDEOS).map(async (item) => {
      const detail = await repo.getContent(wsId, item.contentItemId);
      return detail ? videoFromDetail(detail) : videoFromEvidence(item);
    }),
  );
  return buildIdeaPrompt({ idea: ideaForPrompt(idea), evidence, language, ...context });
}
