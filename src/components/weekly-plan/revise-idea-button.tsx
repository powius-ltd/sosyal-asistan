"use client";

import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { askAssistant } from "@/components/chat/chat-bridge";
import { Button } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { PLAN_SCREEN_PLAIN as T } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

/**
 * Plan kartındaki "Sohbetle değiştir": Asistan'ı açıp fikri adıyla anar (ne değişeceğini Asistan sorar; fikir kimliği sunucuda plandan çözülür).
 * Sohbet yuvası yoksa (ortam uygun değil) kimse dinlemez: kullanıcıya bunu söyler, sessiz kalmaz.
 */
export function ReviseIdeaButton({ title, className }: { title: string; className?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className={cn(TAP, className)} onClick={() => (askAssistant(T.reviseAsk(title)) ? undefined : toast.error(T.reviseUnavailable))}>
      <MessageSquare aria-hidden />
      {T.revise}
    </Button>
  );
}
