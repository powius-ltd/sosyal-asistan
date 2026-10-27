import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "warning";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
};

interface StatCardProps {
  label: string;
  /** Genellikle sayı ya da `<MeasuredValue … />` (ölçülemeyen değer tire gösterir). */
  value: ReactNode;
  unit?: string;
  /** Değerin altındaki küçük açıklama/karşılaştırma ("önceki döneme göre +%4"). */
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  className?: string;
}

/** Sayı kartı: küçük etiket + büyük değer + isteğe bağlı açıklama. */
export function StatCard({ label, value, unit, hint, icon, tone = "default", className }: StatCardProps) {
  return (
    <Card size="sm" className={className}>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("text-2xl font-semibold tracking-tight tabular", TONE_TEXT[tone])}>{value}</span>
          {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
