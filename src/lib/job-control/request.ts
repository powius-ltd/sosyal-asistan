/**
 * İş isteğinin panel tarafı: onay denetimi + satırı yazma. İş burada KOŞMAZ (`repo.requestJob` yalnız `queued` satır yazar; ayrık işçi alır).
 *
 * Onay verildiyse önce çalışma alanının ŞU ANKİ tavan durumuna bakılır (`assertJobApprovalAllowed`: depo ile AYNI kural). Depo bunu zaten
 * uygular; burada önden bakılmasının tek nedeni kullanıcıya NEDENİNİ söyleyebilmektir (action'ın ortak hata çevirisi depo mesajını
 * genel bir cümleyle değiştirir). Çalışma alanı kimliği çağırandan gelir: panelde `getPanelContext()`, "tüm hesaplar"da sunucudaki kayıt.
 */
import "server-only";

import { assertJobApprovalAllowed } from "@/lib/data/job-input";
import type { JobApprovalInput, RequestJobInput } from "@/lib/data/queries";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { PanelJob } from "@/lib/domain/panel-job";

export type JobRequestRepo = Pick<PanelRepository, "getWorkspace" | "requestJob">;

/** Onay bu çalışma alanında şu an kullanılamıyor (harcama kapalı ya da aylık tavan onaysız). `message` kullanıcıya gösterilebilir. */
export class JobApprovalRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobApprovalRefused";
  }
}

/** Onayı çalışma alanının tavan durumuna göre denetler, sonra işi sıraya yazar. Onay reddi `JobApprovalRefused`, gerisi depo hatasıdır. */
export async function requestJobChecked(repo: JobRequestRepo, wsId: string, input: RequestJobInput): Promise<PanelJob> {
  const approval = "approval" in input ? input.approval : undefined;
  if (approval !== undefined) {
    const workspace = await repo.getWorkspace(wsId);
    // Çalışma alanı yoksa karar deponundur (`not_found`).
    if (workspace !== null) {
      try {
        assertJobApprovalAllowed({ kind: input.kind, approval }, workspace);
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "invalid_input") throw new JobApprovalRefused(error.message);
        throw error;
      }
    }
  }
  return repo.requestJob(wsId, input);
}

/** "Tüm hesaplar" sonucu. Sayılar gerçektir: açılamayan çalışma alanı `skipped` ya da `failed` olarak ayrı sayılır, gizlenmez. */
export interface RoutineForAllOutcome {
  /** Açılan iş sayısı. */
  requested: number;
  /** Etkin (sırada / çalışan) işi olduğu için atlanan çalışma alanı sayısı. */
  skipped: number;
  /** Başka bir nedenle iş açılamayan çalışma alanı sayısı (onay reddi, depo hatası). */
  failed: number;
  /** Geçerli çalışma alanında açılan iş (orada açılamadıysa yok). */
  jobId?: string;
  /** İlk başarısızlığın hatası (`failed > 0` ise dolu): çağıran kullanıcı mesajına çevirir. */
  firstError?: unknown;
}

export interface RoutineForAllInput {
  repo: JobRequestRepo;
  /** Çalışma alanları, SUNUCUDAKİ kayıttan ve kayıt sırasıyla (istekten gelmez). İşler bu sırayla yazılır; işçi de bu sırayla alır. */
  workspaceIds: readonly string[];
  currentWsId: string;
  /** Yalnız haftalık tur alanları (`requestRoutineForAllSchema`); onay tutarı çalışma alanı BAŞINA geçerlidir. */
  request: { dryRun?: boolean; approval?: JobApprovalInput };
}

/**
 * Her çalışma alanına bir haftalık tur yazar (`rutin --all` karşılığı). Biri açılamazsa diğerleri yine denenir (sırayla, biri diğerini
 * beklemez): etkin işi olan atlanır, başka hata sayılır ve ilki saklanır. Hiçbir durumda fırlatmaz.
 */
export async function requestRoutineForAll(input: RoutineForAllInput): Promise<RoutineForAllOutcome> {
  const outcome: RoutineForAllOutcome = { requested: 0, skipped: 0, failed: 0 };
  for (const wsId of input.workspaceIds) {
    try {
      const job = await requestJobChecked(input.repo, wsId, { kind: "routine", ...input.request });
      outcome.requested += 1;
      if (wsId.toLowerCase() === input.currentWsId.toLowerCase()) outcome.jobId = job.id;
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "already_exists") {
        outcome.skipped += 1;
      } else {
        outcome.failed += 1;
        outcome.firstError ??= error;
      }
    }
  }
  return outcome;
}
