/**
 * Çalışma alanı kaydı, PANEL tarafı (operatör modu): veri kaynağına göre liste/oluşturma. Mock kaynakta (`DATA_SOURCE` yok)
 * `listWorkspaces` yalnız mock çalışma alanını döner, `createWorkspace` `not_implemented` verir; Supabase'de `registry-db.ts`'e gider.
 * Betikler bu dosyayı DEĞİL `registry-db.ts`'i kullanır (panel bağlamı `@/lib/data` betik ortamında yüklenmez).
 */
import "server-only";

import { getDataSource, getRepository } from "@/lib/data";
import { parseOrThrow } from "@/lib/data/parse-input";
import { RepositoryError } from "@/lib/data/repository";
import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import { createWorkspaceSchema } from "@/lib/workspace/create-input";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { createSupabaseWorkspace, listSupabaseWorkspaces, type WorkspaceListItem } from "@/lib/workspace/registry-db";

export type { WorkspaceListItem } from "@/lib/workspace/registry-db";

/** Mock kaynakta yalnız mock çalışma alanı, Supabase'de tüm kayıt. */
export async function listWorkspaces(): Promise<WorkspaceListItem[]> {
  if (getDataSource() === "supabase") return listSupabaseWorkspaces();
  const repo = getRepository();
  const workspace = await repo.getWorkspace(MOCK_WORKSPACE_ID);
  if (!workspace) return [];
  const accounts = await repo.listOwnAccounts(MOCK_WORKSPACE_ID);
  return [{ id: workspace.id, name: workspace.name, accounts: accounts.map(({ platform, handle }) => ({ platform, handle })) }];
}

/**
 * Geçiş/oluşturma özelliği açıksa (operatör modu + gerçek veri kaynağı) çalışma alanları; kapalıysa `undefined`. Düzen ve Ayarlar
 * sayfası özelliğin açık olup olmadığını buradan öğrenir (mod kuralı tek yerde: `isOperatorMode`).
 */
export async function listOperatorWorkspaces(): Promise<WorkspaceListItem[] | undefined> {
  if (!isOperatorMode() || getDataSource() !== "supabase") return undefined;
  return listSupabaseWorkspaces();
}

/**
 * Varsayılan çalışma alanı mı (panelin son durağı: çerez yok / silinmiş kayda düşünce açılan; mock'ta tek çalışma alanı). Bu çalışma alanı
 * HİÇBİR koşulda kaldırılmaz (başlangıçta "bu ben değilim" yolu dahil). Değer yalnız `readLocalSupabaseEnv`'den okunur.
 */
export function isDefaultWorkspace(workspaceId: string): boolean {
  return getDataSource() === "supabase" ? readLocalSupabaseEnv().workspaceId === workspaceId : workspaceId === MOCK_WORKSPACE_ID;
}

/** Mock kaynakta `not_implemented` (girdi yine önce doğrulanır), Supabase'de `createSupabaseWorkspace`. */
export async function createWorkspace(input: unknown): Promise<WorkspaceListItem> {
  if (getDataSource() === "supabase") return createSupabaseWorkspace(input);
  parseOrThrow(createWorkspaceSchema, input, "Girilen bilgiler geçersiz.");
  throw new RepositoryError("not_implemented", "Örnek (mock) veri kaynağında çalışma alanı oluşturulamaz (DATA_SOURCE=supabase gerekir).");
}
