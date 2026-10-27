"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { updateAgentSettings } from "@/app/actions/agent-settings";
import { callAction } from "@/components/common/call-action";
import { parseCapInput } from "@/components/settings/cap-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AGENT_SETTING_LIMITS, type AgentSettings } from "@/lib/domain/agent-settings";
import { MAX_CAP_USD } from "@/lib/data/queries";

/** Onay metni (sabit): kaydetmek bu cümleyi onaylamak demektir. */
export const AGENT_CAP_CONSENT = "Yönetici ajanın bu tutara kadar aylık toplama ve rakip bulma harcamasını onaylıyorum";

type Limit = { min: number; max: number };
const parseWhole = (raw: string, label: string, limit: Limit): { ok: true; value: number } | { ok: false; message: string } => {
  const text = raw.trim();
  const value = Number(text);
  if (text === "" || !Number.isInteger(value)) return { ok: false, message: `${label} tam sayı olmalı.` };
  if (value < limit.min || value > limit.max) return { ok: false, message: `${label} ${limit.min}–${limit.max} arası olmalı.` };
  return { ok: true, value };
};

/**
 * Ajan ayar formu. İstemci doğrulaması yalnız kolaylıktır; asıl doğrulama sunucudadır (`updateAgentSettings`). Kaydetmek tavan onayıdır.
 */
export function AgentSettingsForm({ capUsd, settings }: { capUsd?: number; settings: AgentSettings }) {
  const [cap, setCap] = useState(capUsd === undefined ? "" : String(capUsd));
  const [every, setEvery] = useState(String(settings.collectEveryDays));
  const [videos, setVideos] = useState(String(settings.collectVideoLimit));
  const [rivals, setRivals] = useState(String(settings.rivalTarget));
  const [errors, setErrors] = useState<Partial<Record<"cap" | "every" | "videos" | "rivals", string>>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedCap = parseCapInput(cap);
    const parsedEvery = parseWhole(every, "Toplama sıklığı", AGENT_SETTING_LIMITS.collectEveryDays);
    const parsedVideos = parseWhole(videos, "Video sayısı", AGENT_SETTING_LIMITS.collectVideoLimit);
    const parsedRivals = parseWhole(rivals, "Hedef rakip sayısı", AGENT_SETTING_LIMITS.rivalTarget);
    setErrors({
      ...(parsedCap.ok ? {} : { cap: parsedCap.message }),
      ...(parsedEvery.ok ? {} : { every: parsedEvery.message }),
      ...(parsedVideos.ok ? {} : { videos: parsedVideos.message }),
      ...(parsedRivals.ok ? {} : { rivals: parsedRivals.message }),
    });
    if (!parsedCap.ok || !parsedEvery.ok || !parsedVideos.ok || !parsedRivals.ok) return;
    const input = { agentMonthlyCapUsd: parsedCap.value, collectEveryDays: parsedEvery.value, collectVideoLimit: parsedVideos.value, rivalTarget: parsedRivals.value };
    startTransition(async () => {
      const result = await callAction(() => updateAgentSettings(input), "Ayarlar kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      if (result.ok) toast.success("Ajan ayarları kaydedildi; tavan onaylandı.");
      else toast.error(result.message);
    });
  }

  const field = (id: string, label: string, value: string, set: (next: string) => void, error: string | undefined, hint: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => set(event.target.value)} required aria-invalid={error !== undefined} />
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        {field("agent-cap", "Aylık ajan tavanı (USD)", cap, setCap, errors.cap, `0–${MAX_CAP_USD} USD; 0 = ajan para harcamaz.`)}
        {field("agent-every", "Toplama sıklığı (gün)", every, setEvery, errors.every, `${AGENT_SETTING_LIMITS.collectEveryDays.min}–${AGENT_SETTING_LIMITS.collectEveryDays.max} gün.`)}
        {field("agent-videos", "Hesap başına video", videos, setVideos, errors.videos, `${AGENT_SETTING_LIMITS.collectVideoLimit.min}–${AGENT_SETTING_LIMITS.collectVideoLimit.max} video.`)}
        {field("agent-rivals", "Hedef rakip sayısı", rivals, setRivals, errors.rivals, `${AGENT_SETTING_LIMITS.rivalTarget.min}–${AGENT_SETTING_LIMITS.rivalTarget.max}; adayı sen seçersin.`)}
      </fieldset>
      <p className="text-sm font-medium">{AGENT_CAP_CONSENT}.</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Onayla ve kaydet"}
        </Button>
      </div>
    </form>
  );
}
