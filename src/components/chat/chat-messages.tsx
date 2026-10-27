import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { resolveEvidence } from "@/components/briefing/evidence-links";
import { ChatEvidence } from "@/components/chat/chat-evidence";
import { ChatText } from "@/components/chat/chat-text";
import type { ChatMessage, ChatPending } from "@/components/chat/chat-types";
import { AiPending, type AiPendingStage } from "@/components/common/ai-pending";
import { AiSurface, AiVoice } from "@/components/common/ai-surface";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bekleme aşamaları (sırayla): sunucunun bildirdiği gerçek aşamalar. */
const STAGES: readonly (AiPendingStage & { id: ChatPending["stage"] })[] = [
  { id: "facts", label: "Verilerine bakıyorum" },
  { id: "writing", label: "Yanıtı yazıyorum" },
];

/** İnsanın (ve sistemin) sözü: balon. AI'ın sözü balon DEĞİLDİR, ortak AI yüzeyidir (`AiSurface`). */
function Bubble({ side, children, className }: { side: "user" | "system"; children: ReactNode; className?: string }) {
  return (
    <li className={cn("flex min-w-0", side === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 max-w-[92%] rounded-xl px-3 py-2 text-base break-words md:text-sm",
          side === "user" ? "bg-secondary text-secondary-foreground" : "border border-border bg-background text-foreground",
          className,
        )}
      >
        {children}
      </div>
    </li>
  );
}

function MessageView({ message, onRetry, disabled }: { message: ChatMessage; onRetry: (id: number) => void; disabled: boolean }) {
  if (message.role === "user") {
    return (
      <Bubble side="user">
        <p className="whitespace-pre-line">{message.text}</p>
      </Bubble>
    );
  }
  if (message.role === "error") {
    return (
      <Bubble side="system">
        <p role="alert">{message.message}</p>
        <Button type="button" variant="outline" size="touch" className="mt-2 min-h-tap" onClick={() => onRetry(message.id)} disabled={disabled}>
          <RotateCcw aria-hidden />
          Tekrar dene
        </Button>
      </Bubble>
    );
  }
  const answered = message.kind === "answer";
  return (
    <li className="min-w-0 animate-arrive">
      <AiSurface
        filled
        confidence={answered ? message.confidence : undefined}
        evidenceCount={answered ? resolveEvidence(message.evidence).length : undefined}
        footer={
          <>
            {answered ? <ChatEvidence evidence={message.evidence} /> : null}
          </>
        }
      >
        <AiVoice className="whitespace-pre-line">
          <ChatText text={message.text} />
        </AiVoice>
      </AiSurface>
    </li>
  );
}

interface ChatMessagesProps {
  messages: readonly ChatMessage[];
  pending?: ChatPending;
  onRetry: (id: number) => void;
  onCancel: () => void;
}

/** Konuşma listesi (`role="log"` içinde çizilir). Yanıt beklenirken soru yukarıda görünür, altında gerçek aşamalar (`AiPending`). */
export function ChatMessages({ messages, pending, onRetry, onCancel }: ChatMessagesProps) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => (
        <MessageView key={message.id} message={message} onRetry={onRetry} disabled={pending !== undefined} />
      ))}
      {pending === undefined ? null : (
        <li className="min-w-0">
          <AiPending stages={STAGES} current={pending.stage} slow={pending.slow} onCancel={onCancel} data-testid="chat-pending" />
        </li>
      )}
    </ol>
  );
}
