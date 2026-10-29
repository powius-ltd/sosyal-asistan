/**
 * Ayarlar sayfası ve action'ların ortak okuması: geçerli hesabın slug'ı (çalışma alanı gövdeden DEĞİL `getPanelContext()`'ten) ve
 * kart satırları. Kapı kapalıysa satır döndürmez (kart çizilmez).
 */
import "server-only";

import { getPanelContext } from "@/lib/data";
import { localKeysEnabled } from "@/lib/local-keys/gate";
import { describeKeys, type KeyRow } from "@/lib/local-keys/status";
import { listWorkspaces } from "@/lib/workspace/registry";

export async function currentWorkspaceSlug(): Promise<string | undefined> {
  const { wsId } = await getPanelContext();
  const known = await listWorkspaces();
  return known.find((item) => item.id === wsId)?.slug;
}

export async function loadKeyRows(): Promise<KeyRow[] | undefined> {
  if (!localKeysEnabled()) return undefined;
  return describeKeys(await currentWorkspaceSlug());
}
