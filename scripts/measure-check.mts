/**
 * Ölçüm kontrolü (yerel, ÜCRETSİZ — Apify yok): `npm run measure:check [-- --workspace=<id|slug|ad>]`.
 *
 * Ölçümü gelen (penceresi açık, o pencerede ölçümü olmayan) kendi Reels'leri bulur ve `measurement_due` bildirimi yazar
 * (`notifications.dedupe_key` ile yinelenmez: aynı Reels + gün için bir kez). Aynı kontrol `collect:now` ve `measure:now`
 * sonunda da çalışır. Cron sonra: bu betiği zamanlamak yeter. `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json);
 * gizli değer yazdırılmaz. Çıkış: 0 (due 0 dahil) · 1 hata.
 */
import { formatDate, formatNumber } from "@/lib/format";
import { CHECKPOINT_LABEL } from "@/lib/domain/outcomes";
import { checkMeasurementDue } from "@/lib/outcomes/notify";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";
import { workspaceCommand } from "@/lib/workspace/command";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  if (rest.length > 0) throw new Error(`Bilinmeyen argüman: ${rest[0]} (geçerli: --workspace=<id|slug|ad>).`);
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const { due, created } = await checkMeasurementDue(getAdminClient(), workspace.id, new Date());

  console.log(`Ölçümü gelen Reels: ${formatNumber(due.length)} (${formatNumber(created)} yeni bildirim yazıldı; Apify çağrılmadı, harcama $0)`);
  for (const item of due) {
    console.log(`  @${item.ownerHandle} ${item.shortcode ?? item.contentItemId}: ${CHECKPOINT_LABEL[item.day]} ölçümü, pencere ${formatDate(item.windowEnd, "UTC") ?? item.windowEnd} tarihine kadar`);
  }
  if (due.length > 0) console.log(`Ölçmek için: ${workspaceCommand("measure:now", workspace)} --dry-run`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Ölçüm kontrolü başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
