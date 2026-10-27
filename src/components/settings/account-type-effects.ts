/**
 * Hesap türünün sonuçları, ayar alanının altında tek satır: hangi matris(ler), açı etiketlemesi, plan karması. Metin türün PROFİLİNDEN
 * üretilir (`accountTypeProfile`): tür adına bakılmaz, yeni tür/alan eklenince satır kendiliğinden doğru kalır.
 */
import { MATRIX_KIND_LABEL } from "@/components/matrix/matrix-copy";
import type { AccountTypeProfile } from "@/lib/domain/account-type";
import { formatPercent } from "@/lib/format";

export function accountTypeEffects(profile: AccountTypeProfile): string {
  const matrices = profile.matrices.map((kind) => MATRIX_KIND_LABEL[kind]).join(" + ");
  const { reach, sales } = profile.contentMix;
  const mix = [reach > 0 ? `erişim ${formatPercent(reach, 0)}` : undefined, sales > 0 ? `satış ${formatPercent(sales, 0)}` : undefined].filter((part) => part !== undefined).join(" / ");
  return `Matris: ${matrices} · Açı etiketlemesi: ${profile.appliesAngleLabeling ? "yapılır" : "yapılmaz"} · Plan karması: ${mix}`;
}
