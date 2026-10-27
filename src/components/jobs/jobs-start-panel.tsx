import { CollectJobControl } from "@/components/jobs/collect-job-control";
import { JOB_KIND_ABOUT, SINGLE_JOB_KINDS, type SingleJobKind } from "@/components/jobs/job-catalog";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { RoutineStarter } from "@/components/jobs/routine-starter";
import { RunJobButton } from "@/components/jobs/run-job-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_KIND_PLAIN } from "@/lib/plain-language";

interface JobsStartPanelProps {
  /** İş düğmelerinin bağlamı; bu panel YALNIZ işler başlatılabiliyorken çizilir (kapıyı sayfa denetler). */
  context: JobRunContext;
  /** Yönetilen çalışma alanı sayısı ("Tüm hesaplar için başlat" 1'den fazlaysa çizilir). */
  workspaceCount: number;
  /** Son ön bakıştaki toplama tahmini (haftalık turun tutar alanına ön değer). */
  collectEstimateUsd?: number;
  /** Hesap türü açı etiketlemesi uyguluyor mu (`appliesAngleLabeling`); uygulamıyorsa "Açıları etiketle" çizilmez. */
  angleLabeling: boolean;
}

/** Tek iş satırının düğmesi: toplamada video sayısı seçimi de vardır; diğerleri doğrudan düğme. */
function control(kind: SingleJobKind, context: JobRunContext) {
  if (kind === "collect") return <CollectJobControl context={context} />;
  return <RunJobButton request={{ kind }} context={context} quietWhenBlocked />;
}

/** `/isler` başlatma paneli (yönetici): haftalık tur + tek tek işler. Düğme adları sözlükten; açıklamalar `job-catalog.ts`'ten. */
export function JobsStartPanel({ context, workspaceCount, collectEstimateUsd, angleLabeling }: JobsStartPanelProps) {
  const kinds = SINGLE_JOB_KINDS.filter((kind) => kind !== "label" || angleLabeling);
  return (
    <div data-slot="jobs-start" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{JOB_KIND_PLAIN.routine.label}</CardTitle>
          <CardDescription>{JOB_KIND_ABOUT.routine}</CardDescription>
        </CardHeader>
        <CardContent>
          <RoutineStarter context={context} workspaceCount={workspaceCount} collectEstimateUsd={collectEstimateUsd} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tek tek işler</CardTitle>
          <CardDescription>Turun adımlarını ayrı ayrı da başlatabilirsin. Aynı anda tek iş çalışır.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {kinds.map((kind) => (
              <li key={kind} data-job-kind={kind} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-muted-foreground">{JOB_KIND_ABOUT[kind]}</p>
                {control(kind, context)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Kilit yalnız panelden başlatılan işleri kapsar (plan §6): terminalden çalışan iş burada görünmez. */}
      <p className="text-xs text-muted-foreground">
        Terminalden başlatılan işler burada görünmez ve sırayı beklemez: aynı hesapta ikisini aynı anda çalıştırma.
      </p>
    </div>
  );
}
