/** Analist testleri için ortak hesap bölümü (yalnız testler import eder). */
import type { AccountFacts } from "@/lib/agents/analyst/facts-types";

export const TEST_ACCOUNT: AccountFacts = { type: "İşletme / koç", purpose: "Güven → müşteri → satış.", matrices: ["angle_funnel"], hasRivals: true };
