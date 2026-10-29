import { loadJobRunContext, loadJobsState } from "@/components/jobs/jobs-state";
import { ProduceButton } from "@/components/studio-order/produce-button";
import { PRODUCE_COPY } from "@/lib/copy/studio-order";
import type { StudioOrder } from "@/lib/domain/studio-order";
import { ORDER_SEND_PROBLEM_PLAIN } from "@/lib/plain-language-order";
import { findStudioAccount } from "@/lib/studio-order/accounts";
import { orderSendProblem } from "@/lib/studio-order/send-to-studio";

/**
 * Fişteki "Üretime gönder" yuvası (SUNUCU bileşeni). Çizilmez: işler bu istekte başlatılamıyorsa (müşteri görünümü, örnek veri, işçi yok) ya da
 * fiş artık gönderilebilir durumda değilse (üretildi / hata / paylaşıldı). Gönderilemeyen TÜR (anlatım, UGC, konu kipi, stüdyosuz hesap)
 * düğme yerine düz cümleyle söylenir. Üretimi süren fiş (`uretiliyor`) yeniden gönderilebilir (yarıda kalan iş), notuyla.
 */
export async function ProduceAction({ order, panelSlug }: { order: StudioOrder; panelSlug: string | undefined }) {
  if (order.status !== "taslak" && order.status !== "uretiliyor") return null;
  let context;
  try {
    const state = await loadJobsState();
    context = state.canRun ? await loadJobRunContext() : undefined;
  } catch (error) {
    console.error("[isler] üretim düğmesi hazırlanamadı", error);
    return null;
  }
  if (context === undefined) return null;
  const problem = orderSendProblem(order, findStudioAccount(panelSlug));
  if (problem !== undefined) return <p className="text-sm text-muted-foreground">{ORDER_SEND_PROBLEM_PLAIN[problem]}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <ProduceButton orderId={order.id} context={context} />
      {order.status === "uretiliyor" ? <p className="text-xs text-muted-foreground">{PRODUCE_COPY.retryHint}</p> : null}
    </div>
  );
}
