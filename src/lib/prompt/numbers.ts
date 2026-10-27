/**
 * Prompt içindeki sayıların dile göre yazımı. Türkçe prompt panelin tr-TR biçimini kullanır (`lib/format.ts`);
 * İngilizce prompt LLM'in yanlış okumaması için "1,250,000" / "4.6x" yazar (`Intl` yok: tek biçim, sunucuda deterministik).
 * Ölçülemeyen/sonlu olmayan girdi → undefined (çağıran "bilinmiyor" yazar; 0 uydurulmaz).
 */
import { formatDecimal, formatLift, formatNumber } from "@/lib/format";
import type { PromptLanguage } from "@/lib/prompt/types";

/** 1250000 → tr "1.250.000", en "1,250,000". */
export function promptNumber(n: number | undefined, language: PromptLanguage): string | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  if (language === "tr") return formatNumber(n);
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 4.62 → tr "4,6x", en "4.6x" (bir ondalık; tam sayı ise ondalıksız). 1'in altındaki gerçek ölçüm iki ondalıkla yazılır
 * (0.04 → "0,04x"): "0x" yazmak ölçümü sıfır gibi gösterirdi.
 */
export function promptLift(lift: number | undefined, language: PromptLanguage): string | undefined {
  if (lift === undefined || !Number.isFinite(lift)) return undefined;
  const small = lift > 0 && lift < 1;
  if (language === "tr") return small ? `${formatDecimal(lift, 2)}x` : formatLift(lift);
  return `${Number(lift.toFixed(small ? 2 : 1))}x`;
}
