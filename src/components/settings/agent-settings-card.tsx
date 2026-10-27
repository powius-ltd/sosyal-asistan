import { ShieldAlert, ShieldCheck } from "lucide-react";

import { AgentSettingsForm } from "@/components/settings/agent-settings-form";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { agentSettingsOf } from "@/lib/domain/agent-settings";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { Workspace } from "@/lib/domain/run";

/**
 * "Yönetici ajan" kartı: ajanın aylık harcama izni ve çalışma ritmi. Tavan ONAYSIZsa ajan para harcamaz (yalnız ücretsiz adımları açar).
 * Ajan hiçbir koşulda yayın onayı, çekim fişi onayı, tavan değişikliği, tavan aşımı ya da reklam yapmaz. Kart yalnız yönetici modunda çizilir (sayfa).
 */
export function AgentSettingsCard({ workspace, timeZone }: { workspace: Pick<Workspace, "agentMonthlyCapUsd" | "agentCapApprovedAt" | "collectEveryDays" | "collectVideoLimit" | "rivalTarget">; timeZone: string }) {
  const capUsd = workspace.agentMonthlyCapUsd;
  const approved = capUsd !== undefined;
  return (
    <SettingsSection
      title="Yönetici ajan"
      description="Halkayı yöneten ajan, bu aylık tavanın içinde yeni videoları toplar ve rakip arar. Yayın onayı, çekim fişi onayı, tavan değişikliği ve reklam her zaman sende kalır."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {approved ? (
            <>
              <Badge variant="outline" className="gap-1 border-transparent bg-success-soft text-success-soft-foreground">
                <ShieldCheck aria-hidden />
                Onaylı
              </Badge>
              <span>
                Aylık tavan <strong className="tabular">{formatUsd(capUsd) ?? "—"}</strong>
                {capUsd === 0 ? " (ajan para harcamaz)" : ""} · onay: {formatDateTime(workspace.agentCapApprovedAt, timeZone) ?? "zamanı kayıtlı değil"}
              </span>
            </>
          ) : (
            <>
              <Badge variant="outline" className="gap-1 border-transparent bg-warning-soft text-warning-soft-foreground">
                <ShieldAlert aria-hidden />
                Onaysız
              </Badge>
              <span>Onaysız: ajan para harcamaz, yalnız ücretsiz adımları açar.</span>
            </>
          )}
        </div>
        <AgentSettingsForm capUsd={capUsd} settings={agentSettingsOf(workspace)} />
      </div>
    </SettingsSection>
  );
}
