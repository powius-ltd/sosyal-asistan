import { Info } from "lucide-react";

import type { JobsClosedReason } from "@/components/jobs/jobs-state";
import { JOB_SCREEN_PLAIN } from "@/lib/plain-language";

/**
 * İşler neden buradan başlatılamıyor: düz dil (komut, sağlayıcı, ortam değişkeni adı yok). Müşterinin gördüğü tek neden `customer`'dır ve
 * metni sözlükten gelir; diğerleri yalnız yönetici modunda çizilir (ortam nedeni).
 */
const TEXT: Record<JobsClosedReason, { title: string; body: string }> = {
  customer: { title: JOB_SCREEN_PLAIN.customerTitle, body: JOB_SCREEN_PLAIN.customerBody },
  data_source: { title: "Örnek veriyle çalışıyorsun", body: "Örnek veride iş başlatılamaz; aşağıdaki geçmiş de örnektir. Gerçek veriye geçince düğmeler burada görünür." },
  hosted: { title: "Bu ortamda iş başlatılamaz", body: "İşler yalnız panelin kurulu olduğu bilgisayardan başlatılır." },
  worker_missing: { title: "İşleri çalıştıran parça bulunamadı", body: "Kurulum eksik görünüyor; işler şimdilik buradan başlatılamıyor." },
  not_ready: { title: "İş başlatma henüz hazır değil", body: "Hazır olunca düğmeler burada görünecek." },
};

/** İşler kapalıyken (müşteri görünümü, örnek veri, barındırılan ortam, işçi yok) düğmelerin yerine gelen açıklama. */
export function JobsClosedNotice({ reason }: { reason: JobsClosedReason }) {
  const { title, body } = TEXT[reason];
  return (
    <div role="note" data-slot="jobs-closed" data-reason={reason} className="flex items-start gap-2.5 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
