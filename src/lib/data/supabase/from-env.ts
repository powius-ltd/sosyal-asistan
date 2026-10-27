/**
 * `DATA_SOURCE=supabase` yapılandırması: Faz 1'de giriş ekranı yok — sunucu service role + yerel workspace/kullanıcıyla
 * çalışır (`LOCAL_WORKSPACE_ID`, `LOCAL_USER_ID`; değerler `supabase/seed.sql` başlığında). Eksik/biçimsiz env açık Türkçe
 * hatayla reddedilir (anahtar DEĞERİ hata iletisine girmez).
 */
import { isCreditsEnforced } from "@/lib/credits/enforcement";
import type { PanelRepository } from "@/lib/data/repository";
import { isUuid } from "@/lib/data/supabase/errors";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { getAdminClient } from "@/lib/supabase/admin";

export interface LocalSupabaseEnv {
  workspaceId: string;
  userId: string;
}

type Env = Record<string, string | undefined>;

/** Yerel workspace + kullanıcı kimliği (UUID). Eksik/biçimsiz → Türkçe hata. */
export function readLocalSupabaseEnv(env: Env = process.env): LocalSupabaseEnv {
  const workspaceId = env.LOCAL_WORKSPACE_ID?.trim();
  const userId = env.LOCAL_USER_ID?.trim();
  const missing = [!workspaceId && "LOCAL_WORKSPACE_ID", !userId && "LOCAL_USER_ID"].filter((name): name is string => Boolean(name));
  if (!workspaceId || !userId) {
    throw new Error(
      `DATA_SOURCE=supabase için env eksik: ${missing.join(", ")} (.env.local; yerel değerler supabase/seed.sql başlığında: npm run db:reset).`,
    );
  }
  if (!isUuid(workspaceId) || !isUuid(userId)) {
    throw new Error("LOCAL_WORKSPACE_ID ve LOCAL_USER_ID UUID biçiminde olmalı (supabase/seed.sql başlığındaki değerler).");
  }
  return { workspaceId, userId };
}

/** Env'den yapılandırılmış Supabase deposu (service role: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). */
export function createSupabaseRepositoryFromEnv(env: Env = process.env): PanelRepository {
  const { userId } = readLocalSupabaseEnv(env);
  return createSupabaseRepository({ db: getAdminClient(), approverUserId: userId, creditsEnforced: isCreditsEnforced(env) });
}
