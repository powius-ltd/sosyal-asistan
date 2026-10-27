import { loadAskSignal } from "@/components/chat/ask-signal";
import { chatAvailability } from "@/lib/agents/chat/availability";
import { loadStarterSignals } from "@/lib/agents/chat/starter-signals";
import { chatStarters } from "@/lib/agents/chat/starters";
import { maskotName } from "@/lib/agents/persona";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/domain/account-type";

export interface ChatSlotProps {
  /** Çalışma alanı: istemci yuvasının `key`'i (değişince konuşma sıfırlanır; başka hesabın yanıtı görünmesin). */
  wsId: string;
  /** Maskot adı (`maskotName()`; metne gömülmez). */
  assistantName: string;
  /** Hazır sorular (hesap türü profilinden, rakip var mı bilgisinden ve hangi sorunun cevabı olduğundan; tür adına bakılmaz). */
  starters: string[];
  /** Karar kuyruğundaki kart sayısı (düğmedeki sarı nokta; Bugün'le aynı sayı). `undefined` = okunamadı. */
  attention: number | undefined;
}

/**
 * Sohbet yuvasının (yüzen düğme) sunucu hazırlığı: kullanılabilirlik + hazır sorular + Maskot adı + bekleyen karar sayısı. Ortam uygun
 * değilse (barındırılan ortam, Claude CLI yok, `anthropic_api` saplaması) `null`: yuva HİÇ çizilmez ve Bugün okunmaz. Hazır sorular
 * okunamazsa (süs bilgi) soru önerilmez; yalnız cevabı olan sorular önerilir (`starters.ts`).
 */
export async function loadChatSlotProps(): Promise<ChatSlotProps | null> {
  if (!chatAvailability().available) return null;
  const { repo, wsId, now } = await getPanelContext();
  const [workspace, rivals, attention] = await Promise.all([
    repo.getWorkspace(wsId).catch(() => null),
    repo.listCompetitors(wsId, { status: "tracked" }).catch(() => undefined),
    loadAskSignal(),
  ]);
  const accountType = workspace?.accountType ?? DEFAULT_ACCOUNT_TYPE;
  const signals = await loadStarterSignals(repo, wsId, accountType, now);
  const starters = chatStarters({ accountType, hasRivals: (rivals?.length ?? 0) > 0, signals });
  return { wsId, assistantName: maskotName(), starters, attention };
}
