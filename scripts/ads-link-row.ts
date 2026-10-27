/** `npm run ads -- link` kayıt satırı ve ön kontrolü (saf; ağ ve DB yok). Hedef türü değişince karşı hedef sütunu AÇIKÇA null yazılır. */
import type { AdsCommand } from "./ads-args";

export type LinkCommand = Extract<AdsCommand, { command: "link" }>;

/** `ad_accounts` kısıtı: getiri modunda maliyet hedefi null; maliyet modunda getiri hedefi ve marj null. */
export function buildLinkRow(command: LinkCommand, workspaceId: string): Record<string, unknown> {
  const { goal, margin } = command;
  return {
    workspace_id: workspaceId,
    provider: "zernio",
    external_account_id: command.adAccount,
    ...(command.zernioAccount === undefined ? {} : { provider_account_id: command.zernioAccount }),
    ...(command.currency === undefined ? {} : { currency: command.currency }),
    ...(goal === undefined
      ? {}
      : goal.kind === "value"
        ? { goal_kind: "value", result_label: goal.resultLabel, target_return: goal.target, target_cost_per_result: null }
        : { goal_kind: "cost", result_label: goal.resultLabel, target_cost_per_result: goal.target, target_return: null, gross_margin: null }),
    ...(margin === undefined ? {} : { gross_margin: margin }),
  };
}

/** Yazımdan önce kayıtla çelişen istek varsa Türkçe neden; yoksa undefined. `existing`: kayıtlı hesap (yoksa null). */
export function linkProblem(command: LinkCommand, existing: { currency: string; goal_kind: string | null } | null): string | undefined {
  if (existing === null && command.currency === undefined) return "Yeni hesap için --currency=<TRY|USD…> gerekir (para birimi hesaba aittir; npm run ads -- accounts gösterir).";
  if (existing !== null && command.currency !== undefined && command.currency !== existing.currency) return `Kayıtlı para birimi ${existing.currency}; değiştirilmez (geçmiş tutarlar bozulur).`;
  if (typeof command.margin === "number" && command.goal === undefined && existing?.goal_kind !== "value") return "--margin için hesabın getiri hedefi (--goal=value) olmalı; hedefle birlikte ver.";
  return undefined;
}
