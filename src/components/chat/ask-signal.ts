/**
 * Yüzen sohbet düğmesinin "sıra sende" noktası için karar sayısı: Bugün'ün kuyruğuyla AYNI sayı (`loadTodayData`; sayfa ile düzen aynı
 * istekte tek okuma yapar). Süs bilgidir: okunamazsa `undefined` döner (nokta çıkmaz), panel çökmez. "0" ile "okunamadı" ayrı kalır.
 */
import "server-only";

import { loadTodayData } from "@/components/today/today-data";

export async function loadAskSignal(): Promise<number | undefined> {
  try {
    return (await loadTodayData()).today.queue.length;
  } catch (error) {
    console.error("[sohbet] karar sayısı okunamadı", error);
    return undefined;
  }
}
