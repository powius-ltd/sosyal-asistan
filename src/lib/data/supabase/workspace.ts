/**
 * Workspace, kendi hesaplar ve bağlantılar. `requireWorkspace` özet okumaların ve yazmaların ortak kapısıdır:
 * bilinmeyen workspace → `not_found` (liste okumaları boş döner, bkz. `PanelRepository`).
 */
import type { Connections } from "@/lib/domain/connection";
import type { OwnAccount } from "@/lib/domain/competitor";
import type { Workspace } from "@/lib/domain/run";
import type { WorkspacePatch } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { parseWorkspacePatch } from "@/lib/data/workspace-patch";
import { getIntegrationStatuses } from "@/lib/settings/integrations";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import {
  OWN_ACCOUNT_COLUMNS,
  WORKSPACE_COLUMNS,
  toOwnAccount,
  toWorkspace,
  type WorkspaceRow,
} from "@/lib/data/supabase/mappers/accounts";

export async function getWorkspace(ctx: SupabaseContext, wsId: string): Promise<Workspace | null> {
  if (!isUuid(wsId)) return null;
  const row = unwrap(await ctx.db.from("workspaces").select(WORKSPACE_COLUMNS).eq("id", wsId).maybeSingle());
  return row ? toWorkspace(row) : null;
}

/** Workspace yoksa `not_found`; varsa döndürür (saat dilimi/tavan gerektiren okumalar bunu kullanır). */
export async function requireWorkspace(ctx: SupabaseContext, wsId: string): Promise<Workspace> {
  const workspace = await getWorkspace(ctx, wsId);
  if (!workspace) throw new RepositoryError("not_found", `Workspace bulunamadı: ${wsId}`);
  return workspace;
}

/** Yalnız verilen alanlar değişir; tavan kaldırılamaz, boş niş metni tanımı siler. Doğrulama `workspace-patch.ts`'te (ortak). */
export async function updateWorkspace(ctx: SupabaseContext, wsId: string, patchInput: WorkspacePatch): Promise<Workspace> {
  const current = await requireWorkspace(ctx, wsId);
  const patch = parseWorkspacePatch(patchInput);
  const columns: Partial<
    Pick<WorkspaceRow, "apify_monthly_cap_usd" | "llm_monthly_cap_usd" | "measure_monthly_cap_usd" | "measure_cap_approved_at" | "agent_monthly_cap_usd" | "agent_cap_approved_at" | "collect_every_days" | "collect_video_limit" | "rival_target" | "niche_brief" | "compliance_region" | "content_language" | "account_type">
  > & { agent_cap_approved_by?: string | null } = {};
  if (patch.apifyMonthlyCapUsd !== undefined) columns.apify_monthly_cap_usd = patch.apifyMonthlyCapUsd;
  if (patch.llmMonthlyCapUsd !== undefined) columns.llm_monthly_cap_usd = patch.llmMonthlyCapUsd;
  if (patch.measureMonthlyCapUsd !== undefined) {
    // Ölçüm tavanını vermek onaydır: tavan ve onay anı birlikte yazılır (DB check: ikisi birlikte dolu/boş).
    columns.measure_monthly_cap_usd = patch.measureMonthlyCapUsd;
    columns.measure_cap_approved_at = ctx.now().toISOString();
  }
  if (patch.agentMonthlyCapUsd !== undefined) {
    // Ajan tavanını vermek onaydır: tavan, onay anı ve onaylayan birlikte yazılır (DB check: tavan ↔ onay anı çift).
    columns.agent_monthly_cap_usd = patch.agentMonthlyCapUsd;
    columns.agent_cap_approved_at = ctx.now().toISOString();
    columns.agent_cap_approved_by = ctx.approverUserId ?? null;
  }
  if (patch.collectEveryDays !== undefined) columns.collect_every_days = patch.collectEveryDays;
  if (patch.collectVideoLimit !== undefined) columns.collect_video_limit = patch.collectVideoLimit;
  if (patch.rivalTarget !== undefined) columns.rival_target = patch.rivalTarget;
  if (patch.nicheBrief !== undefined) columns.niche_brief = patch.nicheBrief === "" ? null : patch.nicheBrief;
  if (patch.complianceRegion !== undefined) columns.compliance_region = patch.complianceRegion;
  if (patch.contentLanguage !== undefined) columns.content_language = patch.contentLanguage;
  if (patch.accountType !== undefined) columns.account_type = patch.accountType;
  if (Object.keys(columns).length === 0) return current;

  const row = unwrap(await ctx.db.from("workspaces").update(columns).eq("id", wsId).select(WORKSPACE_COLUMNS).maybeSingle());
  if (!row) throw new RepositoryError("not_found", `Workspace bulunamadı: ${wsId}`);
  return toWorkspace(row);
}

export async function listOwnAccounts(ctx: SupabaseContext, wsId: string): Promise<OwnAccount[]> {
  if (!isUuid(wsId)) return [];
  const rows = unwrap(
    await ctx.db.from("social_accounts").select(OWN_ACCOUNT_COLUMNS).eq("workspace_id", wsId).order("created_at", { ascending: true }).order("id", { ascending: true }),
  );
  return rows.map(toOwnAccount);
}

/** Ayarlar: kendi hesap bağlantıları + entegrasyon anahtarı var/yok (DEĞER asla dönmez; token'lar `social_account_tokens`'ta kalır). */
export async function getConnections(ctx: SupabaseContext, wsId: string): Promise<Connections> {
  if (!(await getWorkspace(ctx, wsId))) return { accounts: [], integrations: [] };
  return { accounts: await listOwnAccounts(ctx, wsId), integrations: getIntegrationStatuses() };
}
