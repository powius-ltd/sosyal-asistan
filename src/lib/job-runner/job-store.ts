/**
 * İşçinin `panel_jobs` erişimi: işi al (`claim_panel_job`), ÇİTLİ yazım ve günlük temizliği. Depo (`PanelRepository`) iş koşturmaz; işi
 * almak ve satırı ilerletmek yalnız işçinin işidir ve buradan geçer. Arayüz (`JobStore`) testte sahtesiyle değişir.
 *
 * ÇİT: her yazım `where id = ? and worker_id = ? and status = 'running'` ile sınırlıdır; 0 satır = iş elimizden alınmış ya da kapatılmış
 * (yetim iş kapatma, bitmiş iş) → `applied: false`, işçi durur. Yama yazılmadan ÖNCE `jobRowPatchSchema` ile doğrulanır (yazan işçi ve
 * okuyan depo aynı şema). Her yazım iptal isteğini de geri okur (ayrı sorgu yok).
 */
import "server-only";

import { jobRowPatchSchema, type JobRowPatch } from "@/lib/data/job-schema";
import { toPanelJob } from "@/lib/data/supabase/mappers/job";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { AdminClient } from "@/lib/supabase/admin";
import { DAY_MS } from "@/lib/time";

/** Günlük kuyruğu (`log_tail`) bu süreden eski bitmiş işlerde boşaltılır (yalnız yönetici görür; rakip metni taşıyabilir). */
export const JOB_LOG_RETENTION_MS = 14 * DAY_MS;

export interface FencedWrite {
  /** false = 0 satır etkilendi: iş artık bu işçinin değil. */
  applied: boolean;
  /** Yazım anında satırdaki iptal isteği (ISO); yoksa undefined. */
  cancelRequestedAt?: string;
}

export interface JobRef {
  id: string;
  workerId: string;
}

/** Yama yazma sözleşmesine (`jobRowPatchSchema`) uymuyor: yeniden denemek işe yaramaz (geçici DB hatasından ayrılır). */
export class InvalidJobPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJobPatchError";
  }
}

/** Yamayı yazma sözleşmesiyle doğrular (saf); uymuyorsa `InvalidJobPatchError`. Sahte depolar da bunu kullanır. */
export function validateJobPatch(patch: JobRowPatch): JobRowPatch {
  const parsed = jobRowPatchSchema.safeParse(patch);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new InvalidJobPatchError(`Geçersiz iş yaması (${issue?.path.join(".") ?? "?"}): ${issue?.message ?? "şema"}`);
}

export interface JobStore {
  /** Kuyruğun sıradaki işini alır (`running`). İş yoksa ya da kuyrukta başka işçinin taze işi varsa undefined. */
  claim(queue: string, workerId: string): Promise<PanelJob | undefined>;
  /** Çitli yazım. Geçersiz yama (`InvalidJobPatchError`) ve DB hatası fırlatır; 0 satır fırlatmaz (`applied: false`). */
  patch(ref: JobRef, patch: JobRowPatch): Promise<FencedWrite>;
  /** `before`'dan önce bitmiş işlerin günlük kuyruğunu boşaltır (yalnız bu kuyruk); boşaltılan iş sayısı. */
  clearOldLogTails(queue: string, before: Date): Promise<number>;
}

export function createJobStore(client: AdminClient): JobStore {
  return {
    async claim(queue, workerId) {
      const { data, error } = await client.rpc("claim_panel_job", { p_queue: queue, p_worker_id: workerId });
      if (error) throw new Error(`İş alınamadı: ${error.message}`);
      const row = data?.[0];
      if (row === undefined) return undefined;
      const job = toPanelJob(row);
      if (job === undefined) throw new Error(`Alınan iş eşlenemedi (bilinmeyen tür ya da durum): ${row.id}`);
      return job;
    },

    async patch(ref, patch) {
      const body = validateJobPatch(patch);
      const { data, error } = await client
        .from("panel_jobs")
        .update(body)
        .eq("id", ref.id)
        .eq("worker_id", ref.workerId)
        .eq("status", "running")
        .select("id, cancel_requested_at");
      if (error) throw new Error(`İş satırı yazılamadı: ${error.message}`);
      const row = data?.[0];
      if (row === undefined) return { applied: false };
      return { applied: true, ...(row.cancel_requested_at === null ? {} : { cancelRequestedAt: row.cancel_requested_at }) };
    },

    async clearOldLogTails(queue, before) {
      const { data, error } = await client
        .from("panel_jobs")
        .update({ log_tail: null })
        .eq("queue", queue)
        .not("log_tail", "is", null)
        .lt("finished_at", before.toISOString())
        .select("id");
      if (error) throw new Error(`Eski iş günlükleri temizlenemedi: ${error.message}`);
      return data?.length ?? 0;
    },
  };
}
