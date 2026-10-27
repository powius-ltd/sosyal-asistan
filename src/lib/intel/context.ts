/**
 * Betik bağlamı (analyze:now, plan:week ortak): service role istemcisi + Supabase deposu + çalışma alanı. Tek saat `now` betiğin
 * başında alınır ve her adıma aynen geçirilir. Eksik ortam değişkeninin yalnız ADI yazılır (değer asla).
 */
import "server-only";

import type { Workspace } from "@/lib/domain/run";
import type { PanelRepository } from "@/lib/data/repository";
import { createSupabaseRepositoryFromEnv } from "@/lib/data/supabase/from-env";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceArg } from "@/lib/workspace/resolve-arg";

export interface IntelContext {
  client: AdminClient;
  repo: PanelRepository;
  workspaceId: string;
  /** Çalışma alanı slug'ı (çıktı klasörü `docs/<konu>/<slug>/`); yoksa kimliğin ilk 8 karakteri kullanılır (`workspaceDirName`). */
  workspaceSlug?: string;
  workspace: Workspace;
  now: Date;
}

export function missingEnv(names: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  return names.filter((name) => !env[name]?.trim());
}

/**
 * Betik bağlamı. `workspaceRef`: `--workspace=` değeri (id | slug | ad; `lib/workspace/resolve-arg`); verilmezse `LOCAL_WORKSPACE_ID`.
 * Bilinmeyen değer açık hata + mevcut çalışma alanları listesiyle reddedilir. Çalışma alanını çözen TEK yer burasıdır (betikler
 * `LOCAL_WORKSPACE_ID`'yi doğrudan okumaz).
 */
export async function createIntelContext(now: Date, workspaceRef?: string): Promise<IntelContext> {
  const target = await resolveWorkspaceArg(workspaceRef);
  const repo = createSupabaseRepositoryFromEnv();
  const workspace = await repo.getWorkspace(target.id);
  if (workspace === null) throw new Error(`Çalışma alanı bulunamadı: ${target.id}.`);
  return { client: getAdminClient(), repo, workspaceId: target.id, workspaceSlug: target.slug, workspace, now };
}

/** Hafif görevler (eleme, kümeleme) için model: `LLM_MODEL_LIGHT` tanımlıysa o, değilse undefined (CLI varsayılanı). */
export function lightModel(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const value = env.LLM_MODEL_LIGHT?.trim();
  return value ? value : undefined;
}
