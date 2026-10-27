/**
 * Analist brifingi (yerel): `npm run brief:now [-- --dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Genel bakıştaki "Bugün bilmen gerekenler" kartının içeriğini üretir: olgu paketini kurar (yalnız depo okuması), Claude CLI ile 1–5 maddelik
 * brifingi yazdırır (sayılar belirteçle yazılır, kod yerleştirir; ref'ler/eylemler paketten doğrulanır), `agent_briefings`'e yazar. 1 abonelik
 * çağrısı ($0, billing subscription → `collection_runs`). Başarısızlıkta hiçbir şey yazılmaz: ekranda önceki brifing kalır.
 * `--dry-run`: olgu paketini ve boyutunu yazdırır (LLM yok, DB'ye yazma yok). Sözleşme: `src/lib/domain/briefing.ts`, plan: `docs/AJAN-PLAN.md` §2.
 *
 * `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json); gizli değerler hiçbir yere yazdırılmaz, eksik değişkenin yalnız ADI.
 * Çıkış kodu: 0 tamam · 1 hata (ortam/veri/LLM/doğrulama/yazım).
 */
import { collectFacts } from "@/lib/agents/analyst/facts";
import { FACTS_MAX_BYTES } from "@/lib/agents/analyst/facts-types";
import { BRIEFING_ITEM_KIND_LABEL } from "@/lib/domain/briefing";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";
import { runBriefing } from "@/lib/intel/briefing-run";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

function parseArgs(argv: readonly string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else throw new Error(`Bilinmeyen argüman: ${arg} (geçerli: --dry-run).`);
  }
  return { dryRun };
}

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseArgs(rest);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));

  if (args.dryRun) {
    const facts = await collectFacts(ctx);
    console.log(JSON.stringify(facts.pack, null, 2));
    console.log("");
    console.log(`Dry-run: olgu paketi ${facts.bytes} bayt (sınır ${FACTS_MAX_BYTES}) · ${facts.refs.size} olgu · ${facts.actions.size} eylem · ölçülemeyen ${facts.pack.unmeasured.length}`);
    console.log(`  kırpılan: ${Object.keys(facts.omitted).length === 0 ? "yok" : JSON.stringify(facts.omitted)} · dayanak: ${JSON.stringify(facts.basis)}`);
    console.log("  LLM çağrısı ve DB yazımı yapılmadı.");
    return 0;
  }

  const result = await runBriefing(ctx, { log: (line) => console.log(line) });
  console.log("");
  if (!result.ok) {
    console.error(`Brifing üretilemedi (${result.code}${result.persistent ? ", kalıcı" : ""}): ${result.message.slice(0, 300)}`);
    console.error("Hiçbir brifing yazılmadı; önceki brifing kalır.");
    return 1;
  }
  result.items.forEach((item, index) => {
    console.log(`${index + 1}. [${BRIEFING_ITEM_KIND_LABEL[item.kind]} · ${item.confidence}] ${item.headline}`);
    console.log(`   ${item.body}`);
    console.log(`   kanıt: ${item.evidence.join(", ")}${item.action ? ` · eylem: ${item.action.label}${item.action.spendsMoney ? " (para harcar)" : ""}` : ""}`);
  });
  console.log("");
  console.log(`Sonuç: ${result.items.length} madde · ${result.seconds} sn · model ${result.model ?? "bilinmiyor"} · ${result.attempts} deneme · paket ${result.factsBytes} bayt`);
  console.log(`  brifing ${result.briefingId} · koşu ${result.runId}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Brifing başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
