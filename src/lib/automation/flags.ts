/**
 * Otomatik işlerin açık/kapalı ayarları (`workspaces.auto_*`, migration 0037). Varsayılanlar TEK yerde: plan açık, ölçüm açık, üretim
 * kapalı (üretim para harcar, bilerek açılır). Alan yoksa (eski kayıt / örnek veri) varsayılan geçerlidir.
 */
import type { Workspace } from "@/lib/domain/run";

export const AUTOMATION_KEYS = ["weeklyPlan", "measure", "produce"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];
export type AutomationFlags = Record<AutomationKey, boolean>;

export const AUTOMATION_DEFAULTS: AutomationFlags = { weeklyPlan: true, measure: true, produce: false };

/**
 * Onaylı fikri kendiliğinden üretme (halka) kodda hazır mı? Hazır değilken satır "yakında" çizilir, anahtar yazılamaz (action reddeder).
 * Hazır olunca (para kapısıyla birlikte) `true` yapılır; ekran, action ve halka bunu birlikte okur.
 */
export const AUTOMATION_PRODUCE_READY = false;

/** Ayar anahtarı → `workspaces` yama alanı. */
export const AUTOMATION_PATCH_FIELD = { weeklyPlan: "autoWeeklyPlan", measure: "autoMeasure", produce: "autoProduce" } as const satisfies Record<AutomationKey, keyof Workspace>;

export function automationFlagsOf(workspace: Pick<Workspace, "autoWeeklyPlan" | "autoMeasure" | "autoProduce">): AutomationFlags {
  return {
    weeklyPlan: workspace.autoWeeklyPlan ?? AUTOMATION_DEFAULTS.weeklyPlan,
    measure: workspace.autoMeasure ?? AUTOMATION_DEFAULTS.measure,
    produce: workspace.autoProduce ?? AUTOMATION_DEFAULTS.produce,
  };
}
