import { ROUTES } from "@/lib/routes";

/** Koleksiyon ayrıntısı: `/koleksiyonlar?id=<koleksiyon kimliği>` (`ROUTES` ortak dosya; ayrıntı adresi burada tek yerde). */
export function collectionHref(collectionId: string): string {
  return `${ROUTES.collections}?id=${encodeURIComponent(collectionId)}`;
}
