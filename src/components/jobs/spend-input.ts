import { JOB_SPEND_MAX_USD } from "@/lib/domain/panel-job";
import { formatDecimal } from "@/lib/format";

export type SpendInput = { ok: true; value: number } | { ok: false; message: string };

/** Alanın altındaki kural cümlesi (hata metinleri de aynı sınırı söyler). */
export const SPEND_RULE = `0'dan büyük, en çok ${JOB_SPEND_MAX_USD} USD.`;

/**
 * Onay tutarı alanı: 0'dan büyük, en çok `JOB_SPEND_MAX_USD` USD ("0,15" ve "0.15" geçerli). Boş, sayı olmayan, 0, negatif ve sınır
 * üstü değer GÖNDERİLMEZ. İstemci kolaylığıdır; asıl doğrulama sunucudadır (`lib/data/job-input.ts` + DB kısıtı).
 */
export function parseSpendInput(raw: string): SpendInput {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { ok: false, message: `Tutar gir: ${SPEND_RULE}` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: "Tutar bir sayı olmalı." };
  if (value <= 0) return { ok: false, message: "Tutar 0'dan büyük olmalı." };
  if (value > JOB_SPEND_MAX_USD) return { ok: false, message: `Tutar en çok ${JOB_SPEND_MAX_USD} USD olabilir.` };
  return { ok: true, value };
}

/** Alanın ön değeri: önerilen tutar "0,15" biçiminde; öneri yoksa boş (0 ya da sınır uydurulmaz). */
export function spendInputDefault(suggestedUsd: number | undefined): string {
  return formatDecimal(suggestedUsd, 2) ?? "";
}
