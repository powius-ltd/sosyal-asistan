/**
 * Depo girdi doğrulamasının ortak çekirdeği: `collection-input.ts`, `publish-input.ts`, `alert-settings-patch.ts` ve
 * `workspace-patch.ts` şemalarını buradan çalıştırır (mock ve Supabase deposu + server action'lar aynı yolu kullanır).
 */
import type { z } from "zod";

import { RepositoryError } from "@/lib/data/repository";

/**
 * Girdiyi şemayla doğrular: geçerliyse temizlenmiş (kırpılmış, dönüştürülmüş) veri döner; geçersizse ilk zod mesajıyla
 * `RepositoryError("invalid_input")` fırlatır (mesaj yoksa `fallback`). Mesajlar şemada Türkçe yazılır.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, fallback: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RepositoryError("invalid_input", parsed.error.issues[0]?.message ?? fallback);
  return parsed.data;
}
