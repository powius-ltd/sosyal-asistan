/** İş satırı görünüm modeli: iş + hesap etiketi + bağlı fikir başlığı. Sayfada bir kez kurulur. */
import { checkCompliance } from "@/lib/compliance";
import type { ComplianceRegion, ComplianceResult } from "@/lib/domain/compliance";
import type { OwnAccount } from "@/lib/domain/competitor";
import type { Idea } from "@/lib/domain/intel";
import type { PublishJob } from "@/lib/domain/publish";
import { orderRevisionProblem, revisionsLeft, type OrderRevisionEntry, type StudioOrder } from "@/lib/domain/studio-order";

/** Stüdyo videosunun revize durumu (yalnız GÜNCEL sürümün yayın satırında dolu; iptal edilen eski sürümde yok). */
export interface PublishOrderView {
  /** Panel fişinin kimliği (`studio_orders.id`). */
  id: string;
  revision: number;
  history: OrderRevisionEntry[];
  /** Kalan revize hakkı. */
  left: number;
  /** Şu an revize istenebilir mi (üretildi + onay/taslak aşamasında + hak var). */
  canRevise: boolean;
}

export interface PublishJobView {
  /** Stüdyo videosunun fişi (yayın işi `orderId` ile fişin güncel sürümüne bağlıysa). */
  order?: PublishOrderView;
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
  orders: readonly StudioOrder[] = [],
): PublishJobView[] {
  const handleById = new Map(accounts.map((a) => [a.id, a.handle]));
  const titleById = new Map(ideas.map((i) => [i.id, i.title]));
  const orderBySlot = new Map(orders.map((o) => [o.ticket.siparis_id, o]));
  return jobs.map((job) => {
    const handle = handleById.get(job.socialAccountId);
    const order = job.orderId !== undefined ? orderBySlot.get(job.orderId) : undefined;
    return {
      job,
      ...(order && {
        order: { id: order.id, revision: order.revision, history: order.revisions, left: revisionsLeft(order), canRevise: orderRevisionProblem(order, job.status) === undefined },
      }),
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
