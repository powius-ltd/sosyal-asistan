"use client";

import { Check } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bu kadar bekleyince "biraz sürebilir" yazılır (çağıran `slow` vermiyorsa). */
export const AI_PENDING_SLOW_AFTER_MS = 10_000;

export interface AiPendingStage {
  id: string;
  /** Düz dil, birinci tekil: "Verilerine bakıyorum" (üç nokta bileşenden gelir). */
  label: string;
}

interface AiPendingProps extends Omit<ComponentProps<"div">, "children"> {
  /** GERÇEK aşamalar, sırayla (sunucunun bildirdiği; uydurma adım yazılmaz). */
  stages: readonly AiPendingStage[];
  /** Şu anki aşamanın kimliği: öncekiler "tamam" görünür, sonrakiler henüz yazılmaz. */
  current: string;
  /** Verilirse "Vazgeç" düğmesi çizilir. */
  onCancel?: () => void;
  /** "Biraz sürebilir" dışarıdan yönetiliyorsa (çağıranın kendi zamanlayıcısı); verilmezse bileşen `slowAfterMs` sonra kendisi yazar. */
  slow?: boolean;
  slowAfterMs?: number;
}

/**
 * AI çalışırken bekleme: adım adım yazılan gerçek aşama satırları + ince belirsiz ilerleme çizgisi + uzun sürerse "Biraz sürebilir."
 * + "Vazgeç". İskelet/parıltı yok. Hareket azaltılmışsa çizgi durur (`globals.css`), aşama metni yine değişir.
 */
export function AiPending({ stages, current, onCancel, slow, slowAfterMs = AI_PENDING_SLOW_AFTER_MS, className, ...rest }: AiPendingProps) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (slow !== undefined) return;
    const timer = setTimeout(() => setTimedOut(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slow, slowAfterMs]);

  const currentIndex = stages.findIndex((stage) => stage.id === current);
  const shown = currentIndex === -1 ? [] : stages.slice(0, currentIndex + 1);
  return (
    <div data-slot="ai-pending" className={cn("flex min-w-0 flex-col gap-2 border-l-2 border-ai-rule pl-3", className)} {...rest}>
      <ol className="flex flex-col gap-1 text-sm">
        {shown.map((stage, index) =>
          index < currentIndex ? (
            <li key={stage.id} data-stage="done" className="flex items-center gap-1.5 text-ai-meta">
              <Check className="size-3.5" aria-hidden />
              {stage.label}
              <span className="sr-only"> (tamam)</span>
            </li>
          ) : (
            <li key={stage.id} data-stage="current" className="animate-arrive font-medium">
              {stage.label}…
            </li>
          ),
        )}
      </ol>
      <div className="h-0.5 w-full max-w-64 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="h-full w-1/3 animate-progress rounded-full bg-ai-rule" />
      </div>
      {(slow ?? timedOut) ? <p className="text-xs text-ai-meta">Biraz sürebilir.</p> : null}
      {onCancel ? (
        <Button type="button" variant="ghost" size="touch" className="-ml-4 w-fit" onClick={onCancel}>
          Vazgeç
        </Button>
      ) : null}
    </div>
  );
}
