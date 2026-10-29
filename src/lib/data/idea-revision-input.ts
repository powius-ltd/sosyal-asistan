/**
 * Fikir revizyonu girdisi ve uygulaması (SPN-35): depo (mock ve Supabase) AYNI katı şemayı ve AYNI saf birleştirmeyi kullanır.
 * Girdi doğrulanmış yeni içeriktir (modelin ham çıktısı değil: `lib/ideas/revise.ts` önce kodla denetler). Eski hâl
 * `details.revisions`'a (en yeni başta, en çok `IDEA_REVISIONS_MAX`) eklenir; başlık, gerekçe, kanıt ve alıntılar DEĞİŞMEZ.
 * Yalnız düzenlenebilir durumdaki fikir değişir (`new` / `saved` / `scripted`): bırakılmış, zamanlanmış ya da yayınlanmış fikir `invalid_state`.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { RepositoryError } from "@/lib/data/repository";
import { IDEA_REVISIONS_MAX, type IdeaRevision } from "@/lib/domain/idea-revision";
import type { Idea, IdeaDetails, IdeaStatus } from "@/lib/domain/intel";
import { truncateText } from "@/lib/text";

export const REVISION_REQUEST_MAX = 500;
const HOOK_MAX = 200;
export const REVISABLE_STATUSES: readonly IdeaStatus[] = ["new", "saved", "scripted"];

export const ideaRevisionSchema = z.strictObject({
  request: z.string().trim().min(1, "Değişiklik isteği boş olamaz.").max(REVISION_REQUEST_MAX),
  hooks: z.array(z.strictObject({ text: z.string().trim().min(1).max(HOOK_MAX), type: z.string().trim().min(1).max(60) })).min(3, "En az 3 açılış gerekir.").max(5, "En çok 5 açılış olabilir."),
  scriptOutline: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
  /** Verilmezse mevcut senaryo korunur. */
  script: z.string().trim().min(20).max(3500).optional(),
});

export type IdeaRevisionInput = z.input<typeof ideaRevisionSchema>;
export type ParsedIdeaRevision = z.output<typeof ideaRevisionSchema>;

export const parseIdeaRevision = (input: unknown): ParsedIdeaRevision => parseOrThrow(ideaRevisionSchema, input, "Fikir değişikliği geçersiz.");

export interface RevisedIdeaParts {
  hooks: string[];
  scriptOutline: string[];
  details: IdeaDetails;
}

/** Durum kuralı + yeni içerik: fikrin yeni hook / taslak / ayrıntıları (eski hâl `revisions`'ın başına eklenir). */
export function applyIdeaRevision(idea: Pick<Idea, "status" | "hooks" | "scriptOutline" | "details">, value: ParsedIdeaRevision, now: Date): RevisedIdeaParts {
  if (!REVISABLE_STATUSES.includes(idea.status)) throw new RepositoryError("invalid_state", "Bu fikir artık değiştirilemez (bırakılmış, zamanlanmış ya da yayınlanmış).");
  const previous: IdeaRevision = {
    at: now.toISOString(),
    request: truncateText(value.request, REVISION_REQUEST_MAX),
    hooks: idea.hooks,
    ...(idea.details.hookTypes === undefined ? {} : { hookTypes: idea.details.hookTypes }),
    scriptOutline: idea.scriptOutline,
    ...(idea.details.script === undefined ? {} : { script: idea.details.script }),
  };
  const details: IdeaDetails = {
    ...idea.details,
    hookTypes: value.hooks.map((h) => h.type),
    ...(value.script === undefined ? {} : { script: value.script }),
    revisions: [previous, ...(idea.details.revisions ?? [])].slice(0, IDEA_REVISIONS_MAX),
  };
  return { hooks: value.hooks.map((h) => h.text), scriptOutline: value.scriptOutline, details };
}
