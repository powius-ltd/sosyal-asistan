/**
 * Tek seferlik operatör betiği: elde olan TikTok rakip videolarını içe alır (Apify çağrısı YOK, para harcamaz).
 * `npm run import:local -- --workspace=<slug> --items=<apify-json> --videos=<klasör> --ids=<a,b> [--dry-run]`
 * Rakip (tracked) → profil + içerik ingest → skor → `agy` video analizi. Video klasörü yalnız okunur (kopya geçici klasörde).
 */
import { analyzeImported } from "@/lib/collection/local-import/analyze";
import { ensureTrackedRival, ingestRivalRows, type ImportedRival } from "@/lib/collection/local-import/ingest";
import { parseImportArgs, selectImportRows } from "@/lib/collection/local-import/plan";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseImportArgs(rest);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const rows = selectImportRows(args);
  for (const r of rows) console.log(`  - @${r.handle} ${r.videoId} · ${r.file.split("/").pop()}`);
  if (args.dryRun) {
    console.log("Dry-run: yazma ve analiz yapılmadı.");
    return 0;
  }

  const rivals: ImportedRival[] = [];
  for (const handle of [...new Set(rows.map((r) => r.handle))]) {
    const rival = await ensureTrackedRival(ctx.client, ctx.workspaceId, handle);
    rivals.push({ handle, owner: { kind: "competitor", id: rival.id }, created: rival.created, rows: rows.filter((r) => r.handle === handle) });
  }
  const ingest = await ingestRivalRows(ctx.client, ctx.workspaceId, rivals, ctx.now);
  console.log(`Rakip: ${ingest.rivalsAdded} eklendi, ${ingest.rivalsExisting} vardı · içerik ${ingest.contentItems} · ölçüm ${ingest.snapshots} · skorlanan ${ingest.scored}`);

  const analysis = await analyzeImported(ctx.client, ctx.workspaceId, rows, (line) => console.log(line));
  console.log(`Analiz: ok ${analysis.ok} · insufficient_data ${analysis.insufficient} · failed ${analysis.failed}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`İçe alma başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
