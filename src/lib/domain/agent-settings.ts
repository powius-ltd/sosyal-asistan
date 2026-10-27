/**
 * Yönetici ajan ayarlarının sınırları ve varsayılanları (migration 0030 CHECK'leriyle birebir; `agent-settings.test.ts` SQL'le karşılaştırır).
 * Tek yerde durur: yama şeması, depo, halka ve Ayarlar kartı buradan okur.
 */
import type { Workspace } from "@/lib/domain/run";

export const AGENT_SETTING_LIMITS = {
  collectEveryDays: { min: 1, max: 60, default: 14 },
  collectVideoLimit: { min: 5, max: 50, default: 25 },
  rivalTarget: { min: 0, max: 10, default: 3 },
} as const;

/** Yeni hesabın ajan tavanı (USD); `create_workspace` bunu yazar. */
export const AGENT_DEFAULT_CAP_USD = 3;

export interface AgentSettings {
  collectEveryDays: number;
  collectVideoLimit: number;
  rivalTarget: number;
}

/** Çalışma alanının ajan ayarları; alan yoksa (eski kayıt / örnek veri) varsayılan. */
export function agentSettingsOf(workspace: Pick<Workspace, "collectEveryDays" | "collectVideoLimit" | "rivalTarget">): AgentSettings {
  const limits = AGENT_SETTING_LIMITS;
  return {
    collectEveryDays: workspace.collectEveryDays ?? limits.collectEveryDays.default,
    collectVideoLimit: workspace.collectVideoLimit ?? limits.collectVideoLimit.default,
    rivalTarget: workspace.rivalTarget ?? limits.rivalTarget.default,
  };
}
