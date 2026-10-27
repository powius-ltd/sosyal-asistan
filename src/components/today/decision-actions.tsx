"use client";

import { Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";

import { callAction } from "@/components/common/call-action";
import { linkButtonClass } from "@/components/content/link-button";
import { decisionDoneText, needsUrlInput, runDecisionAction } from "@/components/today/decision-action-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DecisionAction } from "@/lib/today";
import { cn } from "@/lib/utils";

type Slot = "primary" | "secondary";

interface DecisionActionsProps {
  primary: DecisionAction;
  secondary?: DecisionAction;
  /** Kuyruğun ilk kartı: birincil düğme dolu çizilir (ekranda TEK dolu düğme); diğer kartlarda çerçeveli. */
  emphasis: boolean;
  /** `focus`: karar bloğunun gece yüzeyinde (sarı birincil düğme, çerçeveli ikincil, açık yazı); varsayılan: açık zeminde. */
  tone?: "focus";
}

/** Gece yüzeyinde birincil düğme: sarı "sıra sende" düğmesi (ekranın tek sarısı). */
const FOCUS_PRIMARY = "h-[3.375rem] rounded-control bg-attention px-5 text-base font-semibold text-attention-ink shadow-[0_3px_0_var(--attention-pressed)] hover:bg-attention active:translate-y-0.5 active:shadow-[0_1px_0_var(--attention-pressed)]";
/** Gece yüzeyinde ikincil düğme: çerçeve + açık yazı. */
const FOCUS_SECONDARY = "h-12 rounded-control border-focus-line bg-transparent text-focus-ink hover:bg-focus-surface-raised hover:text-focus-ink dark:border-focus-line dark:bg-transparent dark:hover:bg-focus-surface-raised";

const URL_MISSING_MESSAGE = "Önce videonun bağlantısını yapıştır.";

/**
 * Karar kartının düğmeleri (en küçük istemci yaprağı): tek birincil + isteğe bağlı ikincil. Bağlantı olan düğme `<Link>`'tir; sunucuya
 * giden düğme `callAction` ile çağrılır. Bekleme durumu DÜĞMEDE görünür (sayfa kilitlenmez, yalnız bu kartın düğmeleri kapanır); hata
 * kartın içinde sebep + "Tekrar dene" olarak yazılır (kart kuyruktan düşmez); başarıdan sonra sayfa verisi yenilenir (kart kuyruktan
 * çıkar). Adres isteyen kartta (`input: "url"`) alan satır içindedir ve Enter gönderir.
 */
export function DecisionActions({ primary, secondary, emphasis, tone }: DecisionActionsProps) {
  const onFocus = tone === "focus";
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [running, setRunning] = useState<Slot | undefined>();
  const [failure, setFailure] = useState<{ slot: Slot; message: string } | undefined>();
  const [done, setDone] = useState<string | undefined>();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const withUrl = needsUrlInput(primary);
  const busy = running !== undefined || refreshing;

  const run = async (slot: Slot) => {
    const action = slot === "primary" ? primary : secondary;
    if (action === undefined || action.kind !== "action" || busy) return;
    if (needsUrlInput(action) && url.trim() === "") {
      setUrlError(URL_MISSING_MESSAGE);
      inputRef.current?.focus();
      return;
    }
    setUrlError(undefined);
    setFailure(undefined);
    setRunning(slot);
    const result = await callAction(() => runDecisionAction(action, url.trim()));
    setRunning(undefined);
    if (!result.ok) {
      setFailure({ slot, message: result.message });
      return;
    }
    setDone(decisionDoneText(action));
    // Action yalnız kendi sayfasını tazeliyor olabilir (yayın onayı `/yayin`'ı): kuyruk için bu sayfanın verisi de yenilenir.
    startRefresh(() => router.refresh());
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run("primary");
  };

  const button = (action: DecisionAction, slot: Slot) => {
    const variant = slot === "primary" && emphasis ? "default" : "outline";
    const width = cn("w-full min-h-tap sm:w-auto md:min-h-0", onFocus && (slot === "primary" ? FOCUS_PRIMARY : FOCUS_SECONDARY));
    if (action.kind === "link") {
      return (
        <Link href={action.href} className={cn(linkButtonClass(variant, "touch"), width)} data-slot-role={slot} data-emphasis={variant === "default"}>
          {action.label}
        </Link>
      );
    }
    const pending = running === slot;
    return (
      <Button
        type={slot === "primary" && withUrl ? "submit" : "button"}
        variant={variant}
        size="touch"
        className={width}
        disabled={busy}
        aria-busy={pending}
        data-slot-role={slot} data-emphasis={variant === "default"}
        onClick={slot === "primary" && withUrl ? undefined : () => void run(slot)}
      >
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {action.label}
      </Button>
    );
  };

  return (
    <form className="flex min-w-0 flex-col gap-3" onSubmit={onSubmit} noValidate>
      {withUrl ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            Videonun bağlantısı
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://www.instagram.com/reel/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            readOnly={busy}
            aria-invalid={urlError !== undefined}
            aria-describedby={urlError !== undefined ? errorId : undefined}
            className={cn("h-12 md:h-11", onFocus && "border-focus-line bg-focus-surface-raised text-focus-ink placeholder:text-focus-ink-muted dark:border-focus-line dark:bg-focus-surface-raised")}
          />
          {urlError !== undefined ? (
            <p id={errorId} className={cn("text-sm", onFocus ? "font-medium text-focus-ink" : "text-destructive")}>
              {urlError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {button(primary, "primary")}
        {secondary ? button(secondary, "secondary") : null}
      </div>
      {failure !== undefined ? (
        <div role="alert" className="flex flex-col gap-2 border-l-2 border-destructive pl-3 text-sm">
          <p>
            <span className="font-medium">Olmadı: </span>
            {failure.message}
          </p>
          <Button type="button" variant="outline" size="touch" className={cn("w-full min-h-tap sm:w-fit md:min-h-0", onFocus && FOCUS_SECONDARY)} disabled={busy} onClick={() => void run(failure.slot)}>
            <RotateCcw aria-hidden />
            Tekrar dene
          </Button>
        </div>
      ) : null}
      {/* Canlı bölge hep DOM'da: başarı ekran okuyucuya duyurulur; kart sayfa yenilenince kuyruktan çıkar. */}
      <p role="status" className={done !== undefined ? cn("text-sm", onFocus ? "text-focus-ink" : "text-success") : "sr-only"}>
        {done ?? ""}
      </p>
    </form>
  );
}
