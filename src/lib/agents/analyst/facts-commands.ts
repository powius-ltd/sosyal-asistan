/**
 * Genel komut eylemleri (saf): durumdan KOD türetir, ajan yalnız seçer. Hesap türü ve veri durumu işe yaramayacak adımı baştan eler:
 *  - "etiketle": yalnız açı × farkındalık etiketlemesi uygulanan hesapta (`appliesAngleLabeling`) ve etiketsiz video varsa;
 *  - "planı üret": yalnız bu hafta/gelecek hafta için plan yoksa VE plan üretilebilir durumdaysa (`planGenerable`): analizli video var ve
 *    öğrenilecek bir kaynak var (izlenen rakip ya da kendi tutanlar). Rakipsiz, tutansız hesapta plan boş kalır: önerilmez.
 */
import { commandAction } from "@/lib/agents/analyst/facts-entries";
import type { ActionOption } from "@/lib/agents/analyst/facts-types";
import { appliesAngleLabeling, type AccountType } from "@/lib/domain/account-type";

/** Veri bu günden eskiyse "toplama öner" komutu sunulur. */
export const COLLECT_SUGGEST_DAYS = 7;

/** Plan üretilebilir mi: analizli video var ve en az bir öğrenme kaynağı var (izlenen rakip ya da kendi tutanlar). */
export function planGenerable(input: { analyzedCount: number; hasRivals: boolean; ownBestCount: number }): boolean {
  return input.analyzedCount > 0 && (input.hasRivals || input.ownBestCount > 0);
}

export interface CommandState {
  accountType: AccountType;
  /** Son başarılı toplamadan geçen gün; hiç toplama yoksa undefined. */
  daysSinceCollect?: number;
  /** Analizi `ok` olmayan içerik var mı. */
  hasUnanalyzed: boolean;
  /** Açı × farkındalık etiketsiz video sayısı (etiketleme uygulanmayan hesapta 0). */
  unlabeledCount: number;
  /** Planın bugüne göre yeri: bu hafta/gelecek hafta planı varsa `this_week`/`next_week`; yoksa ya da yalnız geçmiş hafta varsa `undefined`/`past_week`. */
  planRole?: "this_week" | "next_week" | "past_week";
  planGenerable: boolean;
  dueCount: number;
}

export function commandActions(state: CommandState): ActionOption[] {
  const commands: ActionOption[] = [];
  if (state.daysSinceCollect === undefined || state.daysSinceCollect >= COLLECT_SUGGEST_DAYS) commands.push(commandAction("collect"));
  if (state.hasUnanalyzed) commands.push(commandAction("analyze"));
  if (appliesAngleLabeling(state.accountType) && state.unlabeledCount > 0) commands.push(commandAction("label"));
  if ((state.planRole === undefined || state.planRole === "past_week") && state.planGenerable) commands.push(commandAction("plan"));
  if (state.dueCount > 0) commands.push(commandAction("measure"));
  return commands;
}
