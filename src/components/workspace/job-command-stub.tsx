/**
 * `JobCommand`'ın TEST yer tutucusu (yalnız test dosyaları bağlar; uygulama kodu içe aktarmaz):
 *
 *   vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));
 *
 * Gerçek sarmalayıcı async sunucu bileşeni (`JobAction`) taşır; jsdom'da eşzamanlı çizilemez (ağacı askıya alır). Yer tutucu düğmeyi
 * metniyle çizer ve isteği `data-*` ile açar: bileşen testi "burada şu iş isteniyor"u sınar. Yedeğe verilen parçalar (önündeki metin, not)
 * GİZLİ bir yuvada durur (komut metni üretilmez). Kapı (yönetici modu, işler açık / kapalı) ve yedek komut metni `job-command.test.tsx`'te
 * gerçek sarmalayıcıyla sınanır.
 */
import { JOB_PREVIEW_LABEL } from "@/components/jobs/job-format";
import type { JobCommandProps } from "@/components/workspace/job-command";
import { JOB_KIND_PLAIN } from "@/lib/plain-language";

export function JobCommand({ request, label, variant, workspace, lead, flags, note, command = true }: JobCommandProps) {
  const dryRun = "dryRun" in request && request.dryRun === true;
  return (
    <>
      <button
        type="button"
        data-slot="job-command"
        data-kind={request.kind}
        data-dry-run={dryRun}
        data-week={"week" in request ? request.week : undefined}
        data-variant={variant}
        data-workspace={workspace?.slug ?? workspace?.id}
        data-flags={flags}
      >
        {label ?? (dryRun ? JOB_PREVIEW_LABEL : JOB_KIND_PLAIN[request.kind].label)}
      </button>
      {command ? (
        <span hidden data-slot="job-command-fallback">
          {lead}
          {note}
        </span>
      ) : null}
    </>
  );
}
