/**
 * Tek seferlik gerçek veri toplama (yerel): `npm run collect:now -- [--limit=10] [--dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Seçilen çalışma alanı (`--workspace=<id|slug|ad>`; varsayılan `LOCAL_WORKSPACE_ID`) için kendi hesap + `tracked` rakipler: profil koşusu
 * + reel koşuları → DB → skor. Toplam tahmin $0,20'yi aşarsa hiçbir koşu başlamaz. PARA HARCAR (--dry-run harcamaz): önce --dry-run.
 *
 * `server-only` paketi `react-server` koşulunda boş modüle çözülür; `.env.local` Node'un `--env-file`'ıyla yüklenir
 * (bkz. package.json `collect:now`). Gizli değerler hiçbir yere yazdırılmaz; eksik ortam değişkeninin yalnız ADI yazılır.
 */
import { collectOnce } from "@/lib/collection/collect-once";
import { formatCollectSummary } from "@/lib/collection/format-summary";
import { parseCollectArgs } from "@/lib/collection/parse-args";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["APIFY_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseCollectArgs(rest);
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }

  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const summary = await collectOnce({
    workspaceId: workspace.id,
    limit: args.limit,
    maxUsd: args.maxUsd,
    dryRun: args.dryRun,
    now: new Date(),
    log: (line) => console.log(line),
  });

  console.log("");
  for (const line of formatCollectSummary(summary)) console.log(line);

  if (summary.outcome === "blocked" || summary.outcome === "no_targets") return 2;
  const failed = summary.targets.some((target) => target.content?.error !== undefined || target.profile?.state === "error");
  return failed || (summary.scoring?.failures.length ?? 0) > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Toplama başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
