"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { createStudioOrderAction } from "@/app/actions/studio-orders";
import { callAction } from "@/components/common/call-action";
import { Button } from "@/components/ui/button";
import { ENTRY_COPY as COPY } from "@/lib/copy/entry";
import type { OrderKind } from "@/lib/studio-order/create-for-idea";

/** "Siz yapın" seçeneğinin üretim türü: stüdyo animasyonla hazırlar. */
const STUDIO_KIND: OrderKind = "animasyon";

/**
 * Videonun kararı (en küçük istemci yaprağı): "Ben çekerim" fişi UGC olarak, "Siz yapın" animasyon olarak yazar (fiş zaten varsa
 * türünü değiştirir; aynı action). Sonra sayfa yenilenir: hat ve video satırı yeni aşamayı gösterir.
 */
export function KindChoice({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const choose = (kind: OrderKind) =>
    startTransition(async () => {
      const result = await callAction(() => createStudioOrderAction({ ideaId, kind }), COPY.card.failed);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  return (
    <>
      <Button type="button" className="min-h-tap md:min-h-9" disabled={pending} onClick={() => choose("ugc")}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {COPY.card.actions.ugc}
      </Button>
      <Button type="button" variant="outline" className="min-h-tap md:min-h-9" disabled={pending} onClick={() => choose(STUDIO_KIND)}>
        {COPY.card.actions.studio}
      </Button>
    </>
  );
}
