"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessages } from "@/components/chat/chat-messages";
import { CHAT_INTRO_TEXT, ChatStarters } from "@/components/chat/chat-starters";
import type { ChatState } from "@/components/chat/use-chat";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  /** Başlık satırı (başlık + kapat; Popover/Sheet'e göre üst bileşen kurar). */
  header: ReactNode;
  starters: readonly string[];
  chat: ChatState;
  draft: string;
  onDraftChange: (value: string) => void;
  enterSends: boolean;
  textareaRef: Ref<HTMLTextAreaElement>;
}

/** Boş sohbet: tek cümle karşılama + hazır sorular (veri yoksa gizli). */
function Welcome({ starters, onPick, disabled }: { starters: readonly string[]; onPick: (question: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3" data-testid="chat-welcome">
      <p className="text-base md:text-sm">{CHAT_INTRO_TEXT}</p>
      <ChatStarters starters={starters} onPick={onPick} disabled={disabled} />
    </div>
  );
}

/** Sohbet gövdesi: konuşma günlüğü + yazma alanı. Popover ve Sheet'in ortak içeriği. */
export function ChatPanel({ header, starters, chat, draft, onDraftChange, enterSends, textareaRef }: ChatPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const { messages, pending } = chat;

  // Yeni mesaj ya da bekleme göstergesi gelince günlüğün sonuna kay.
  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [messages, pending]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat-panel">
      {header}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Konuşma"
        aria-busy={pending !== undefined}
        tabIndex={0}
        className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset")}
      >
        {messages.length === 0 && pending === undefined ? (
          <Welcome starters={starters} onPick={chat.send} disabled={chat.unavailable} />
        ) : (
          <ChatMessages messages={messages} pending={pending} onRetry={chat.retry} onCancel={chat.cancel} />
        )}
      </div>
      <ChatComposer value={draft} onChange={onDraftChange} onSend={chat.send} busy={pending !== undefined} disabled={chat.unavailable} enterSends={enterSends} textareaRef={textareaRef} />
    </div>
  );
}
