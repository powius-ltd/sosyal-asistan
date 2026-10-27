"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { addOnboardingRivalAction, startOnboardingBuildAction } from "@/app/actions/onboarding";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import type { RivalOption } from "@/components/onboarding/rival-options";
import { FOCUS_ALERT, FOCUS_CHECK, FOCUS_FIELD, FOCUS_OPTION, FOCUS_PRIMARY, FOCUS_SECONDARY } from "@/components/onboarding/surface";
import { useFlowAction } from "@/components/onboarding/use-flow-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";
import {
  ONBOARDING_ACTION_PLAIN,
  ONBOARDING_ADD_SCREEN_PLAIN,
  ONBOARDING_RIVALS_PLAIN,
  ONBOARDING_START_NOTE_PLAIN,
  ONBOARDING_TERMS,
  onboardingRivalsPhrase,
} from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

interface RivalsFormProps {
  /** Seçilebilir hesaplar, gösterim sırasıyla (`buildRivalOptions`). */
  options: readonly RivalOption[];
  /** Ön seçili kimlikler (ilk üç); seçim kullanıcınındır. */
  preselected: readonly string[];
  /** En çok kaç hesap seçilebilir (`ONBOARDING_RIVALS_MAX`; sunucu aynı sınırı ayrıca uygular). */
  max: number;
  /** YALNIZ yönetici modunda: harcama tavanı notu (müşteri görünümünde hiç gelmez). */
  operatorNote?: string;
}

/**
 * Benzer hesap seçimi + "Başlat" (gece yüzeyinde). En çok `max` hesap seçilir (sınır dolunca kalan kutular kapanır); elle eklenen hesap
 * YALNIZ listeye girer (izlemeye alınmaz). "Başlat" seçilenleri izlemeye alır ve ilk incelemeyi başlatır: düğme harcama onayıdır, ne
 * olacağı ve süresi düğmenin yanında düz dille yazar (tutar yazmaz). Başlatan düğme TEKTİR. Hiç seçmeden devam etmek geçerli yoldur: "Benzer
 * hesap seçmeden devam et" kutusu seçimi boşaltır (başlatmaz); hiç hesap seçili değilken "Başlat"ın notu buna göre yalnız kendi videolarını söyler.
 */
