import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABEL, type Platform } from "@/lib/domain/platform";

export interface WorkspaceListEntry {
  id: string;
  name: string;
  slug?: string;
  accounts: ReadonlyArray<{ platform: Platform; handle: string }>;
}

/** Mevcut çalışma alanları: ad, kendi hesaplar ve betiklerde `--workspace=` ile kullanılan slug. Geçerli olan işaretlenir. */
export function WorkspaceList({ workspaces, currentId }: { workspaces: readonly WorkspaceListEntry[]; currentId: string }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="workspace-list">
      {workspaces.map((workspace) => (
        <li key={workspace.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">
              {workspace.name}
              {workspace.id === currentId ? (
                <Badge variant="secondary" className="ml-2">
                  Geçerli
                </Badge>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {workspace.accounts.map((account) => `${PLATFORM_LABEL[account.platform]} @${account.handle}`).join(" · ") || "Kendi hesap yok"}
            </span>
          </div>
          <code className="text-xs text-muted-foreground">--workspace={workspace.slug ?? workspace.id.slice(0, 8)}</code>
        </li>
      ))}
    </ul>
  );
}
