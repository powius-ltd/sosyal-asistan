import type { PanelRepository } from "@/lib/data/repository";

/**
 * Bir sayfadaki içeriklerin koleksiyon üyeliği ("Kaydet" düğmelerinin ilk durumu): sayfa TEK okuma yapar
 * (`listCollectionMembership`), sonucu düğmelere `initialCollectionIds` olarak dağıtır; düğme kendi başına okuma yapmaz.
 * Okuma hatası sayfayı çökertmez: boş sonuç döner, düğmeler durumu bilmez ("Kaydet" görünür, menü açılınca yüklenir).
 * Anahtarı olan içerik durumu BİLİR (`[]` = hiçbir koleksiyonda değil); anahtarı olmayan bilmez.
 */
export async function loadCollectionMembership(
  repo: Pick<PanelRepository, "listCollectionMembership">,
  wsId: string,
  contentIds: readonly string[],
): Promise<Record<string, string[]>> {
  if (contentIds.length === 0) return {};
  try {
    return await repo.listCollectionMembership(wsId, [...contentIds]);
  } catch (error) {
    console.error("[collections] üyelik okunamadı", error);
    return {};
  }
}
