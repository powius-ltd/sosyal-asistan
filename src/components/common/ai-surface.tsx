import { Fragment, type ReactNode } from "react";

import { ConfidenceMeter } from "@/components/common/confidence-meter";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** AI metninin yazı biçimi (serif, okuma boyu; masaüstünde KÜÇÜLMEZ). Paragraf dışı öğelerde (bağlantı, başlık) sınıf olarak kullanılır. */
export const AI_VOICE_CLASS = "font-voice text-[1.0625rem] leading-[1.55] break-words";

/** AI'ın yazdığı cümle: serif metin yuvası (en çok 68 karakterlik okuma sütunu). */
export function AiVoice({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(AI_VOICE_CLASS, "max-w-[68ch]", className)}>{children}</p>;
}

export interface AiBylineProps {
  /** Kim söyledi (maskot adı ya da "… diyor ki"; dışarıdan gelir, kaynakta ad yok). */
  author?: string;
  /** Ne zaman (hazır yazı: "2 saat önce"). Bilinmiyorsa verilmez; uydurma zaman yazılmaz. */
  when?: string;
  confidence?: ConfidenceLevel;
  /** Kanıt sayısı; 0 ya da bilinmiyorsa yazılmaz. */
  evidenceCount?: number;
  /** Künyenin sonuna eklenecek parça (rozet vb.). */
  children?: ReactNode;
  className?: string;
}

/** Künye satırı: kim · ne zaman · güven · kanıt sayısı. Verilmeyen parça yazılmaz; hiçbiri yoksa satır çizilmez. */
export function AiByline({ author, when, confidence, evidenceCount, children, className }: AiBylineProps) {
  const parts: ReactNode[] = [];
  if (author !== undefined && author !== "") parts.push(<span data-byline="author">{author}</span>);
  if (when !== undefined && when !== "") parts.push(<span data-byline="when">{when}</span>);
  if (confidence !== undefined) parts.push(<ConfidenceMeter level={confidence} />);
  if (evidenceCount !== undefined && evidenceCount > 0) parts.push(<span data-byline="evidence">{formatNumber(evidenceCount)} kanıt</span>);
  if (children !== undefined && children !== null && children !== false) parts.push(children);
  if (parts.length === 0) return null;
  return (
    <div data-slot="ai-byline" className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ai-meta", className)}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </Fragment>
      ))}
    </div>
  );
}

interface AiSurfaceProps extends Omit<AiBylineProps, "children" | "className"> {
  /** AI'ın metni: düz metin verilirse serif paragraf olur; kendi düzeni olan içerik `AiVoice` ile yazılır. */
  children: ReactNode;
  /** Künyeden sonra gelen bölüm ("Neden?" katmanı, bağlantı). */
  footer?: ReactNode;
  /** Hafif zeminli çeşit (`--ai-surface`): kendi zemini olmayan yerde (sohbet akışı) AI'ı insandan ayırır. */
  filled?: boolean;
  className?: string;
}

/**
 * AI yüzeyi: AI'ın hazırladığı her içeriğin ORTAK biçimi. Kutu değildir: sol kenarda 2 px çizgi (`--ai-rule`) + serif metin +
 * altında künye. İşaret renk/ikon değil biçimdir (parıltı, mor, yıldız yok).
 */
export function AiSurface({ children, footer, filled = false, className, ...byline }: AiSurfaceProps) {
  return (
    <div
      data-slot="ai-surface"
      className={cn(
        "flex min-w-0 flex-col gap-1.5 border-l-2 border-ai-rule pl-3 text-ai-surface-foreground",
        filled && "rounded-r-md bg-ai-surface py-2 pr-3",
        className,
      )}
    >
      {typeof children === "string" ? <AiVoice>{children}</AiVoice> : children}
      <AiByline {...byline} />
      {footer}
    </div>
  );
}
