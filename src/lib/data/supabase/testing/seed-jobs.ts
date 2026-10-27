/**
 * Sözleşme süiti test verisi: panel iş geçmişi (`panel_jobs`). Yalnız BİTMİŞ işler yazılır (etkin iş yok: süit kendi işini açar) ve hiçbiri
 * canlı kuyrukta değildir. Bitmiş satır doğrudan yazılabilir (durum ↔ alan CHECK'leri sağlanır); onay kaydının onaylayanı `userId`
 * çalışma alanının sahip üyesidir (koruma trigger'ı ister). jsonb sütunları yazma sözleşmesiyle (`job-schema.ts`) doğrulanır.
 */
import { jobResultSchema, jobStepsSchema } from "@/lib/data/job-schema";
import { must } from "@/lib/data/supabase/testing/seed-ops";
import type { JobResult, JobStep } from "@/lib/domain/panel-job";
import type { AdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/database.types";

/** Tohum işlerinin kuyruğu (canlı `panel` kuyruğu değil; satırlar zaten bitmiş). */
export const SEED_JOB_QUEUE = "contract_seed";
const SEED_WORKER_ID = "seed-worker";

const steps = (value: JobStep[]): JobStep[] => jobStepsSchema.parse(value);
const result = (value: JobResult): JobResult => jobResultSchema.parse(value);

export async function seedJobs(db: AdminClient, wsId: string, userId: string, now: Date): Promise<void> {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const ran = (createdAgo: number, minutes: number) => ({
    worker_id: SEED_WORKER_ID,
    created_at: at(createdAgo),
    started_at: at(createdAgo - 0.1),
    heartbeat_at: at(createdAgo - minutes),
    finished_at: at(createdAgo - minutes),
  });
  const rows: Omit<TablesInsert<"panel_jobs">, "workspace_id" | "queue">[] = [
    {
      kind: "routine",
      status: "succeeded",
      steps: steps([
        { id: "precheck", status: "ok", note: "Ortam ve bağlantı tamam.", seconds: 2.1 },
        { id: "collect", status: "needs_approval", note: "Apify parası harcar; onay yok.", seconds: 0, spend: { estimateUsd: 0.11 } },
        { id: "analyze", status: "ok", note: "4 video seçildi: ok 4.", seconds: 120.5 },
        { id: "label", status: "skipped", code: "nothing_to_do", note: "Etiketlenecek video yok.", seconds: 0 },
        { id: "plan", status: "ok", note: "Plan kaydedildi.", seconds: 88 },
        { id: "measure_check", status: "ok", note: "Ücretsiz kontrol.", seconds: 0.8 },
        { id: "briefing", status: "ok", note: "3 madde.", seconds: 30 },
      ]),
      result: result({ exitCode: 0, reportPath: "docs/rutin/test/2026-01-01.md" }),
      log_tail: "— briefing: run\n  → ok: 3 madde.",
      requested_by: userId,
      ...ran(180, 5),
    },
    {
      kind: "collect",
      status: "blocked",
      params: { limit: 10 },
      approval_basis: "one_time",
      approved_max_usd: 0.1,
      approved_by: userId,
      approved_at: at(240),
      steps: steps([{ id: "collect", status: "needs_approval", code: "over_approved_amount", note: "Tahmin onaylı tavanı aşıyor.", seconds: 4, spend: { estimateUsd: 0.13 } }]),
      result: result({ outcome: "over_approved_amount", estimate: { usd: 0.13, lines: [{ label: "İçerik koşuları", usd: 0.13 }] } }),
      requested_by: userId,
      ...ran(240, 0.2),
    },
    // Sıradayken durdurulan iş: işçi hiç almadı.
    { kind: "plan", status: "cancelled", created_at: at(300), cancel_requested_at: at(299), finished_at: at(299), requested_by: userId },
  ];
  // Satır satır: toplu insert'te eksik anahtar NULL yazılır (DEFAULT değil) ve NOT NULL sütunlar (params, steps …) düşer.
  for (const row of rows) must(await db.from("panel_jobs").insert({ workspace_id: wsId, queue: SEED_JOB_QUEUE, ...row }), "panel_jobs");
}
