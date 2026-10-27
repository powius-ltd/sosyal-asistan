"use client";

import { Bell, BellRing } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { browserNoticeState, disableBrowserNotice, enableBrowserNotice, subscribeBrowserNotice, type BrowserNoticeState } from "@/components/jobs/browser-notice";
import { Button } from "@/components/ui/button";
import { ONBOARDING_NOTIFY_PLAIN } from "@/lib/plain-language-onboarding";

/** Sunucu çizimi ve hydration: tarayıcı durumu bilinmez, hiçbir şey çizilmez. */
const serverState = (): BrowserNoticeState => "unsupported";

/**
 * "Bitince haber ver": tarayıcı bildirimi için isteğe bağlı izin. İzin KENDİLİĞİNDEN istenmez; yalnız kullanıcı düğmeye basınca sorulur.
 * Yalnız sekme açıkken çalışır (servis çalışanı yok) ve bu yan nottan açıkça söylenir; sekme kapanırsa sonuç zildeki bildirimdedir.
 * İlk çizim sunucuyla AYNI (hiçbir şey) olur, tarayıcı durumu sonra okunur (`useSyncExternalStore`; hydration uyuşmazlığı yok). Tarayıcı bildirimi desteklemiyorsa
 * hiçbir şey çizilmez. Bildirimin kendisini gösteren kod `jobs/job-finish-effects.tsx`'tedir.
 */
export function NotifyMe() {
  const state = useSyncExternalStore<BrowserNoticeState>(subscribeBrowserNotice, browserNoticeState, serverState);
  const [asking, setAsking] = useState(false);

  if (state === "unsupported") return null;

  const ask = async () => {
    setAsking(true);
    await enableBrowserNotice();
    setAsking(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-slot="notify-me" data-state={state}>
      {state === "off" ? (
        <Button type="button" variant="outline" className="h-auto min-h-tap w-full justify-center whitespace-normal sm:w-fit" disabled={asking} aria-busy={asking} onClick={() => void ask()}>
          <Bell aria-hidden />
          {ONBOARDING_NOTIFY_PLAIN.button}
        </Button>
      ) : null}
      {state === "on" ? (
        <p className="flex min-w-0 items-start gap-2 text-sm font-medium" role="status">
          <BellRing className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span className="min-w-0 flex-1">{ONBOARDING_NOTIFY_PLAIN.on}</span>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => disableBrowserNotice()}>
            {ONBOARDING_NOTIFY_PLAIN.off}
          </Button>
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{state === "denied" ? ONBOARDING_NOTIFY_PLAIN.denied : ONBOARDING_NOTIFY_PLAIN.limit}</p>
    </div>
  );
}
