"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { confirmOnboardingAccountAction } from "@/app/actions/onboarding";
import { ReplaceAccountButton } from "@/components/onboarding/replace-account-button";
import { FOCUS_ALERT, FOCUS_CHECK, FOCUS_FIELD, FOCUS_OPTION, FOCUS_PRIMARY } from "@/components/onboarding/surface";
import { useFlowAction } from "@/components/onboarding/use-flow-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AccountType } from "@/lib/domain/account-type";
import { ONBOARDING_ACTION_PLAIN, ONBOARDING_REVIEW_PLAIN } from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

export interface AccountTypeChoice {
  value: AccountType;
  label: string;
  description: string;
}

interface ReviewAccountFormProps {
  /** Hesap türü seçenekleri (etiket ve açıklama `domain/account-type.ts` tablosundan; sunucu kurar). */
  types: readonly AccountTypeChoice[];
  /** Ön seçim: bakışın tahmini (yoksa çalışma alanının şimdiki türü). Yalnız öneridir; karar kullanıcınındır. */
  initialType: AccountType;
  /** Tahmin edilen tür ("Tahminim" rozeti); tahmin yoksa rozet çizilmez. */
  suggestedType?: AccountType;
  /** Konu metninin başlangıcı: kayıtlı konu ya da bakışın taslağı; yoksa boş. */
  initialNiche: string;
}

/**
 * "Bu sen misin?" kararı (gece yüzeyinde): hesap türü TEK soru (üç seçenek; tahmin ön seçili ama kullanıcı değiştirir), konu taslağı
 * düzeltilebilir metin (boş geçilebilir: boşsa alan hiç gönderilmez, kayıtlı konuya dokunulmaz). "Evet, bu benim" onayı yazar; sayfa
 * yenilenince ekran benzer hesap seçimine geçer. "Bu ben değilim" yanlış açılan hesabı bırakır (güvenliyse kaldırılır) ve hesap ekleme formuna götürür.
 */
export function ReviewAccountForm({ types, initialType, suggestedType, initialNiche }: ReviewAccountFormProps) {
  const flow = useFlowAction();
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [niche, setNiche] = useState(initialNiche);
  const nicheId = useId();
  const nicheHintId = useId();
  const typeHintId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (flow.busy) return;
    const nicheBrief = niche.trim();
    void flow.run(() => confirmOnboardingAccountAction({ accountType, ...(nicheBrief === "" ? {} : { nicheBrief }) }), { failure: ONBOARDING_REVIEW_PLAIN.failed });
  };

  return (
    <form className="flex min-w-0 flex-col gap-5" onSubmit={submit} noValidate data-slot="review-account-form">
      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={typeHintId}>
        <legend className="mb-1 font-figure text-xl leading-tight font-bold tracking-tight">{ONBOARDING_REVIEW_PLAIN.typeQuestion}</legend>
        <p id={typeHintId} className="mb-1 text-sm text-focus-ink-muted">
          {ONBOARDING_REVIEW_PLAIN.typeHint}
        </p>
        <div className="flex min-w-0 flex-col gap-2">
          {types.map((choice) => (
            <label key={choice.value} data-account-type={choice.value} className={FOCUS_OPTION}>
              <input
                type="radio"
                name="accountType"
                value={choice.value}
                checked={accountType === choice.value}
                disabled={flow.busy}
                onChange={() => setAccountType(choice.value)}
                className={FOCUS_CHECK}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  {choice.label}
                  {choice.value === suggestedType ? (
                    <span className="rounded-pill bg-attention px-2 py-0.5 text-xs font-semibold text-attention-ink" data-slot="suggested">
                      {ONBOARDING_REVIEW_PLAIN.suggested}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-focus-ink-muted">{choice.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={nicheId} className="text-[0.9375rem] font-semibold">
          {ONBOARDING_REVIEW_PLAIN.nicheLabel}
        </label>
        <Textarea
          id={nicheId}
          name="nicheBrief"
          value={niche}
          onChange={(event) => setNiche(event.target.value)}
          readOnly={flow.busy}
          rows={4}
          aria-describedby={nicheHintId}
          className={cn("min-h-28 rounded-control px-3.5 py-3 text-base md:text-base", FOCUS_FIELD)}
        />
        <p id={nicheHintId} className="text-sm text-focus-ink-muted">
          {ONBOARDING_REVIEW_PLAIN.nicheHint}
        </p>
      </div>

      {flow.error !== undefined ? (
        <p role="alert" className={FOCUS_ALERT}>
          {flow.error}
        </p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" className={cn("w-full sm:w-auto", FOCUS_PRIMARY)} disabled={flow.busy} aria-busy={flow.busy}>
          {flow.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {ONBOARDING_ACTION_PLAIN.confirm_account}
        </Button>
        <ReplaceAccountButton label={ONBOARDING_REVIEW_PLAIN.notMe} failure={ONBOARDING_REVIEW_PLAIN.notMeFailed} />
      </div>
    </form>
  );
}
