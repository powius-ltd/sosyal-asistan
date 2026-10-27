"use client";

import { CircleAlert, CircleCheck, Clock, Loader2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { kickWorkerAction } from "@/app/actions/jobs";
import { callAction } from "@/components/common/call-action";
import { JobFinishEffects } from "@/components/jobs/job-finish-effects";
import type { JobsSeed } from "@/components/jobs/job-run-types";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { useJobsStatus } from "@/components/jobs/use-jobs-status";
import { Button } from "@/components/ui/button";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { JOB_KIND_PLAIN, jobOutcomePhrase, jobStripPhrase } from "@/lib/plain-language";
import { ROUTES } from "@/lib/routes";

/** Başarıyla biten işin sonuç satırı bu kadar sonra kendiliğinden kalkar; sorunlu sonuç kapatılana kadar durur. */
export const JOB_FINISHED_NOTICE_MS = 12_000;

export interface JobStatusStripProps {
  /** Sunucunun çizdiği andaki durum (müşteri görünümünde yönetici ayrıntısı taşımaz). */
  seed: JobsSeed;
  /** Yönetici modu: "Ayrıntı" bağlantısı çizilir. */
  operator: boolean;
  /** İşler başlatılabiliyor (yönetici modu + ortam uygun): sırada bekleyen iş için işçi dürtülebilir. */
  canKick: boolean;
}

function activeIcon(view: JobStatusView) {
  if (view.stale) return <TriangleAlert className="size-4 shrink-0 text-warning-strong" aria-hidden />;
  if (view.status === "queued") return <Clock className="size-4 shrink-0 text-ai-meta" aria-hidden />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-ai-meta motion-reduce:animate-none" aria-hidden />;
}

/** Biten işin şerit cümlesi: "Haftalık tur: İş bitti." Önizleme ($0 ön bakış) için satır yazılmaz (sonucu basılan düğmededir). */
function finishedLine(view: JobStatusView | undefined): string | undefined {
  if (view === undefined || view.dryRun) return undefined;
  const outcome = jobOutcomePhrase(view);
  return outcome === undefined ? undefined : `${JOB_KIND_PLAIN[view.kind].label}: ${outcome}`;
}

/**
 * İş durum şeridi (panel düzeninde, her sayfada; HERKES görür): etkin iş varken düz dille ne yapıldığını yazar ("Şimdi yaptığım:
 * videolarını inceliyorum (7/19)"), iş bitince sonucu söyler ve sayfa verisini yeniler. Tutar, sağlayıcı, ham not YOK: metin yalnız
 * sözlükten (`lib/plain-language.ts`). Yoklama ortak depodadır (yalnız etkin iş varken, sekme görünürken). Yönetici modunda sırada
 * bekleyen işi alacak işçi görünmüyorsa işçi dürtülür. Etkin iş ve sonuç yokken hiçbir şey çizmez (yalnız görünmez canlı bölge kalır).
 */
export function JobStatusStrip({ seed, operator, canKick }: JobStatusStripProps) {
  const router = useRouter();
  const snapshot = useJobsStatus(seed);
  const active = snapshot.active;
  const finished = snapshot.lastFinished;

  useEffect(() => jobStatusStore.onFinish(() => router.refresh()), [router]);

  useEffect(() => {
    if (!canKick) return;
    jobStatusStore.setKick(() => void callAction(() => kickWorkerAction()));
    return () => jobStatusStore.setKick(undefined);
  }, [canKick]);

  useEffect(() => {
    if (finished === undefined || finished.status !== "succeeded") return;
    const timer = setTimeout(() => jobStatusStore.dismissFinished(), JOB_FINISHED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  const phrase = active === undefined ? undefined : jobStripPhrase(active);
  const result = active === undefined ? finishedLine(finished) : undefined;
  // Ekran okuyucu yalnız adım değişimini duyar: sayaç (7/19 → 8/19) her yoklamada okunmasın.
  const spoken = active === undefined ? result : jobStripPhrase({ ...active, progress: undefined });
  // Dokunma hedefi: dar ekranda ≥ 48 px; şeridin dolgusu negatif dış boşlukla geri alınır (şerit 48 px'ten uzamaz). `pad` = şeridin dikey dolgusu.
  const detailLink = (pad: "-my-1.5" | "-my-1") =>
    operator ? (
      <Link
        href={ROUTES.jobs}
        className={`${pad} inline-flex min-h-tap shrink-0 items-center rounded-sm px-2 text-xs text-ai-meta underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:my-0 md:min-h-8`}
      >
        Ayrıntı
      </Link>
    ) : null;

  return (
    <>
      <JobFinishEffects active={active} finished={finished} />
      <p role="status" className="sr-only" data-slot="job-strip-live">
        {spoken ?? ""}
      </p>
      {phrase !== undefined && active !== undefined ? (
        <div data-slot="job-strip" data-state={active.stale ? "stale" : active.status} className="flex shrink-0 items-center gap-2 border-b bg-ai-surface px-4 py-1.5 text-sm text-ai-surface-foreground md:px-6">
          {activeIcon(active)}
          <p className="min-w-0 flex-1 break-words">{phrase}</p>
          {detailLink("-my-1.5")}
        </div>
      ) : result !== undefined && finished !== undefined ? (
        <div data-slot="job-strip" data-state={finished.status} className="flex shrink-0 items-center gap-2 border-b bg-ai-surface px-4 py-1 text-sm text-ai-surface-foreground md:px-6">
          {finished.status === "succeeded" ? (
            <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="size-4 shrink-0 text-warning-strong" aria-hidden />
          )}
          <p className="min-w-0 flex-1 break-words">{result}</p>
          {detailLink("-my-1")}
          <Button type="button" variant="ghost" size="icon-sm" className="-my-1 size-12 md:my-0 md:size-7" aria-label="Kapat" onClick={() => jobStatusStore.dismissFinished()}>
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
    </>
  );
}
