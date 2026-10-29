import { isCopyEdition } from "@/lib/edition";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/**
 * Kulis kapısı (TEK yer): derin ekranlar (ikinci düzey sekmeler, Kulis menüsü, Reklamlar) yalnız yönetici modunda VE müşteri kopyası
 * olmayan sürümde görünür. Kopyada ya da barındırılmış (yönetici modu kapalı) panelde müşteri sade görünümü (4 ana ekran) görür;
 * ekranlar silinmez, adresle açılırsa kendi kapılarını sorar.
 */
export function isBackstageVisible(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return isOperatorMode(env) && !isCopyEdition(env.PANEL_EDITION ?? "");
}
