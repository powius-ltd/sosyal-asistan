/**
 * Bugün'ün "Yayını düzelt" bağlantısı (D2-01): Yayın ekranını o işin "Kopyala ve düzelt" formu açık olarak getirir. Parametre adı
 * burada tek yerde durur; Yayın sayfası (`duzelt`) aynı sabiti okur. Kimlik adrese kodlanır; sayfa kimliği yine sunucuda doğrular.
 */
import { ROUTES } from "@/lib/routes";

export const PUBLISH_FIX_PARAM = "duzelt";

export function publishFixHref(jobId: string): string {
  return `${ROUTES.publish}?${PUBLISH_FIX_PARAM}=${encodeURIComponent(jobId)}#is-${encodeURIComponent(jobId)}`;
}
