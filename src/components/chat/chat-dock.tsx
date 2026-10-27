"use client";

import { MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CHAT_ASK_EVENT, type ChatAskDetail } from "@/components/chat/chat-bridge";
import { ChatLauncher, ChatLauncherStatus } from "@/components/chat/chat-launcher";
import { ChatPanel } from "@/components/chat/chat-panel";
import { CHAT_WINDOW_ATTRIBUTE, isEscapeForAnotherLayer } from "@/components/chat/escape-layer";
import { withDative } from "@/components/chat/dative";
import { useChat } from "@/components/chat/use-chat";
import { ChatDockAside, ChatDockAsideHeader } from "@/components/chat/chat-dock-aside";
import { useDockPreference } from "@/components/chat/use-dock-preference";
import { useIsDesktop, useIsWideDesktop } from "@/components/chat/use-desktop";
import { useTextEntryFocus } from "@/components/chat/use-text-entry-focus";
import { Demirkazik } from "@/components/mascot/demirkazik";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { dockMascotState } from "@/lib/mascot/state";

interface ChatDockProps {
  /** Maskot adı (sunucu `maskotName()` ile okur; metne gömülmez). */
  assistantName: string;
  /** Boş sohbette gösterilen hazır sorular (sunucu hesap türünden seçer). */
  starters: readonly string[];
  /** Bekleyen karar sayısı (Bugün kuyruğuyla aynı; düğmedeki sarı nokta). `undefined` = okunamadı, nokta çıkmaz. */
  attention?: number;
  /** Müşteri kopyası: Demirkazık hiçbir yerde çizilmez (düğme ve pencere başlığında düz sohbet ikonu). */
  plain?: boolean;
}

/**
 * Sohbet: `lg`+ ekranda sağ sabit sütun (`chat-dock-aside.tsx`; akışta, varsayılan açık, kapatılınca düğme döner, tercih `sp-chat-dock`);
 * daha dar ekranda sağ altta yüzen yuvarlak düğme + açılır pencere. Panel düzeninde durur (akıştan çıkmıştır, `fixed`), her sayfada görünür.
 * Açılınca `md` ve üstünde düğmeye bağlı, modal OLMAYAN pencere (arkadaki sayfa kullanılabilir kalır; dışa basınca kapanmaz, Esc ya da
 * düğme kapatır), altında tam ekran Sheet. Konuşma yalnız bu bileşenin durumundadır: pencere kapanınca ve sayfa değişince kalır, çalışma
 * alanı değişince (`key`) ve tam yenilemede silinir. Sayfa değişince masaüstünde pencere AÇIK kalır (kanıt bağlantısına basınca sayfa
 * pencerenin yanında açılır); telefonda tam ekran sayfayı örteceği için KAPANIR ve odak çalınmaz.
 */
