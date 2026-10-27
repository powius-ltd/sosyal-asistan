import type { PanelRepository } from "@/lib/data/repository";

/**
 * Üst şerit zilinin okunmamış sayısı. Rozet süs bilgisidir: okuma hata verirse PANEL ÇÖKMEZ ve rozet "0" gibi
 * gösterilmez, tümüyle gizlenir (`undefined` = bilinmiyor; 0 ölçülmüş "okunmamış yok" demektir). Hata günlüğe yazılır.
 */
export async function readUnreadNotifications(
  repo: Pick<PanelRepository, "countUnreadNotifications">,
  wsId: string,
): Promise<number | undefined> {
  try {
    return await repo.countUnreadNotifications(wsId);
  } catch (error) {
    console.error("[shell] okunmamış bildirim sayısı okunamadı", error);
    return undefined;
  }
}

/** Rozette gösterilen en büyük sayı; üstü "99+" görünür. */
export const BADGE_MAX = 99;
