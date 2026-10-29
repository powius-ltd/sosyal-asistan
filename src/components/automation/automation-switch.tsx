"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setAutomationAction } from "@/app/actions/automation";
import { callAction } from "@/components/common/call-action";
import { Switch } from "@/components/ui/switch";
import { AUTOMATION_COPY as COPY } from "@/lib/copy/automation";
import type { AutomationKey } from "@/lib/automation/flags";

interface AutomationSwitchProps {
  settingKey: AutomationKey;
  enabled: boolean;
  /** Erişilebilir ad: işin adı. */
  name: string;
}

/** Tek anahtar düğmesi (istemci yaprağı): tıklayınca kaydeder, hata olursa eski duruma döner ve nedenini söyler. */
export function AutomationSwitch({ settingKey, enabled, name }: AutomationSwitchProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await callAction(() => setAutomationAction({ key: settingKey, enabled: next }), COPY.toggle.failed);
      if (!result.ok) {
        setChecked(!next);
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex min-h-tap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{checked ? COPY.state.on : COPY.state.off}</span>
      <Switch checked={checked} disabled={pending} onCheckedChange={change} aria-label={name} />
    </label>
  );
}