export function RivalsForm({ options, preselected, max, operatorNote }: RivalsFormProps) {
  const start = useFlowAction();
  const add = useFlowAction();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(preselected.slice(0, max)));
  const [handle, setHandle] = useState("");
  const addId = useId();
  const addErrorId = useId();
  const addFullId = useId();
  const addInputRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const busy = start.busy || add.busy;
  // Seçim yalnız listede duran hesaplardan sayılır (sayfa yenilenince listeden düşen hesap seçimden de düşer).
  const chosen = options.filter((option) => selected.has(option.id)).map((option) => option.id);
  const full = chosen.length >= max;

  // Ekleme hatasında odak alana döner (mesaj alanın hemen altındadır).
  useEffect(() => {
    if (add.error !== undefined) addInputRef.current?.focus();
  }, [add.error]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (chosen.length < max) next.add(id);
      return next;
    });
  };

  /** "Benzer hesap seçmeden devam et": işaretlenince seçim boşalır; işareti kaldırınca önerilen ilk hesaplar geri gelir. Başlatmaz. */
  const toggleNoRivals = () => setSelected(chosen.length === 0 ? new Set(preselected.slice(0, max)) : new Set());

  const begin = (rivalIds: string[]) => {
    if (busy) return;
    void start.run(() => startOnboardingBuildAction({ rivalIds }), {
      failure: ONBOARDING_RIVALS_PLAIN.failed,
      onOk: ({ jobId }) => jobStatusStore.follow(jobId),
    });
  };

  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void add.run(() => addOnboardingRivalAction({ handle }), {
      failure: ONBOARDING_RIVALS_PLAIN.addFailed,
      onOk: ({ rivalId }) => {
        setHandle("");
        // Yer varsa eklenen hesap seçili gelir (satırı sayfa yenilenince listeye düşer).
        if (!full) setSelected((prev) => new Set(prev).add(rivalId));
      },
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5" data-slot="rivals-form">
      {options.length > 0 ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 font-figure text-xl leading-tight font-bold tracking-tight">{ONBOARDING_RIVALS_PLAIN.legend}</legend>
          <p className="mb-1 text-sm text-focus-ink-muted">{ONBOARDING_RIVALS_PLAIN.limit(max)}</p>
          <ul className="flex min-w-0 flex-col gap-2">
            {options.map((option) => {
              const checked = selected.has(option.id);
              const followers = formatCompact(option.followers);
              return (
                <li key={option.id} className="min-w-0">
                  <label data-rival={option.id} className={FOCUS_OPTION}>
                    <input
                      type="checkbox"
                      name="rival"
                      value={option.id}
                      checked={checked}
                      disabled={busy || (!checked && full)}
                      onChange={() => toggle(option.id)}
                      className={FOCUS_CHECK}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 font-semibold break-all">@{option.handle}</span>
                        {option.manual ? <Tag>{ONBOARDING_RIVALS_PLAIN.manual}</Tag> : option.similarSize === true ? <Tag>{ONBOARDING_RIVALS_PLAIN.similar}</Tag> : null}
                      </span>
                      <span className="text-sm text-focus-ink-muted">
                        {option.displayName !== undefined ? `${option.displayName} · ` : ""}
                        {followers === undefined ? ONBOARDING_RIVALS_PLAIN.followersUnknown : `${followers} ${ONBOARDING_RIVALS_PLAIN.followers}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <label data-slot="no-rivals" className={FOCUS_OPTION}>
            <input type="checkbox" name="noRivals" checked={chosen.length === 0} disabled={busy} onChange={toggleNoRivals} className={FOCUS_CHECK} />
            <span className="min-w-0 flex-1 font-semibold">{ONBOARDING_TERMS.noRivals}</span>
          </label>
        </fieldset>
      ) : null}

      <form className="flex min-w-0 flex-col gap-2" onSubmit={submitAdd} noValidate data-slot="add-rival">
        <label htmlFor={addId} className="text-[0.9375rem] font-semibold">
          {ONBOARDING_RIVALS_PLAIN.addLabel}
        </label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            id={addId}
            ref={addInputRef}
            name="rivalHandle"
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              add.clearError();
            }}
            placeholder={ONBOARDING_ADD_SCREEN_PLAIN.placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={busy}
            disabled={full}
            aria-invalid={add.error !== undefined}
            aria-describedby={cn(add.error !== undefined && addErrorId, full && addFullId) || undefined}
            className={cn("h-12 w-full min-w-0 shrink-0 rounded-control px-3.5 text-base sm:w-auto sm:flex-1 md:text-base", FOCUS_FIELD)}
          />
          <Button type="submit" variant="outline" className={cn("w-full sm:w-auto", FOCUS_SECONDARY)} disabled={busy || full || handle.trim() === ""} aria-busy={add.busy}>
            {add.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus aria-hidden />}
            {ONBOARDING_RIVALS_PLAIN.addButton}
          </Button>
        </div>
        {add.error !== undefined ? (
          <p id={addErrorId} role="alert" className={FOCUS_ALERT}>
            {add.error}
          </p>
        ) : null}
        {full ? (
          <p id={addFullId} className="text-sm text-focus-ink-muted" data-slot="add-rival-full">
            {ONBOARDING_RIVALS_PLAIN.addFull(max)}
          </p>
        ) : null}
      </form>

      <div className="flex min-w-0 flex-col gap-3 border-t border-focus-line pt-5">
        <p role="status" className="text-[0.9375rem] font-semibold" data-slot="rivals-summary">
          {onboardingRivalsPhrase(chosen.length)}
        </p>
        <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="button" className={cn("w-full sm:w-auto sm:min-w-40", FOCUS_PRIMARY)} disabled={busy} aria-busy={start.busy} aria-describedby={noteId} onClick={() => begin(chosen)}>
            {start.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {ONBOARDING_ACTION_PLAIN.start_build}
          </Button>
        </div>
        <div id={noteId} className="flex min-w-0 flex-col gap-1 text-sm text-focus-ink-muted" data-slot="start-note" data-mode={chosen.length === 0 ? "own-only" : "with-rivals"}>
          <p>{chosen.length === 0 ? ONBOARDING_RIVALS_PLAIN.noRivalsStartNote : ONBOARDING_START_NOTE_PLAIN}</p>
          <p>{ONBOARDING_RIVALS_PLAIN.duration}</p>
        </div>
        {operatorNote !== undefined ? (
          <p className="text-xs text-focus-ink-muted" data-operator="spend-note">
            {operatorNote}
          </p>
        ) : null}
        {start.error !== undefined ? (
          <p role="alert" className={FOCUS_ALERT}>
            {start.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="rounded-pill border border-focus-line px-2 py-0.5 text-xs font-medium text-focus-ink-muted">{children}</span>;
}
