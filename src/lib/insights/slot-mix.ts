/**
 * Plan karması (kod): haftalık plan slotlarının erişim / satış amacı. Dağılım `splitPlanSlots` ile (`domain/account-type.ts`: `business` hepsi
 * satış, `creator` hepsi erişim, `mixed` varsayılan %60 / %40); bu dosya yalnız sıralamayı (dönüşümlü dizilim) ve bir fikrin amacını
 * belirleme kurallarını taşır. Saf; LLM yok.
 */
import { accountTypeProfile, splitPlanSlots, type AccountType, type ContentMix } from "@/lib/domain/account-type";
import type { CtaType } from "@/lib/domain/taxonomy";

/** Fikrin / slotun amacı: `reach` (izlenme, kaydet/paylaş, takipçi) ya da `sales` (güven → müşteri → satış). */
export type SlotPurpose = keyof ContentMix;

export const PURPOSE_LABEL: Record<SlotPurpose, string> = { reach: "erişim", sales: "satış" };

/**
 * `total` slotun amaç sırası: sayılar `splitPlanSlots`'tan; karma türde amaçlar dönüşümlü dizilir (kalan sayısı fazla olan önce, eşitlikte
 * bir önceki amacın tersi): 3 slot → erişim, satış, erişim. Tek amaçlı türde hepsi aynı amaçtır.
 */
export function slotPurposes(type: AccountType, total: number): SlotPurpose[] {
  let { reach, sales } = splitPlanSlots(type, total);
  const out: SlotPurpose[] = [];
  while (reach + sales > 0) {
    const last = out[out.length - 1];
    const pickReach = reach > sales || (reach === sales && last !== "reach" && reach > 0);
    if (pickReach && reach > 0) {
      out.push("reach");
      reach -= 1;
    } else {
      out.push("sales");
      sales -= 1;
    }
  }
  return out;
}

/** Türün TEK amacı (karma ve tanımsızda undefined: fikir başına belirlenir). */
export function purposeOfType(type: AccountType): SlotPurpose | undefined {
  const { reach, sales } = accountTypeProfile(type).contentMix;
  if (sales === 0) return "reach";
  return reach === 0 ? "sales" : undefined;
}

/** CTA türünden amaç (modelin etiketi yoksa): işletme CTA'ları (yorum anahtar kelimesi, DM, bio linki, randevu) satış; diğerleri erişim. */
export function inferPurposeFromCta(ctaType: CtaType | undefined): SlotPurpose {
  return ctaType !== undefined && accountTypeProfile("business").ctaTypes.includes(ctaType) ? "sales" : "reach";
}
