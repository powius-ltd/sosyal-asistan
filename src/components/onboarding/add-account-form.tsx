"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { addOnboardingAccountAction } from "@/app/actions/onboarding";
import { HANDLE_ERROR_MESSAGE, parseHandle } from "@/components/competitors/handle";
import type { PlatformOption } from "@/components/onboarding/platform-options";
import { FOCUS_ALERT, FOCUS_CHECK, FOCUS_FIELD, FOCUS_OPTION, FOCUS_PRIMARY, FOCUS_SECONDARY } from "@/components/onboarding/surface";
import { useFlowAction } from "@/components/onboarding/use-flow-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_ADD_PLAIN, ONBOARDING_ADD_SCREEN_PLAIN } from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Hesap ekleme formu (gece yüzeyinde): kullanıcı adı ya da profil bağlantısı + platform. Platformlar sunucudan gelir; modülü olmayan
 * görünür ama seçilemez ("Yakında"). Birincil yol herkese açık veriyle devam etmektir; resmi bağlantı düğmesi görünür ama kapalıdır
 * (şifre istenmez). Geçersiz ad ve "zaten ekli" mesajları SUNUCUDAN gelir; canlı önizleme yalnız kullanıcıya hangi adın okunacağını söyler.
 * Başarıda adresten "ekle" niyeti düşer ve sayfa yenilenir: ekran akışın yeni adımına (hesaba bakış) kendiliğinden geçer.
 *
 * Kullanıcı adı, gönderilmeden önce SEÇİLİ platformun kendi kuralıyla denetlenir (`parseHandle(ad, platform)`: Instagram en çok 30
 * karakter, TikTok 2–24; kural modülde tek yerdedir, burada kopyası yok). Hata (yerel ya da sunucudan) alanın HEMEN altında yazılır,
 * odak alana döner ve alan `aria-invalid` + `aria-describedby` ile mesaja bağlıdır.
 *
 * `quiet`: başka bir hesap eklemek için açılan ikincil alan. Sarı birincil düğme ekranda tektir ("Hesabıma bak" ya da burada gönder
 * düğmesi, ikisi birden değil); bu kipte gönder düğmesi çerçeveli ikincildir ve kapalı "resmi bağlantı" düğmesi çizilmez.
 */
export function AddAccountForm({ platforms, quiet = false }: { platforms: readonly PlatformOption[]; quiet?: boolean }) {
  const router = useRouter();
  const flow = useFlowAction();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState(() => platforms.find((option) => option.available)?.value);
  const [localError, setLocalError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const handleId = useId();
  const hintId = useId();
  const errorId = useId();
  const connectNoteId = useId();
  const parsed = parseHandle(handle, platform);
  const message = localError ?? flow.error;

  // Hata çıkınca odak alana döner (klavye ve ekran okuyucu kullanıcısı mesajı alanın yanında bulur).
  useEffect(() => {
    if (message !== undefined) inputRef.current?.focus();
  }, [message]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (flow.busy || platform === undefined) return;
    if (!parsed.ok) {
      setLocalError(HANDLE_ERROR_MESSAGE[parsed.reason]);
      return;
    }
    void flow.run(() => addOnboardingAccountAction({ handle, platform }), {
      failure: ONBOARDING_ADD_SCREEN_PLAIN.failed,
      onOk: () => router.replace(ROUTES.onboarding),
    });
  };

  return (
    <form className="flex min-w-0 flex-col gap-5" onSubmit={submit} noValidate data-slot="add-account-form">
      <div className="flex flex-col gap-2">
        <label htmlFor={handleId} className="text-[0.9375rem] font-semibold">
          {ONBOARDING_ADD_PLAIN.handleLabel}
        </label>
        <Input
          id={handleId}
          ref={inputRef}
          name="handle"
          value={handle}
          onChange={(event) => {
            setHandle(event.target.value);
            setLocalError(undefined);
            flow.clearError();
          }}
          placeholder={ONBOARDING_ADD_SCREEN_PLAIN.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          readOnly={flow.busy}
          aria-invalid={message !== undefined}
          aria-describedby={message !== undefined ? `${errorId} ${hintId}` : hintId}
          className={cn("h-13 rounded-control px-3.5 text-[1.0625rem] md:text-[1.0625rem]", FOCUS_FIELD)}
        />
        {message !== undefined ? (
          <p id={errorId} role="alert" className={FOCUS_ALERT}>
            {message}
          </p>
        ) : null}
        <p id={hintId} className="text-sm text-focus-ink-muted">
          {parsed.ok ? ONBOARDING_ADD_SCREEN_PLAIN.preview(parsed.handle) : ONBOARDING_ADD_SCREEN_PLAIN.hint}
        </p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-[0.9375rem] font-semibold">{ONBOARDING_ADD_PLAIN.platformLabel}</legend>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          {platforms.map((option) => (
            <label key={option.value} data-platform={option.value} data-available={option.available} className={cn(FOCUS_OPTION, "items-center")}>
              <input
                type="radio"
                name="platform"
                value={option.value}
                checked={platform === option.value}
                disabled={!option.available || flow.busy}
                onChange={() => setPlatform(option.value)}
                className={cn(FOCUS_CHECK, "mt-0")}
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium break-words">{option.label}</span>
                {option.available ? null : (
                  <span className="rounded-pill border border-focus-line px-2 py-0.5 text-xs font-medium text-focus-ink-muted">{ONBOARDING_ADD_PLAIN.comingSoon}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" variant={quiet ? "outline" : "default"} className={cn("w-full sm:w-auto", quiet ? FOCUS_SECONDARY : FOCUS_PRIMARY)} disabled={flow.busy || platform === undefined} aria-busy={flow.busy}>
          {flow.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {ONBOARDING_ADD_PLAIN.publicPath}
        </Button>
        {quiet ? null : (
          <Button type="button" variant="outline" className={cn("w-full sm:w-auto", FOCUS_SECONDARY)} disabled aria-describedby={connectNoteId}>
            {ONBOARDING_ADD_PLAIN.connectPath}
            <span className="rounded-pill border border-focus-line px-2 py-0.5 text-xs font-medium">{ONBOARDING_ADD_PLAIN.comingSoon}</span>
          </Button>
        )}
      </div>
      {quiet ? null : (
        <p id={connectNoteId} className="text-sm text-focus-ink-muted">
          {ONBOARDING_ADD_PLAIN.connectNote}
        </p>
      )}
    </form>
  );
}
