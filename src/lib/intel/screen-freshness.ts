/**
 * Konu eleği tazeliği (saf): elek istemi değişince (`screen-topics` `PROMPT_VERSION`) eski sürümle yazılmış kararlar güvenilmez
 * (v1 fazla sıkıydı: niş içi videoları niş dışı saydı). Güncel sürümden farklı kayıt "elenmedi" sayılır ve yeniden elenir;
 * yeni eleme `content_topic_screens` satırının üzerine yazar. Sürümü bilinmeyen kayıt (`promptVersion` yok) da bayattır.
 */
import type { ScreenInfo } from "@/lib/intel/content-load";

export const isFreshScreen = (screen: ScreenInfo, currentVersion: string): boolean => screen.promptVersion === currentVersion;

/** Yalnız güncel sürümle yazılmış kararları tutar; `stale` = atılan kayıt sayısı (günlük için). */
export function dropStaleScreens(screens: ReadonlyMap<string, ScreenInfo>, currentVersion: string): { screens: Map<string, ScreenInfo>; stale: number } {
  const fresh = new Map([...screens].filter(([, screen]) => isFreshScreen(screen, currentVersion)));
  return { screens: fresh, stale: screens.size - fresh.size };
}
