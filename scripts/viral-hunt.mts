/**
 * Viral av: konuyla patlamış video havuzu (IG + TikTok): `npm run viral:hunt -- --workspace=<id|slug|ad> [--konu=…] [--limit=50] [--dry-run] [--apify-max=<usd>]`.
 *
 * `--apify-max` YOKSA ya da `--dry-run` varsa hiçbir ücretli çağrı açılmaz: yalnız sorgular, tahmini sonuç sayısı ve tahmini tutar yazılır
 * (aktör fiyatı okunur, koşu başlatılmaz). Gerçek koşu haftalık tavanla sınırlıdır (1,5 USD) ve mevcut bütçe defterinden geçer. PARA HARCAR (yalnız
 * `--apify-max` ile): önce `--dry-run`. `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json `viral:hunt`).
 */
import { formatViralSummary } from "@/lib/viral/format-summary";
import { parseViralArgs } from "@/lib/viral/args";
import { runViralHunt } from "@/lib/viral/run";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["APIFY_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseViralArgs(rest);
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }

  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const summary = await runViralHunt({
    workspaceId: workspace.id,
    now: new Date(),
    manualTopics: args.topics,
    maxUsd: args.maxUsd,
    dryRun: args.dryRun,
    perQueryLimit: args.limit,
    settleWaitMs: 90_000,
    log: (line) => console.log(line),
  });

  console.log("");
  for (const line of formatViralSummary(summary)) console.log(line);

  if (summary.outcome === "blocked" || summary.outcome === "no_topics") return 2;
  if (summary.outcome === "dry_run" && !summary.plan.withinCap) return 2;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Viral av başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
