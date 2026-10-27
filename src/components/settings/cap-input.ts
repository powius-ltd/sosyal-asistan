import { MAX_CAP_USD } from "@/lib/data/queries";

export type CapInput = { ok: true; value: number } | { ok: false; message: string };

/**
 * Tavan alanı girdisi: ZORUNLU sayı, 0–`MAX_CAP_USD` USD ("5,5" ve "5.5" geçerli). Boş bırakılamaz: tavan
 * kaldırılamaz, harcamayı kapatmak için 0 girilir. Bu yalnız istemci kolaylığıdır; asıl doğrulama sunucudadır
 * (`workspacePatchSchema` + depo).
 */
export function parseCapInput(raw: string): CapInput {
  const text = raw.trim().replace(",", ".");
  if (text === "") return { ok: false, message: `Tavan zorunlu: 0–${MAX_CAP_USD} USD arası bir sayı gir (0 = harcama kapalı).` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: "Tavan bir sayı olmalı." };
  if (value < 0) return { ok: false, message: "Tavan negatif olamaz." };
  if (value > MAX_CAP_USD) return { ok: false, message: `Tavan en fazla ${MAX_CAP_USD} USD olabilir.` };
  return { ok: true, value };
}
