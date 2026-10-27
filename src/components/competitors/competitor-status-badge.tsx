import { Hint } from "@/components/common/hint";
import { Badge } from "@/components/ui/badge";
import type { CompetitorStatus } from "@/lib/domain/competitor";
import { cn } from "@/lib/utils";

interface StatusMeta {
  label: string;
  className?: string;
  variant?: "outline" | "secondary" | "destructive";
  /** private / not_found için neden veri gelmediğini anlatan ipucu. */
  hint?: string;
}

const STATUS_META: Record<CompetitorStatus, StatusMeta> = {
  tracked: {
    label: "İzleniyor",
    className: "border-transparent bg-success-soft text-success-soft-foreground",
  },
  candidate: { label: "Aday", variant: "outline" },
  ignored: { label: "Yoksayıldı", variant: "secondary" },
  private: {
    label: "Gizli hesap",
    className: "border-transparent bg-warning-soft text-warning-soft-foreground",
    hint: "Hesap gizli olduğu için herkese açık veri toplanamıyor. Oturum açarak veri çekmiyoruz; hesap herkese açılana kadar içerik ve takipçi bilgisi görünmez.",
  },
  not_found: {
    label: "Bulunamadı",
    variant: "destructive",
    hint: "Bu kullanıcı adıyla hesap bulunamadı: hesap silinmiş, adı değişmiş ya da yanlış yazılmış olabilir.",
  },
};

/** Rakip durum rozeti; gizli/bulunamadı için açıklayıcı ipucu balonu ekler. */
export function CompetitorStatusBadge({ status }: { status: CompetitorStatus }) {
  const meta = STATUS_META[status];
  const badge = (
    <Badge variant={meta.variant ?? "outline"} className={cn(meta.className)} data-status={status}>
      {meta.label}
    </Badge>
  );
  return meta.hint ? (
    <Hint content={meta.hint} label={`${meta.label}: ${meta.hint}`}>
      {badge}
    </Hint>
  ) : (
    badge
  );
}
