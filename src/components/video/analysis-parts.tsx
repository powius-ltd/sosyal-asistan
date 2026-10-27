import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Hint } from "@/components/common/hint";

/** Analiz kartlarının küçük bölüm başlığı. */
export function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

/** Birebir alıntı: kaynaktan olduğu gibi, tırnak içinde. */
export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground italic">“{children}”</blockquote>;
}

/** Alıntı korpusta (konuşma, ekran yazısı, açıklama) birebir bulunamadıysa yanına konan işaret (kanıt raporundan). */
export function UnverifiedMark() {
  return (
    <Hint
      content="Bu alıntı konuşma, ekran yazısı ya da açıklamada birebir bulunamadı (ayrıntı: Kanıt raporu). Dikkatle değerlendirin."
      label="Alıntı doğrulanamadı"
    >
      <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-soft-foreground">
        <TriangleAlert className="size-3" aria-hidden />
        Doğrulanamadı
      </span>
    </Hint>
  );
}
