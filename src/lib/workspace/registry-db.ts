/**
 * Çalışma alanı kaydının Supabase çekirdeği (service role, YALNIZ sunucu): TÜM çalışma alanlarını listeler ve yenisini açar. Bu işlem
 * çalışma alanına özel değildir, bu yüzden `PanelRepository`'de (her metot `wsId` alır) değil burada durur. Veri kaynağı bayrağından
 * (`DATA_SOURCE`) BAĞIMSIZDIR: betikler her zaman gerçek kayda bakar, testler kendi istemcisini verir. Bu dosya `next/*` ve `@/lib/data`
 * (panel bağlamı) içe aktarmaz; böylece `tsx` betikleri (react-server koşulu) güvenle yükler. Panel tarafı: `registry.ts`.
 *
 * Oluşturma `public.create_workspace` (0013) ile TEK işlemde: çalışma alanı + `LOCAL_USER_ID` için `owner` üyelik + kendi hesap
 * (`scrape_only`) + uyarı ayarı satırı. Bütçe tavanı tablo varsayılanında kalır; ölçüm tavanı NULL (onaysız). Otomatik toplama
 * BAŞLATILMAZ (Apify parası kullanıcı onayına bağlı): yeni çalışma alanı boş doğar.
 */
import "server-only";

import { parseOrThrow } from "@/lib/data/parse-input";
import { RepositoryError } from "@/lib/data/repository";
import { toRepositoryError, unwrap } from "@/lib/data/supabase/errors";
import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import type { Platform } from "@/lib/domain/platform";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { createWorkspaceSchema, slugBase, workspaceSettingsSchema } from "@/lib/workspace/create-input";

export interface WorkspaceAccountRef {
  platform: Platform;
  handle: string;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  /** Mock çalışma alanında yoktur. */
  slug?: string;
  /** Kendi hesaplar (bağlantı durumundan bağımsız). */
  accounts: WorkspaceAccountRef[];
}

/** Supabase'deki tüm çalışma alanları (kayıt sırasıyla). */
export async function listSupabaseWorkspaces(db: AdminClient = getAdminClient()): Promise<WorkspaceListItem[]> {
  const rows = unwrap(
    await db
      .from("workspaces")
      .select("id, name, slug, created_at, social_accounts(platform, handle)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    accounts: [...row.social_accounts]
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .map(({ platform, handle }) => ({ platform, handle })),
  }));
}

/**
 * Supabase'de yeni çalışma alanı (TEK işlem: `create_workspace`). Girdi `createWorkspaceSchema` ile doğrulanır (geçersiz →
 * `invalid_input`). `userId`: sahip (varsayılan `LOCAL_USER_ID`). Dönen kayıt yeni çalışma alanıdır (id, slug).
 */
export async function createSupabaseWorkspace(
  input: unknown,
  options: { db?: AdminClient; userId?: string } = {},
): Promise<WorkspaceListItem> {
  const parsed = parseOrThrow(createWorkspaceSchema, input, "Girilen bilgiler geçersiz.");
  const userId = options.userId ?? readLocalSupabaseEnv().userId;
  const { data, error } = await (options.db ?? getAdminClient()).rpc("create_workspace", {
    p_user: userId,
    p_name: parsed.name,
    p_slug: slugBase(parsed.name),
    p_timezone: parsed.timezone,
    p_audience_timezone: parsed.audienceTimezone ?? "",
    p_niche_brief: parsed.nicheBrief ?? "",
    p_compliance_region: parsed.complianceRegion,
    p_platform: parsed.platform,
    p_handle: parsed.handle,
    p_content_language: parsed.contentLanguage ?? "",
    p_account_type: parsed.accountType,
  });
  if (error) {
    // 23503: üyelik satırı `auth.users`'ta olmayan kullanıcıya bağlanamadı (LOCAL_USER_ID yanlış).
    if (error.code === "23503") {
      throw new RepositoryError("invalid_state", "Yerel kullanıcı kaydı bulunamadı (LOCAL_USER_ID; supabase/seed.sql başlığındaki değer).");
    }
    throw toRepositoryError(error);
  }
  return { id: data.id, name: data.name, slug: data.slug, accounts: [{ platform: parsed.platform, handle: parsed.handle }] };
}

/**
 * Var olan çalışma alanının YALNIZ hesap türünü ve/veya içerik dilini günceller (`npm run workspace -- set`). Girdi `workspaceSettingsSchema`
 * ile doğrulanır (geçersiz → `invalid_input`); başka alana dokunulmaz. Çalışma alanı yoksa `not_found`. Dönen kayıt güncel tür/dildir.
 */
export async function updateSupabaseWorkspaceSettings(
  workspaceId: string,
  input: unknown,
  options: { db?: AdminClient; userId?: string } = {},
): Promise<{ id: string; name: string; slug: string; accountType: string; contentLanguage?: string; agentMonthlyCapUsd?: number }> {
  const parsed = parseOrThrow(workspaceSettingsSchema, input, "Girilen bilgiler geçersiz.");
  const columns: {
    account_type?: string;
    content_language?: string;
    agent_monthly_cap_usd?: number;
    agent_cap_approved_at?: string;
    agent_cap_approved_by?: string;
    collect_every_days?: number;
    collect_video_limit?: number;
    rival_target?: number;
  } = {};
  if (parsed.accountType !== undefined) columns.account_type = parsed.accountType;
  if (parsed.contentLanguage !== undefined) columns.content_language = parsed.contentLanguage;
  if (parsed.agentMonthlyCapUsd !== undefined) {
    // Tavanı vermek onaydır (panel ayarıyla aynı): tavan + onay anı + onaylayan birlikte yazılır (DB check: tavan ↔ onay anı çift).
    columns.agent_monthly_cap_usd = parsed.agentMonthlyCapUsd;
    columns.agent_cap_approved_at = new Date().toISOString();
    columns.agent_cap_approved_by = options.userId ?? readLocalSupabaseEnv().userId;
  }
  if (parsed.collectEveryDays !== undefined) columns.collect_every_days = parsed.collectEveryDays;
  if (parsed.collectVideoLimit !== undefined) columns.collect_video_limit = parsed.collectVideoLimit;
  if (parsed.rivalTarget !== undefined) columns.rival_target = parsed.rivalTarget;
  const row = unwrap(
    await (options.db ?? getAdminClient()).from("workspaces").update(columns).eq("id", workspaceId).select("id, name, slug, account_type, content_language, agent_monthly_cap_usd").maybeSingle(),
  );
  if (!row) throw new RepositoryError("not_found", `Çalışma alanı bulunamadı: ${workspaceId}`);
  return {
    id: row.id, name: row.name, slug: row.slug, accountType: row.account_type, contentLanguage: row.content_language ?? undefined,
    ...(row.agent_monthly_cap_usd === null ? {} : { agentMonthlyCapUsd: row.agent_monthly_cap_usd }),
  };
}
