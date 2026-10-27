"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { updateMeasureCap } from "@/app/actions/settings";
import { callAction } from "@/components/common/call-action";
import { parseCapInput } from "@/components/settings/cap-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_CAP_USD } from "@/lib/data/queries";

/** Onay metni (sabit): kaydetmek bu cümleyi onaylamak demektir. */
export const MEASURE_CAP_CONSENT = "Bu tutara kadar aylık ölçüm harcamasını onaylıyorum";

/**
 * Aylık ölçüm tavanı formu. Tavan zorunlu bir sayıdır (0–1000 USD; 0 = ölçüm kapalı); kaydetmek onaydır, onay zamanı sunucuda yazılır.
 * İstemci doğrulaması yalnız kolaylıktır, asıl doğrulama sunucudadır (`updateMeasureCap`).
 */
export function MeasureCapForm({ initialCapUsd }: { initialCapUsd?: number }) {
  const [value, setValue] = useState(initialCapUsd === undefined ? "" : String(initialCapUsd));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cap = parseCapInput(value);
    setError(cap.ok ? undefined : cap.message);
    if (!cap.ok) return;
    startTransition(async () => {
      const result = await callAction(() => updateMeasureCap({ measureMonthlyCapUsd: cap.value }), "Tavan kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      if (result.ok) toast.success("Ölçüm tavanı onaylandı ve kaydedildi.");
      else toast.error(result.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <fieldset disabled={pending} className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="ws-measure-cap">Aylık ölçüm tavanı (USD)</Label>
        <Input
          id="ws-measure-cap"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Örn. 0,50"
          required
          aria-invalid={error !== undefined}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">0–{MAX_CAP_USD} USD; 0 = ölçüm kapalı. Yalnız Reels ölçüm koşuları sayılır.</p>
      </fieldset>
      <p className="text-sm font-medium">{MEASURE_CAP_CONSENT}.</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Onayla ve kaydet"}
        </Button>
      </div>
    </form>
  );
}
