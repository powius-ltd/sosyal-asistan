/**
 * Sipariş (fiş) klasörünün kökü: TEK çözüm yeri. Sıra: `SIPARIS_KOK` env → müşteri kopyasında repo içi `siparisler/` → bizim
 * kurulumda `/opt/panel/siparisler` (PANEL_EDITION tanımsızken davranış değişmez). Saf: ortam parametreyle verilir.
 */
import { join } from "node:path";

import { panelEdition } from "@/lib/edition";

export const SAAS_ORDERS_DIR = "/opt/panel/siparisler";

export function orderRootOf(env: Readonly<Record<string, string | undefined>> = process.env, cwd: string = process.cwd()): string {
  const explicit = env.SIPARIS_KOK?.trim();
  if (explicit) return explicit;
  return panelEdition(env.PANEL_EDITION) === "kopya" ? join(cwd, "siparisler") : SAAS_ORDERS_DIR;
}
