import type { PanelRepository } from "@/lib/data/repository";
import type { AdUsage } from "@/lib/domain/ads";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/**
 * Sayfadaki kendi içeriklerin reklam kullanımı (TEK toplu okuma). Müşteri görünümünde ya da reklam hesabı yokken `undefined`: ekran öncekiyle
 * aynı çizilir (rozet, süzgeç yok). İçerik yoksa okuma yapılmaz.
 */
export async function loadAdUsage(repo: PanelRepository, wsId: string, ownContentIds: readonly string[], now: Date): Promise<AdUsage[] | undefined> {
  if (!isOperatorMode()) return undefined;
  const accounts = await repo.listAdAccounts(wsId);
  if (accounts.length === 0) return undefined;
  return ownContentIds.length === 0 ? [] : repo.listAdUsage(wsId, ownContentIds, now);
}
