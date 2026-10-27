/**
 * Reels ölçümü (yerel): `npm run measure:now -- [--dry-run] [--max-usd=0.05] [--workspace=<id|slug|ad>]`.
 *
 * Yalnız KENDİ hesap, son 10 gün, ≤ 10 Reels (1 profil + N Reel koşusu; koşular `purpose = measurement`). Pencerede Reels yoksa
 * Apify'a hiç gidilmez ("ölçülecek Reels yok, harcama $0"). Tahmin her zaman yazılır; PARA HARCAMASI yalnız (a) açık `--max-usd`
 * (tek seferlik onay) ya da (b) onaylı aylık ölçüm tavanı (`workspaces.measure_monthly_cap_usd`) ve kalan hak ≥ tahmin ise olur;
 * tavan onaysızsa (NULL) harcama reddedilir. Önce --dry-run.
 *
 * `server-only` `react-server` koşulunda boş modüle çözülür; `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json).
 * Gizli değerler hiçbir yere yazdırılmaz; eksik ortam değişkeninin yalnız ADI yazılır. Çıkış: 0 tamam/ölçülecek yok · 2 reddedildi · 1 hata.
 */
import { measureOnce, formatMeasureResult } from "@/lib/outcomes/measure-run";
import { parseMeasureArgs } from "@/lib/outcomes/measure-args";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["APIFY_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseMeasureArgs(rest);
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }

  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const result = await measureOnce({
    workspaceId: workspace.id,
    now: new Date(),
    dryRun: args.dryRun,
    maxUsd: args.maxUsd,
    log: (line) => console.log(line),
  });

  console.log("");
  for (const line of formatMeasureResult(result)) console.log(line);

  if (result.outcome === "refused" || result.outcome === "blocked") return 2;
  const failed = result.collect?.targets.some((target) => target.content?.error !== undefined || target.profile?.state === "error") ?? false;
  return failed || (result.collect?.scoring?.failures.length ?? 0) > 0 ? 1 : 0;
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
