import type { ReactNode } from "react";

import type { JobRunContext } from "@/components/jobs/job-run-types";
import { loadJobRunContext, loadJobsState } from "@/components/jobs/jobs-state";
import { RunJobButton, type JobButtonOptions } from "@/components/jobs/run-job-button";

export interface JobActionProps extends JobButtonOptions {
  /**
   * İşler bu istekte başlatılamıyorsa (müşteri görünümü, örnek veri, barındırılan ortam, işçi yok) düğmenin YERİNE çizilecek içerik:
   * tipik olarak eski komut metni. Verilmezse hiçbir şey çizilmez. Yönetici bilgisi içeriyorsa çağıran onu yalnız yönetici modunda verir.
   */
  fallback?: ReactNode;
}

/** Bağlamı okur; işler kapalıysa ya da okuma başarısızsa undefined (düğme çizilmez, panel çökmez). */
async function readContext(): Promise<JobRunContext | undefined> {
  try {
    const state = await loadJobsState();
    return state.canRun ? await loadJobRunContext() : undefined;
  } catch (error) {
    console.error("[isler] iş düğmesi hazırlanamadı", error);
    return undefined;
  }
}

/**
 * İş düğmesinin SUNUCU sarmalayıcısı: komut metni gösteren her yer bunu kullanır.
 *
 *   <JobAction request={{ kind: "plan" }} fallback={<CommandLine … />} />
 *   <JobAction request={{ kind: "routine", dryRun: true }} label="Önce bak" variant="outline" />
 *
 * Kapı burada: iş başlatılabiliyorsa (yönetici modu + ortam uygun) `RunJobButton` çizilir, değilse `fallback`. Bağlam istek başına bir
 * kez okunur (`jobs-state.ts`, React `cache`): bir sayfada birçok `JobAction` tek sorgu yapar. Async sunucu bileşenidir: istemci
 * bileşeninin İÇİNDE çizilemez; orada sunucu üst bileşeni `loadJobsState()` + `loadJobRunContext()` okuyup `RunJobButton`'a prop verir.
 */
export async function JobAction({ fallback = null, ...options }: JobActionProps) {
  const context = await readContext();
  if (context === undefined) return fallback;
  return <RunJobButton {...options} context={context} />;
}
