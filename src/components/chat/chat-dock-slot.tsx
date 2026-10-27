import { ChatDock } from "@/components/chat/chat-dock";
import { loadChatSlotProps } from "@/components/chat/chat-slot-props";
import { isCopyEdition } from "@/lib/edition";

/**
 * Sohbetin sunucu yuvası (panel düzeninde, `Suspense` içinde: yavaş okuma sayfayı geciktirmez): hazırlık `loadChatSlotProps`'ta
 * (kullanılabilirlik + hazır sorular + Maskot adı + bekleyen karar sayısı), istemci kabuğu (`ChatDock`: yüzen düğme + pencere) yalnız
 * çizer ve `fetch(API_ROUTES.chat)` ile konuşur. Ortam uygun değilse HİÇ çizilmez. `key={wsId}`: çalışma alanı değişince konuşma sıfırlanır.
 */
export async function ChatDockSlot() {
  const props = await loadChatSlotProps();
  if (props === null) return null;
  return <ChatDock key={props.wsId} assistantName={props.assistantName} starters={props.starters} attention={props.attention} plain={isCopyEdition()} />;
}
