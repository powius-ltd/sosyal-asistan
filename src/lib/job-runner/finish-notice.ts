/**
 * İş BİTİNCE kalıcı bildirim (zil): kullanıcı ilk incelemenin 20–25 dakikası sürerken sayfayı kapatabilir; bitişi işçi çalışma alanına
 * yazar (`notifications`, tür `onboarding`). Aynı iş için bir kez: `dedupe_key = onboarding:<iş kimliği>` (benzersiz indeks; ikinci yazım
 * "zaten bildirildi"dir, hata değil). Yalnız başlangıç işi ve yalnız bildirim gerektiren bitiş (tamam / kısmi / durdu); kullanıcının
 * kendi durdurduğu işte bildirim yok (`onboardingFinishKindOf`).
 *
 * Bildirim yazımı işi DÜŞÜRMEZ: iş satırı zaten kapanmıştır; bu kanca FIRLATMAZ (hata günlüğe yazılır, ekran yine kapanan işi gösterir).
 * Metin tek yerde (`plain-language-onboarding.ts`): aynı cümle açık sekmedeki baloncukta ve sekme başlığında da söylenir.
 */
import "server-only";

import { onboardingFinishDedupeKey, onboardingFinishInputOf } from "@/lib/domain/onboarding-finish";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobFinal } from "@/lib/job-runner/job-session";
import { insertNotification, type NotificationDraft } from "@/lib/outcomes/notify";
import { onboardingFinishNotice } from "@/lib/plain-language-onboarding";
import type { AdminClient } from "@/lib/supabase/admin";

/** İş kapanışından SONRA çağrılır (satır yazıldıktan, çit kaybedilmediyse). */
export type JobFinishedHook = (job: PanelJob, final: JobFinal) => Promise<void>;

/** Bitişin bildirim taslağı; bildirim gerekmiyorsa undefined (başlangıç işi değil, kullanıcının durdurduğu iş). */
export function onboardingFinishDraft(job: PanelJob, final: JobFinal): NotificationDraft | undefined {
  const notice = onboardingFinishNotice(onboardingFinishInputOf(job, final));
  if (notice === undefined) return undefined;
  return { kind: "onboarding", title: notice.title, body: notice.body, dedupeKey: onboardingFinishDedupeKey(job.id) };
}

/** Gerçek kanca: bitişi çalışma alanının bildirimlerine yazar. FIRLATMAZ. */
export function createFinishNotifier(client: AdminClient, log: (line: string) => void = () => undefined): JobFinishedHook {
  return async (job, final) => {
    try {
      const draft = onboardingFinishDraft(job, final);
      if (draft === undefined) return;
      const created = await insertNotification(client, job.workspaceId, draft);
      log(created ? `Bitiş bildirimi yazıldı: ${draft.title}` : "Bitiş bildirimi zaten yazılmıştı.");
    } catch (error) {
      log(`Uyarı: bitiş bildirimi yazılamadı (${error instanceof Error ? error.message : "bilinmeyen hata"}); iş kapandı, ekran güncel.`);
    }
  };
}
