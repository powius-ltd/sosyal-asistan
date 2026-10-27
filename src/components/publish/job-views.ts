/** İş satırı görünüm modeli: iş + hesap etiketi + bağlı fikir başlığı. Sayfada bir kez kurulur. */
import { checkCompliance } from "@/lib/compliance";
import type { ComplianceRegion, ComplianceResult } from "@/lib/domain/compliance";
import type { OwnAccount } from "@/lib/domain/competitor";
import type { Idea } from "@/lib/domain/intel";
import type { PublishJob } from "@/lib/domain/publish";

export interface PublishJobView {
  job: PublishJob;
  /** "@bahcekafe.ist"; hesap bulunamazsa kimlik. */
  accountLabel: string;
  ideaTitle?: string;
  /** Uyum denetimi (`checkCompliance`): işin açıklaması + işaretleri, workspace'in uyum bölgesine göre. */
  compliance: ComplianceResult;
  /** Denetimin uygulandığı bölge (`workspace.complianceRegion`); panelde etiketlenir. */
  complianceRegion: ComplianceRegion;
}

export function buildJobViews(
  jobs: PublishJob[],
  accounts: Pick<OwnAccount, "id" | "handle">[],
  ideas: Pick<Idea, "id" | "title">[],
  complianceRegion: ComplianceRegion,
): PublishJobView[] {
  const handleById = new Map(accounts.map((a) => [a.id, a.handle]));
  const titleById = new Map(ideas.map((i) => [i.id, i.title]));
  return jobs.map((job) => {
    const handle = handleById.get(job.socialAccountId);
    return {
      job,
      accountLabel: handle ? `@${handle}` : job.socialAccountId,
      ideaTitle: job.ideaId ? titleById.get(job.ideaId) : undefined,
      complianceRegion,
      compliance: checkCompliance({
        caption: job.caption ?? "",
        isPaidPartnership: job.paidPartnership,
        isAiGenerated: job.aiGenerated,
        advertiserName: job.advertiserName,
        region: complianceRegion,
      }),
    };
  });
}

const timeOf = (iso: string | undefined) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/**
 * Kuyruk = henüz sonuçlanmamış işler (taslak … yayınlanıyor + dikkat isteyen başarısız/süresi dolmuş);
 * yakın plan önce, zamansız olanlar sonda. Geçmiş = yayınlanmış/iptal edilmiş, en yeni önce.
 */
export function splitQueue(views: PublishJobView[]): { queue: PublishJobView[]; history: PublishJobView[] } {
  const isHistory = (v: PublishJobView) => v.job.status === "published" || v.job.status === "cancelled";
  const queue = views
    .filter((v) => !isHistory(v))
    .sort((a, b) => timeOf(a.job.scheduledFor) - timeOf(b.job.scheduledFor) || a.job.createdAt.localeCompare(b.job.createdAt));
  const history = views
    .filter(isHistory)
    .sort((a, b) => b.job.updatedAt.localeCompare(a.job.updatedAt));
  return { queue, history };
}
