/**
 * Reels ölçümü (Zernio, ücretsiz): `npm run measure:zernio -- [--dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Kendi hesabın Reels sayıları Zernio'dan (YALNIZ GET) okunur; `content_items` + `metric_snapshots` (`source = 'zernio'`) yazılır.
 * Apify ve ücretli servis yok. Anahtar: `ZERNIO_API_KEY_<SLUG>` (örn. `ZERNIO_API_KEY_ORNEKSTUDYOAPP`); genel `ZERNIO_API_KEY` YALNIZ `ornekstudyoapp` çalışma
 * alanı için geçerlidir (başka hesaba düşmez; bkz. `lib/zernio/api-key.ts`). Değer hiçbir yere yazdırılmaz. `--dry-run` hiçbir satır yazmaz, yazılacak sayıları basar.
 *
 * Çıkış: 0 tamam · 1 hata · 2 Zernio'da (ya da çalışma alanında) bağlı Instagram hesabı yok.
 */
import { formatZernioResult } from "@/lib/outcomes/measure-zernio";
import { runZernioMeasure } from "@/lib/outcomes/zernio-job";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;
const USAGE = "Kullanım: npm run measure:zernio -- [--dry-run] [--workspace=<id|slug|ad>]";

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const unknown = rest.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    console.error(`Bilinmeyen bayrak: ${unknown.join(" ")}. ${USAGE}`);
    return 1;
  }
  const dryRun = rest.includes("--dry-run");

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }

  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const run = await runZernioMeasure({ client: getAdminClient(), workspaceId: workspace.id, workspaceSlug: workspace.slug, now: new Date(), dryRun, env: process.env });
  if (run.outcome === "key_missing") {
    console.error("Zernio anahtarı yok (.env.local): ZERNIO_API_KEY_<SLUG> (genel ZERNIO_API_KEY yalnız ornekstudyoapp)");
    return 1;
  }
  console.log(`Zernio anahtarı: ${run.keyEnvName}`);
  const result = run.result;
  console.log("");
  for (const line of formatZernioResult(result)) console.log(line);
  return result.outcome === "no_account" ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Ölçüm başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
