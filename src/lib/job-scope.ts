/**
 * İş kapsamı: panel işçisi bir işi koştururken o işin kimliğini eşzamansız çağrı zinciri boyunca taşır (`AsyncLocalStorage`). Koşu açan
 * TEK yer (`lib/apify/budget.ts` `reserveBudget`) buradan okur ve `collection_runs.panel_job_id`'yi yazar: iş başına "alınan kredi ↔ gerçek /
 * gölge USD" raporu bu bağdan çıkar. Kimlik hiçbir işlev imzasına eklenmez (toplama, inceleme, yazı çağrıları değişmez).
 *
 * Kapsam dışında (betik koşusu, panel isteği) kimlik yoktur: koşu satırında sütun NULL kalır. Kapsam iç içe açılırsa içteki geçerlidir.
 */
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<{ panelJobId: string }>();

/** `run`'ı (ve başlattığı bütün eşzamansız işleri) bu işin kapsamında koşturur. */
export function runInJobScope<T>(panelJobId: string, run: () => T): T {
  return scope.run({ panelJobId }, run);
}

/** Şu an koşan panel işinin kimliği; iş kapsamı dışında undefined. */
export function currentPanelJobId(): string | undefined {
  return scope.getStore()?.panelJobId;
}
