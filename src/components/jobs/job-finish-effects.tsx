"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { markTabTitle, showBrowserNotice } from "@/components/jobs/browser-notice";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { ONBOARDING_FINISH_ACTION_PLAIN, ONBOARDING_NOTIFY_PLAIN, onboardingFinishNotice } from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";

interface JobFinishEffectsProps {
  /** Çalışma alanının etkin işi (durum şeridiyle AYNI ortak depodan). */
  active: JobStatusView | undefined;
  /** Bu sekmede bitişi görülen son iş. */
  finished: JobStatusView | undefined;
}

/**
 * Uzun süren başlangıç işi BİTİNCE açık sekmede haber verir (görünmez bileşen; her panel sayfasındaki durum şeridi çizer):
 *  - sekme görünürken: kısa baloncuk ("İlk planın hazır") + akışa giden eylem;
 *  - sekme arka plandayken: sekme başlığına işaret ("● İlk planın hazır · …"; sekme öne gelince kalkar) ve, kullanıcı "Bitince haber ver"e
 *    bastıysa, tarayıcı bildirimi.
 * Yeni yoklama YOKTUR: bitişi ortak iş durumu deposu (`/api/isler` yoklaması) bildirir. Gizli sekmede de bitişi görebilmek için iş sürerken
 * depo gizli sekmede yoklamayı sürdürür. Kalıcı haber zildeki bildirimdir (işçi yazar); bu yalnız açık sekmedeki anlık haberdir.
 * Metin tek yerde (`onboardingFinishNotice`). Her iş için bir kez duyurulur.
 */
export function JobFinishEffects({ active, finished }: JobFinishEffectsProps) {
  const router = useRouter();
  const announced = useRef<string | undefined>(undefined);
  const watching = active?.kind === "onboarding" && !active.dryRun;

  useEffect(() => {
    if (!watching) return;
    jobStatusStore.setBackgroundPolling(true);
    return () => jobStatusStore.setBackgroundPolling(false);
  }, [watching]);

  useEffect(() => {
    if (finished === undefined || announced.current === finished.id) return;
    announced.current = finished.id;
    const notice = finished.dryRun ? undefined : onboardingFinishNotice({ phase: finished.phase, status: finished.status, outcome: finished.outcome });
    if (notice === undefined) return;
    if (document.visibilityState === "visible") {
      toast(notice.title, { description: notice.body, action: { label: ONBOARDING_FINISH_ACTION_PLAIN.open, onClick: () => router.push(ROUTES.onboarding) } });
      return;
    }
    markTabTitle(notice.title, ONBOARDING_NOTIFY_PLAIN.tabMark);
    showBrowserNotice({ title: notice.title, body: notice.body, tag: `onboarding-${finished.id}` });
  }, [finished, router]);

  return null;
}
