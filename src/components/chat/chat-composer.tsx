"use client";

import { SendHorizontal } from "lucide-react";
import type { KeyboardEvent, Ref } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_QUESTION_MAX } from "@/lib/agents/chat/limits";

interface ChatComposerProps {
  /** Yazılan metin (üst bileşende durur: panel kapanıp açılınca yarım yazı kaybolmaz). */
  value: string;
  onChange: (value: string) => void;
  onSend: (question: string) => void;
  /** Yanıt bekleniyor: aynı anda tek soru, yazma alanı kilitli. */
  busy: boolean;
  /** Sohbet kullanılamıyor: yazma alanı kapalı. */
  disabled: boolean;
  /** Masaüstü: Enter gönderir (Shift+Enter satır). Mobil: Enter satır atlar, gönderim düğmeyle. */
  enterSends: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/** Yazma alanı + gönder. Yazı boyu mobilde ≥ 16 px (`Textarea` `text-base md:text-sm`: iOS yakınlaştırmaz). */
export function ChatComposer({ value, onChange, onSend, busy, disabled, enterSends, textareaRef }: ChatComposerProps) {
  const canSend = !busy && !disabled && value.trim() !== "";

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    onChange("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !enterSends) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="flex items-end gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        // Bekleme sırasında kilit `readOnly` ile: `disabled` odağı düşürür, yanıt gelince yazmaya devam edilemezdi.
        readOnly={busy}
        disabled={disabled}
        aria-busy={busy}
        rows={1}
        maxLength={CHAT_QUESTION_MAX}
        enterKeyHint="send"
        aria-label="Sorun"
        placeholder={disabled ? "Sohbet şu an kullanılamıyor" : "Sorunu yaz"}
        className="max-h-32 min-h-tap flex-1 resize-none py-2.5 read-only:opacity-60"
      />
      <Button type="submit" size="icon" className="size-tap" aria-label="Gönder" disabled={!canSend}>
        <SendHorizontal aria-hidden />
      </Button>
    </form>
  );
}
