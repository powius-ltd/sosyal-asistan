"use client";

import { MessageCircle } from "lucide-react";
import { useId, type ComponentProps } from "react";

import { Demirkazik } from "@/components/mascot/demirkazik";
import type { MascotState } from "@/lib/mascot/state";
import { cn } from "@/lib/utils";

/** Pencere kapalıyken canlı bölgenin söylediği iki durum (diğer durumlarda sessiz). */
export const LAUNCHER_STATUS_TEXT: Partial<Record<MascotState, string>> = {
  thinking: "Yanıt hazırlanıyor…",
  telling: "Yeni yanıt var",
};
/** Sarı nokta: ekran okuyucuya açıklama olarak okunur (canlı bölge DEĞİL: her sayfada konuşmasın). */
export const LAUNCHER_ATTENTION_TEXT = "Bekleyen kararın var";

interface ChatLauncherProps extends Omit<ComponentProps<"button">, "children"> {
  /** Erişilebilir ad ("Maskot'a sor"). */
  label: string;
  /** Düğmedeki Demirkazık'ın durumu (`dockMascotState`). */
  mascot: MascotState;
  /** Gizle (telefonda yazı alanı odaktayken: ekran klavyesinin üstüne çıkıp alanı örtmesin). */
  concealed?: boolean;
  /** Müşteri kopyası: Demirkazık yerine düz sohbet ikonu (sürüm sunucudan gelir). */
  plain?: boolean;
}

/**
 * Sağ alt köşedeki yuvarlak sohbet düğmesi (56 px): Demirkazık + durum. Konum tek CSS değişkenine bağlıdır (`--shell-bottom-nav`: dar
 * ekranda alt sekme çubuğunun boyu, geniş ekranda 0), böylece alt gezinme değişse de üst üste binmez. Katman `z-40`: sayfanın ve
 * yapışkan başlıkların üstünde, modal pencerelerin (`z-50`) altında. Popover/Sheet tetikleyicisi olarak `render` ile kullanılır;
 * `ref` ve tetikleyici özellikleri düğmeye yayılır; içerik (JSX çocukları) tetikleyicinin geçirdiği `children`'in yerini alır.
 * Zemin Bugün'ün baskın karar bloğuyla aynı gece mavisidir: düğme bloğun üstüne gelince kaybolmasın diye ince açık halka (`ring-focus-ink`) çevreler.
 */
export function ChatLauncher({ label, mascot, concealed = false, plain = false, className, ...props }: ChatLauncherProps) {
  const descriptionId = useId();
  const attention = mascot === "turn";
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-describedby={attention ? descriptionId : undefined}
      data-testid="chat-launcher"
      data-mascot={mascot}
      {...props}
      className={cn(
        "fixed right-4 bottom-[calc(var(--shell-bottom-nav)+env(safe-area-inset-bottom)+0.75rem)] z-40 grid size-14 place-items-center rounded-full bg-focus-surface text-focus-ink shadow-float ring-2 ring-focus-ink/80 outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:right-6",
        concealed && "hidden",
        className,
      )}
    >
      {plain ? (
        <MessageCircle className="size-7" aria-hidden />
      ) : (
        <Demirkazik state={mascot} className="size-10 [--mascot-body:var(--focus-ink)] [--mascot-part:var(--focus-ink-muted)]" />
      )}
      <span id={descriptionId} className="sr-only">
        {attention ? LAUNCHER_ATTENTION_TEXT : null}
      </span>
    </button>
  );
}

/**
 * Düğmenin canlı bölgesi (düğmeyle yan yana; düğmenin İÇİNDEKİ canlı bölge okunmaz). Yalnız yanıt hazırlanırken ve yeni yanıt
 * gelince konuşur; `silent` (pencere açık): konuşma günlüğü zaten duyurur, ikinci kez söylemez.
 */
export function ChatLauncherStatus({ mascot, silent = false }: { mascot: MascotState; silent?: boolean }) {
  return (
    <span role="status" className="sr-only">
      {silent ? null : LAUNCHER_STATUS_TEXT[mascot]}
    </span>
  );
}
