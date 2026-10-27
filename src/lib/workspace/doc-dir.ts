/**
 * Çalışma alanına özel çıktı klasörü (saf): `docs/<konu>/<slug>/…`. Slug yoksa kimliğin ilk 8 karakteri. Çalışma alanları birbirinin
 * dosyasını ezmesin diye haftalık plan (`haftalik-plan`) ve rutin raporu (`rutin`) bunu kullanır. Eski düz dosyalar taşınmaz.
 */
import { join } from "node:path";

export type WorkspaceDocTopic = "haftalik-plan" | "rutin";

export interface WorkspaceDirRef {
  id: string;
  slug?: string | null;
}

export function workspaceDirName({ id, slug }: WorkspaceDirRef): string {
  const name = slug?.trim();
  return name ? name : id.slice(0, 8);
}

export function workspaceDocDir(rootDir: string, topic: WorkspaceDocTopic, workspace: WorkspaceDirRef): string {
  return join(rootDir, "docs", topic, workspaceDirName(workspace));
}