export function ChatDock({ assistantName, starters, attention, plain = false }: ChatDockProps) {
  const pathname = usePathname();
  // Pencerenin açıldığı yolu tutar: telefonda yol değişince pencere kapanır ve bu değer silinir; masaüstünde yol aranmaz.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  // `lg`+: sohbet pencere değil sağ sabit sütundur; açık/kapalı tercihi `localStorage`'dadır (varsayılan açık).
  const isWide = useIsWideDesktop();
  const [columnOpen, setColumnOpen] = useDockPreference();
  // Telefonda başka yola geçilmişse pencere kapanır VE açık durumu gerçekten silinir: yoksa o yola geri dönünce (ya da masaüstü
  // genişliğine büyüyünce) kendiliğinden yeniden açılırdı. Render sırasında kendi durumunu ayarlamak React'in belgelediği desendir.
  const [closedByNavigation, setClosedByNavigation] = useState(false);
  if (!isDesktop && openedOn !== null && openedOn !== pathname) {
    setOpenedOn(null);
    setClosedByNavigation(true);
  }
  const open = isWide ? columnOpen : openedOn !== null && (isDesktop || openedOn === pathname);
  const chat = useChat(open);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const entryFocused = useTextEntryFocus();

  const { markSeen } = chat;
  const setOpen = (next: boolean) => {
    if (isWide) {
      setColumnOpen(next);
      if (next) markSeen();
      return;
    }
    setOpenedOn(next ? pathname : null);
    setClosedByNavigation(false);
    if (next) markSeen();
    // Kapanınca odak düğmeye döner. Pencereden çıkıp sayfada gezinmiş olsa da (masaüstünde pencere açık kalır) odak `body`'de kaybolmaz.
    else launcherRef.current?.focus();
  };

  // Köprü (`chat-bridge.ts`): sayfadan gelen mesajı açılan sohbete gönderir. `send` her çizimde değişir: ref'ten çağrılır.
  const sendRef = useRef(chat.send);
  const openRef = useRef(setOpen);
  useEffect(() => {
    sendRef.current = chat.send;
    openRef.current = setOpen;
  });
  useEffect(() => {
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<ChatAskDetail>).detail;
      if (detail.handled) return;
      detail.handled = true;
      openRef.current(true);
      sendRef.current(detail.text);
    };
    window.addEventListener(CHAT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(CHAT_ASK_EVENT, onAsk);
  }, []);

  const label = `${withDative(assistantName)} sor`;
  const mascot = dockMascotState({ pending: chat.pending !== undefined, unseen: chat.unseen, decisions: attention });
  const launcher = <ChatLauncher ref={launcherRef} label={label} mascot={mascot} plain={plain} concealed={!isDesktop && !open && entryFocused} />;

  const header = (title: ReactNode, className: string) => (
    <div className={`flex shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {plain ? <MessageCircle className="size-6" aria-hidden /> : <Demirkazik state={chat.pending !== undefined ? "thinking" : "waiting"} className="size-7" />}
        {title}
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-tap" aria-label="Sohbeti kapat" onClick={() => setOpen(false)}>
        <X aria-hidden />
      </Button>
    </div>
  );
  const panel = (title: ReactNode, headerClass: string) => (
    <ChatPanel header={header(title, headerClass)} starters={starters} chat={chat} draft={draft} onDraftChange={setDraft} enterSends={isDesktop} textareaRef={textareaRef} />
  );

  return (
    <>
      {/* Düğmenin içindeki canlı bölge okunmaz: durum değişikliği (yanıt hazır) düğmenin dışından duyurulur. */}
      <ChatLauncherStatus mascot={mascot} silent={open} />
      {isWide ? (
        columnOpen ? (
          <ChatDockAside>
            <ChatPanel
              header={<ChatDockAsideHeader title="Asistan" onClose={() => setOpen(false)} />}
              starters={starters}
              chat={chat}
              draft={draft}
              onDraftChange={setDraft}
              enterSends
              textareaRef={textareaRef}
            />
          </ChatDockAside>
        ) : (
          <ChatLauncher ref={launcherRef} label={label} mascot={mascot} plain={plain} aria-haspopup={undefined} aria-expanded={false} onClick={() => setOpen(true)} />
        )
      ) : isDesktop ? (
        <Popover
          open={open}
          onOpenChange={(next, details) => {
            // Yüzen pencere: sayfaya basmak ya da odağı sayfaya taşımak kapatmaz (kapatan: Esc, düğme, "Sohbeti kapat"). Esc belge
            // düzeyinde dinlenir (odak sayfadayken de kapanır) ama üstteki başka bir katmanın Esc'ini yutmaz.
            const ignored = details.reason === "outside-press" || details.reason === "focus-out" || (details.reason === "escape-key" && isEscapeForAnotherLayer(details.event));
            if (!next && ignored) {
              details.cancel();
              return;
            }
            setOpen(next);
          }}
        >
          <PopoverTrigger render={launcher} />
          <PopoverContent
            side="top"
            align="end"
            sideOffset={12}
            {...{ [CHAT_WINDOW_ATTRIBUTE]: "" }}
            initialFocus={textareaRef}
            finalFocus={!closedByNavigation}
            className="h-[min(640px,calc(100dvh-8rem))] w-[min(400px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 motion-reduce:data-closed:animate-none motion-reduce:data-open:animate-none"
          >
            {panel(<PopoverTitle className="truncate text-base font-medium">{label}</PopoverTitle>, "py-1")}
          </PopoverContent>
        </Popover>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={launcher} />
          <SheetContent
            side="bottom"
            showCloseButton={false}
            finalFocus={!closedByNavigation}
            className="gap-0 p-0 data-[side=bottom]:h-dvh motion-reduce:transition-none"
          >
            {/* Tam ekranda çentik/durum çubuğu payı: kapat düğmesi çentiğin altında kalmaz. */}
            {panel(<SheetTitle className="truncate text-base font-medium">{label}</SheetTitle>, "pt-[calc(0.25rem+env(safe-area-inset-top))] pb-1")}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
