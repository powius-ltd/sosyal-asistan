"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { switchWorkspace } from "@/app/actions/workspace";
import { callAction } from "@/components/common/call-action";
import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { WORKSPACES_SECTION_ID } from "@/components/workspace/anchors";
import { ROUTES } from "@/lib/routes";

export interface WorkspaceOption {
  id: string;
  name: string;
}

/** "Yeni çalışma alanı" satırı: gerçek bir çalışma alanı kimliği olamaz (UUID değil). */
const NEW_VALUE = "__new__";

/**
 * Üst şeritteki çalışma alanı seçici (OPERATÖR MODU, yerel). Seçim server action'ıyla çerezde tutulur ve düzen yenilenir; sunucu
 * kimliği her istekte kayıtta var mı diye doğrular. "Yeni çalışma alanı…" Ayarlar'daki forma götürür.
 */
export function WorkspaceSwitcher({ current, workspaces }: { current: string; workspaces: readonly WorkspaceOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options: SelectOption[] = [
    ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
    { value: NEW_VALUE, label: "+ Yeni çalışma alanı…" },
  ];

  function onChange(value: string) {
    if (value === NEW_VALUE) {
      router.push(`${ROUTES.settings}#${WORKSPACES_SECTION_ID}`);
      return;
    }
    if (value === current) return;
    startTransition(async () => {
      const result = await callAction(() => switchWorkspace({ workspaceId: value }), "Çalışma alanı değiştirilemedi. Tekrar dene.");
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <div className="flex items-center gap-2" data-testid="workspace-switcher">
      <Building2 className="size-4 text-muted-foreground" aria-hidden />
      <LabeledSelect label="Çalışma alanı" hideLabel value={current} options={options} onChange={onChange} disabled={pending} className="h-8 w-56" />
    </div>
  );
}
