import { JobStatusStrip } from "@/components/jobs/job-status-strip";
import { loadJobsState, type JobsState } from "@/components/jobs/jobs-state";

/** Durumu okur; okunamazsa undefined (şerit süs bilgisidir: okuma hatası paneli çökertmez, günlüğe yazılır). */
async function readState(): Promise<JobsState | undefined> {
  try {
    return await loadJobsState();
  } catch (error) {
    console.error("[isler] iş durumu okunamadı", error);
    return undefined;
  }
}

/**
 * İş durum şeridinin sunucu yuvası (panel düzeninde üst şeridin altında, her sayfada). Deseni `chat/chat-dock-slot.tsx` ile aynıdır:
 * hazırlık sunucuda (`jobs-state.ts`: çalışma alanının etkin işi; görünüm yönetici moduna göre kurulur, müşteri görünümünde tutar /
 * günlük / ham not hiç gelmez), istemci şeridi yalnız çizer ve yoklar. Şerit etkin iş yokken de bağlanır (hiçbir şey çizmez): yeni
 * başlayan işi ve bitişini o izler. `key` = çalışma alanı: değişince şerit sıfırlanır.
 */
export async function JobStatusSlot() {
  const state = await readState();
  if (state === undefined) return null;
  return <JobStatusStrip key={state.seed.scope} seed={state.seed} operator={state.operator} canKick={state.canRun} />;
}
