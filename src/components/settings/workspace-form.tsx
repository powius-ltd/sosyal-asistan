"use client";

import { TAP_TARGET } from "@/components/notifications/tap";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { updateWorkspaceSettings } from "@/app/actions/settings";
import { parseCapInput } from "@/components/settings/cap-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CAP_USD, NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { SETTINGS_PLAIN, timeZonePlain } from "@/lib/plain-language-account";

export interface WorkspaceFormValues {
  apifyMonthlyCapUsd?: number;
  llmMonthlyCapUsd?: number;
  nicheBrief?: string;
  timezone: string;
}

const capText = (value: number | undefined) => (value === undefined ? "" : String(value));

/**
 * Workspace ayarları formu: tavanlar (USD) ve niş tanımı. Tavan ZORUNLU bir sayıdır (0–1000, boş bırakılamaz,
 * kaldırılamaz); 0 = harcama kapalı. Kayıt sunucuda doğrulanır (`updateWorkspaceSettings`); başarıda toast,
 * hata mesajı sunucudan gelir. `showCaps` false iken (müşteri görünümü: Apify/LLM tavanı yönetici bilgisidir) tavan alanları çizilmez
 * ve yalnız niş tanımı kaydedilir; mevcut tavanlara dokunulmaz.
 */
export function WorkspaceForm({ initial, showCaps = true }: { initial: WorkspaceFormValues; showCaps?: boolean }) {
  const [apifyCap, setApifyCap] = useState(capText(initial.apifyMonthlyCapUsd));
  const [llmCap, setLlmCap] = useState(capText(initial.llmMonthlyCapUsd));
  const [nicheBrief, setNicheBrief] = useState(initial.nicheBrief ?? "");
  const [apifyError, setApifyError] = useState<string>();
  const [llmError, setLlmError] = useState<string>();
  const [nicheError, setNicheError] = useState<string>();
  const nicheRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Niş sınırı alanın altında yazılır ve odak alana gider (yalnız toast alanı işaretlemiyordu; D3-18).
    if (Array.from(nicheBrief).length > NICHE_BRIEF_MAX_LENGTH) {
      setNicheError(`Niş tanımı en fazla ${NICHE_BRIEF_MAX_LENGTH} karakter olabilir; ${Array.from(nicheBrief).length - NICHE_BRIEF_MAX_LENGTH} karakter fazla.`);
      nicheRef.current?.focus();
      return;
    }
    setNicheError(undefined);
    if (!showCaps) {
      startTransition(async () => {
        const result = await updateWorkspaceSettings({ nicheBrief });
        if (result.ok) toast.success("Ayarlar kaydedildi.");
        else toast.error(result.message);
      });
      return;
    }
    const apify = parseCapInput(apifyCap);
    const llm = parseCapInput(llmCap);
    setApifyError(apify.ok ? undefined : apify.message);
    setLlmError(llm.ok ? undefined : llm.message);
    if (!apify.ok || !llm.ok) return;
    startTransition(async () => {
      const result = await updateWorkspaceSettings({
        apifyMonthlyCapUsd: apify.value,
        llmMonthlyCapUsd: llm.value,
        nicheBrief,
      });
      if (result.ok) toast.success("Ayarlar kaydedildi.");
      else toast.error(result.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        {showCaps ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ws-apify-cap">Aylık Apify tavanı (USD)</Label>
              <Input
                id="ws-apify-cap"
                inputMode="decimal"
                value={apifyCap}
                onChange={(event) => setApifyCap(event.target.value)}
                placeholder="Örn. 10"
                required
                aria-invalid={apifyError !== undefined}
                className={TAP_TARGET}
              />
              {apifyError ? <p className="text-xs text-destructive">{apifyError}</p> : null}
              <p className="text-xs text-muted-foreground">
                0–{MAX_CAP_USD} USD, boş bırakılamaz; 0 = harcama kapalı. Aşılırsa yeni Apify koşusu hiç başlamaz.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ws-llm-cap">Aylık LLM tavanı (USD)</Label>
              <Input
                id="ws-llm-cap"
                inputMode="decimal"
                value={llmCap}
                onChange={(event) => setLlmCap(event.target.value)}
                placeholder="Örn. 5"
                required
                aria-invalid={llmError !== undefined}
                className={TAP_TARGET}
              />
              {llmError ? <p className="text-xs text-destructive">{llmError}</p> : null}
              <p className="text-xs text-muted-foreground">
                0–{MAX_CAP_USD} USD, boş bırakılamaz; 0 = harcama kapalı. Claude ve transkript çağrıları için.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ws-niche">Niş tanımı</Label>
            <span className="text-xs text-muted-foreground tabular">
              {Array.from(nicheBrief).length} / {NICHE_BRIEF_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id="ws-niche"
            value={nicheBrief}
            ref={nicheRef}
            onChange={(event) => {
              setNicheBrief(event.target.value);
              setNicheError(undefined);
            }}
            aria-invalid={nicheError !== undefined}
            aria-describedby={nicheError ? "ws-niche-error" : undefined}
            placeholder="Ör. İstanbul'da üçüncü dalga kahve kafesi; kısa videoyla demleme teknikleri ve tatlılar."
            className="min-h-24"
          />
          {nicheError ? (
            <p id="ws-niche-error" role="alert" className="text-xs text-destructive">
              {nicheError}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{SETTINGS_PLAIN.nicheHelp}</p>
        </div>

        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="ws-timezone">Saat dilimi</Label>
          {/* Müşteri "İstanbul saati" okur (IANA adı yönetici içindir); alan devre dışı olduğundan nedeni görünür yazılır. */}
          <Input id="ws-timezone" value={showCaps ? initial.timezone : timeZonePlain(initial.timezone)} readOnly disabled aria-describedby="ws-timezone-note" className={TAP_TARGET} />
          <p id="ws-timezone-note" className="text-xs text-muted-foreground">
            {SETTINGS_PLAIN.timeZoneLocked}
          </p>
        </div>
      </fieldset>


      <div>
        <Button type="submit" disabled={pending} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
