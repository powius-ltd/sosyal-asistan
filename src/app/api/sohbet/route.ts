import { handleChatRequest } from "@/lib/agents/chat/handle";
import { productionChatDeps } from "@/lib/agents/chat/production";

// Sohbet kutusu (salt okunur): panel verisinden kanıtlı yanıt, NDJSON aşama olaylarıyla. Çalışma alanı gövdeden değil
// `getPanelContext()`'ten çözülür; akış, doğrulama ve güvenlik `lib/agents/chat/handle.ts`'tedir. `POST` Next 16'da önbelleklenmez.
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleChatRequest(request, productionChatDeps());
}
