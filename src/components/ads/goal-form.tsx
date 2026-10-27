"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { updateAdGoalAction } from "@/app/actions/ads";
import { buildGoalInput, type GoalFields } from "@/components/ads/goal-input";
import { callAction } from "@/components/common/call-action";
import { LabeledSelect } from "@/components/common/labeled-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdGoal, AdGoalKind } from "@/lib/domain/ads";
import { cn } from "@/lib/utils";

const COPY = AD_SCREEN_COPY.goal;
const KIND_OPTIONS = (Object.keys(COPY.kinds) as AdGoalKind[]).map((value) => ({ value, label: COPY.kinds[value] }));

const asText = (value: number | undefined, scale = 1): string => (value === undefined ? "" : String(Number((value * scale).toFixed(4))).replace(".", ","));

const fieldsOf = (goal: AdGoal | undefined): GoalFields => ({
  kind: goal?.kind ?? "value",
  resultLabel: goal?.resultLabel ?? "",
  targetReturn: asText(goal?.targetReturn),
  grossMargin: asText(goal?.grossMargin, 100),
  targetCost: asText(goal?.targetCostPerResult),
});

/**
 * Hesap hedefi formu (yalnız yönetici): sonuç adı, hedef türü, hedef değer, brüt kâr payı. Yazım server action'dadır
 * (`updateAdGoalAction`: kapı + zod); burada yalnız sayı biçimi denetlenir. Reklam hesabına bir şey gitmez.
 */
export function GoalForm({ accountId, goal }: { accountId: string; goal?: AdGoal }) {
  const router = useRouter();
  const formId = useId();
  const [fields, setFields] = useState<GoalFields>(() => fieldsOf(goal));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | undefined>();
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<GoalFields>) => setFields((current) => ({ ...current, ...patch }));

  const send = (goalInput: unknown, okText: string) =>
    startTransition(async () => {
      const result = await callAction(() => updateAdGoalAction({ accountId, goal: goalInput }));
      if (result.ok) {
        setMessage({ tone: "ok", text: okText });
        router.refresh();
      } else setMessage({ tone: "error", text: result.message });
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const built = buildGoalInput(fields);
    if (!built.ok) return setMessage({ tone: "error", text: built.message });
    send(built.goal, COPY.saved);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" aria-label={COPY.title}>
      <p className="text-xs text-muted-foreground sm:col-span-2">{COPY.intro}</p>
      <div className="grid gap-1.5">
        <Label htmlFor={`${formId}-label`}>{COPY.resultLabel}</Label>
        <Input id={`${formId}-label`} value={fields.resultLabel} placeholder={COPY.resultLabelHint} maxLength={100} onChange={(event) => set({ resultLabel: event.target.value })} className="max-md:min-h-tap" />
      </div>
      <LabeledSelect label={COPY.kind} value={fields.kind} options={KIND_OPTIONS} onChange={(value) => set({ kind: value as AdGoalKind })} className="w-full" />
      {fields.kind === "value" ? (
        <>
          <NumberField id={`${formId}-return`} label={COPY.targetReturn} hint={COPY.targetReturnHint} value={fields.targetReturn} onChange={(value) => set({ targetReturn: value })} />
          <NumberField id={`${formId}-margin`} label={COPY.grossMargin} hint={COPY.grossMarginHint} value={fields.grossMargin} onChange={(value) => set({ grossMargin: value })} />
        </>
      ) : (
        <NumberField id={`${formId}-cost`} label={COPY.targetCost} value={fields.targetCost} onChange={(value) => set({ targetCost: value })} />
      )}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending} className="max-md:min-h-tap">
          {pending ? COPY.saving : COPY.save}
        </Button>
        {goal ? (
          <Button type="button" variant="outline" disabled={pending} className="max-md:min-h-tap" onClick={() => send(null, COPY.cleared)}>
            {COPY.clear}
          </Button>
        ) : null}
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-success")}>
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function NumberField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="max-md:min-h-tap" aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
