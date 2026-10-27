import { linkIdeaToReelAction, resolveIdeaLinkAction } from "@/app/actions/idea-links";
import { requestJobAction } from "@/app/actions/jobs";
import { approvePublishJob } from "@/app/actions/publish";
import type { ActionResult } from "@/lib/actions/result";
import type { DecisionAction } from "@/lib/today";

/** Karar kartının sunucuya giden düğmesi (bağlantı olmayan). */
export type DecisionServerAction = Extract<DecisionAction, { kind: "action" }>;

/** Kart kullanıcıdan adres istiyor mu (`input: "url"`). */
export function needsUrlInput(action: DecisionAction | undefined): boolean {
  return action?.kind === "action" && "input" in action && action.input === "url";
}

/**
 * Action anahtarı → gerçek server action (TEK yer). Yük sunucuda yine zod ile doğrulanır; `url` yalnız adres isteyen kartta
 * (`input: "url"`) yüke eklenir. Yeni kart türü = `lib/today/types.ts`'teki birleşim + buradaki dal (derleyici eksik dalı yakalar).
 */
export function runDecisionAction(action: DecisionServerAction, url: string): Promise<ActionResult<object>> {
  switch (action.action) {
    case "approvePublishJob":
      return approvePublishJob(action.payload.jobId);
    case "resolveIdeaLinkAction":
      return resolveIdeaLinkAction(action.payload);
    case "linkIdeaToReelAction":
      return linkIdeaToReelAction({ ...action.payload, url });
    case "requestJobAction":
      // İş sıraya yazılır; ilerlemesini panel düzenindeki durum şeridi gösterir (action tüm düzeni yeniler).
      return requestJobAction(action.payload);
  }
}

/** Başarıdan sonra kartta kısa süre görünen cümle: iş başlatan düğme "kaydetmez", sıraya yazar. */
export function decisionDoneText(action: DecisionServerAction): string {
  return action.action === "requestJobAction" ? "Tamam, sıraya yazdım." : "Tamam, kaydettim.";
}
