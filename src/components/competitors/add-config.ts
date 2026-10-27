/**
 * "Rakip ekle" için ortak sabitler: hangi platformlar eklenebilir, tahmini maliyet notu.
 * Hem istemci (dialog) hem sunucu (action doğrulaması) kullanır — bu yüzden ayrı ve saf.
 */
import { PLATFORMS, type Platform } from "@/lib/domain/platform";
import { hasPlatformModule } from "@/lib/platforms/registry";

/** Modülü kayıtlı platformlar eklenebilir; kayıtsız olan "yakında" görünür. Sunucu da bunu zorunlu kılar. */
export const ADDABLE_PLATFORMS: readonly Platform[] = PLATFORMS.filter(hasPlatformModule);

export function isAddablePlatform(platform: Platform): boolean {
  return hasPlatformModule(platform);
}

/** İlk toplama için tahmini içerik sayısı ve Apify maliyeti (USD). Yalnız bilgi notu; gerçek tutar koşu sonunda yazılır. */
export const ESTIMATED_CONTENT_COUNT = 50;
export const ESTIMATED_COST_USD = 0.12;

const COMPLIANCE_NOTE_BASE = "Rakip verisi yalnız herkese açık, oturumsuz kaynaktan";
const COMPLIANCE_NOTE_TAIL = "alınır; reach, kaydetme ve izlenme süresi rakiplerde ölçülemez.";

/** Rakipler / Keşfet alt notu: sağlayıcı adı (Apify) yalnız yönetici görünümünde yazılır (D3-08). */
export function complianceNote(operator: boolean): string {
  return operator ? `${COMPLIANCE_NOTE_BASE} (Apify) ${COMPLIANCE_NOTE_TAIL}` : `${COMPLIANCE_NOTE_BASE} ${COMPLIANCE_NOTE_TAIL}`;
}
