/**
 * Halka zincirinin sıra tablosu (TEK yer): topla → analiz → etiket → plan → fiş. Hangi adımın sırada olduğunu `deriveCycle` söyler;
 * burada yalnız "zincir hangi adımı kendiliğinden açabilir" yazılır. Açabilir = $0 harcayan iş türü (`JOB_KIND_SPEC[kind].spend === "never"`);
 * para harcayan adım (`collect`, `discover`, `onboarding`, tutarlı `measure` / `routine`) bu tabloda YOKTUR: zincir orada durur ve onay ister.
 * Ölçüm (`measure_zernio`) zincirin parçası değil, günlük zamanlayıcının işidir; yine de `ilerlet` onu da açabilir ($0).
 */
import { JOB_KIND_SPEC, type JobKind } from "@/lib/domain/panel-job";
import type { CycleStepId } from "@/lib/cycle/types";

/** Zincirin kendiliğinden açabildiği adımlar ve iş türleri. */
export const CHAIN_STEP_KINDS: Partial<Record<CycleStepId, JobKind>> = {
  analyze: "analyze",
  label: "label",
  plan: "plan",
  slip: "order",
  measure: "measure_zernio",
  // Yayın adımı iki türden birini açar (`chainKindOf`): dönen videoyu onaya hazırlar ya da insanca ONAYLANMIŞ satırı gönderir. İkisi de $0'dır, onay vermez.
  share: "publish",
};

const SHARE_KINDS: readonly JobKind[] = ["order_return", "publish"];

/** Sıradaki adımın zincirce açılabilecek iş türü (yoksa undefined). */
export function chainKindOf(step: { id: CycleStepId; jobKind?: JobKind }): JobKind | undefined {
  if (step.id === "share") return step.jobKind !== undefined && SHARE_KINDS.includes(step.jobKind) ? step.jobKind : undefined;
  return CHAIN_STEP_KINDS[step.id];
}

/** Zincirin açtığı (günlük tavana sayılan) iş türleri. */
export const CHAIN_JOB_KINDS: readonly JobKind[] = [...new Set([...Object.values(CHAIN_STEP_KINDS), "order_return" as const])];

/** Zincirin açabileceği tür gerçekten $0 mı (tablo yanlış genişletilirse yükleme anında düşer; ayrıca testli). */
export function isChainSafeKind(kind: JobKind): boolean {
  return CHAIN_JOB_KINDS.includes(kind) && JOB_KIND_SPEC[kind].spend === "never";
}
