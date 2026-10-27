/**
 * Fikir ↔ Reels bağı girdi doğrulaması: TÜM depo uygulamaları (mock, Supabase) ve `idea-links` server action'ı aynı kuralı
 * kullanır (`workspace-patch.ts` deseni). Bağlantı → kısa kod çevirisi platform modülündedir (`PlatformModule.parseContentUrl`);
 * burada UI/depo platforma dallanmadan çağırır.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { LINK_URL_MAX_LENGTH, type LinkIdeaToReelInput } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { IDEA_LINK_DECISIONS, type IdeaLinkDecision } from "@/lib/domain/outcomes";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";

const id = (what: string) => z.string({ error: `${what} kimliği metin olmalı.` }).trim().min(1, `${what} kimliği boş olamaz.`).max(100, `${what} kimliği çok uzun.`);

export const linkIdeaToReelSchema = z.object({
  ideaId: id("Fikir"),
  url: z
    .string({ error: "Bağlantı metin olmalı." })
    .trim()
    .min(1, "Bağlantı boş olamaz.")
    .max(LINK_URL_MAX_LENGTH, `Bağlantı en fazla ${LINK_URL_MAX_LENGTH} karakter olabilir.`),
});

export const resolveIdeaLinkSchema = z.object({
  linkId: id("Bağ"),
  decision: z.enum(IDEA_LINK_DECISIONS, { error: "Karar “confirm” ya da “reject” olmalı." }),
});

/** Depo uygulamaları için: geçersiz girdi `invalid_input` fırlatır; kırpılmış girdiyi döndürür. */
export function parseLinkIdeaToReelInput(input: unknown): LinkIdeaToReelInput {
  return parseOrThrow(linkIdeaToReelSchema, input, "Geçersiz Reels bağlantısı girdisi.");
}

export function parseResolveIdeaLinkInput(linkId: unknown, decision: unknown): { linkId: string; decision: IdeaLinkDecision } {
  return parseOrThrow(resolveIdeaLinkSchema, { linkId, decision }, "Geçersiz bağ kararı.");
}

/**
 * Fikrin platformunun modülüyle bağlantıdan kısa kodu çıkarır. Tanınmayan bağlantı, başka platforma ait bağlantı ya da modülü
 * olmayan platform → `invalid_input` (Türkçe mesaj; UI'a olduğu gibi gider).
 */
export function parseReelShortcode(platform: Platform, url: string): string {
  const label = PLATFORM_LABEL[platform];
  if (!hasPlatformModule(platform)) throw new RepositoryError("invalid_input", `${label} için içerik bağlantısı henüz desteklenmiyor.`);
  const parsed = getPlatformModule(platform).parseContentUrl(url);
  if (!parsed || parsed.platform !== platform) {
    throw new RepositoryError("invalid_input", `Geçerli bir ${label} içerik bağlantısı yapıştır (${getPlatformModule(platform).text.contentUrlHint}).`);
  }
  return parsed.shortcode;
}
