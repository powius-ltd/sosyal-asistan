"use client";

import { Loader2 } from "lucide-react";

import { startOnboardingProbeAction } from "@/app/actions/onboarding";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { FOCUS_ALERT, FOCUS_PRIMARY } from "@/components/onboarding/surface";
import { useFlowAction } from "@/components/onboarding/use-flow-action";
import { Button } from "@/components/ui/button";
import { ONBOARDING_ACTION_PLAIN } from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

/**
 * "Hesabıma bak": ekli hesaba bakışı (yeniden) başlatır. Düğme harcama onayıdır; tavanı sunucu yazar (girdi yok). Açılan iş ortak iş
 * deposunda izlemeye alınır (durum şeridi ve ilerleme ekranı aynı yoklamayı kullanır), sayfa yenilenince ekran "hesabına bakıyorum"a geçer.
 */
export function ProbeStartButton({ tone = "focus", className }: { /** `focus`: gece yüzeyinde (sarı düğme); `plain`: açık zeminde (olağan birincil düğme). */ tone?: "focus" | "plain"; className?: string }) {
  const onFocus = tone === "focus";
  const flow = useFlowAction();
  const start = () =>
    void flow.run(() => startOnboardingProbeAction(), {
      onOk: ({ jobId }) => jobStatusStore.follow(jobId),
    });
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)} data-slot="probe-start">
      <Button type="button" size="touch" className={cn("w-full sm:w-fit", onFocus ? FOCUS_PRIMARY : "h-12 px-5 text-[0.9375rem] font-semibold")} disabled={flow.busy} aria-busy={flow.busy} onClick={start}>
        {flow.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {ONBOARDING_ACTION_PLAIN.start_probe}
      </Button>
      {flow.error !== undefined ? (
        <p role="alert" className={onFocus ? FOCUS_ALERT : "border-l-2 border-destructive pl-3 text-sm"}>
          {flow.error}
        </p>
      ) : null}
    </div>
  );
}
