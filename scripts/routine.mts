/**
 * Haftalık rutin (yerel): `npm run rutin [-- --dry-run] [--apify-max=<usd>] [--concurrency=N] [--workspace=<id|slug|ad> | --all]`.
 *
 * Orkestratör KODDUR (`src/lib/orchestrator/`): durumu DB'den okur, her adım için run/skip/needs_approval kararını verir ve adımları sırayla
 * koşturur: 0 önkontrol + bakım → 1 topla (Apify) → 2 analiz (agy) → 3 etiketle (Claude) → 4 haftalık plan (Claude) → 5 ölçüm kontrolü →
 * 6 brifing (Analist) → 7 rapor (`docs/rutin/<slug>/<tarih>.md` + `system` bildirimi). Plan: `docs/AJAN-PLAN.md` §3.
 *
 * ÇALIŞMA ALANI: `--workspace=<id|slug|ad>` (varsayılan `LOCAL_WORKSPACE_ID`). `--all` tüm çalışma alanlarını kayıt sırasıyla, SIRAYLA koşturur
 * (biri hata verirse diğerleri yine koşar; çıkış kodu en kötüsüdür). Apify yine yalnız `--apify-max` ile ve ÇALIŞMA ALANI BAŞINA o tutara kadar.
 *
 * ONAY KAPISI: Apify (para) YALNIZ `--apify-max=<usd>` verilirse koşar; bayraksız adım "onay bekliyor" olur ve toplama hiç çağrılmaz.
 * Ölçüm koşusu (`measure:now`, para) rutinin işi değildir. Diğer adımlar abonelik ($0).
 * `--dry-run`: hiçbir LLM/Apify/alt süreç/yazma yok; yalnız durumu ve adım kararlarını yazdırır.
 *
 * `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json); gizli değerler yazdırılmaz, eksik değişkenin yalnız ADI.
 * Çıkış kodu: 0 hepsi tamam ya da tasarım gereği atlandı/onay bekliyor · 4 kısmi (en az bir adım başarısız) · 1 önkontrol/yapılandırma.
 */
import { runBriefing } from "@/lib/intel/briefing-run";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { clusterOnly } from "@/lib/intel/plan-run";
import { parseRoutineArgs, type RoutineArgs } from "@/lib/orchestrator/args";
import { summaryLines } from "@/lib/orchestrator/report";
import { runRoutine } from "@/lib/orchestrator/routine";
import { briefingRunnerOf, clusterRunnerOf } from "@/lib/orchestrator/step-runners";
import { createRoutineDeps } from "@/lib/orchestrator/steps";
import { resolveAllWorkspaces, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

/** Tek çalışma alanı için rutin; çıkış kodunu döndürür. `workspaceRef` yoksa `LOCAL_WORKSPACE_ID`. */
async function runForWorkspace(workspaceRef: string | undefined, args: RoutineArgs): Promise<number> {
  const log = (line: string) => console.log(line);
  const ctx = await createIntelContext(new Date(), workspaceRef);
  log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  // Notlar (Analist) ve konu kümeleme: sonuç → adım çevirisi `lib/orchestrator/step-runners.ts`'te (panel işçisiyle aynı).
  const deps = createRoutineDeps(ctx, { args, log, runBriefing: briefingRunnerOf(runBriefing), clusterOnly: clusterRunnerOf(clusterOnly) });
  const report = await runRoutine(deps);

  console.log("");
  for (const line of summaryLines(report)) console.log(line);
  return report.exitCode;
}

/** En kötü çıkış kodu: 1 (yapılandırma/önkontrol) > 4 (kısmi) > diğerleri. */
function worstExitCode(codes: readonly number[]): number {
  if (codes.includes(1)) return 1;
  if (codes.includes(4)) return 4;
  return codes.find((code) => code !== 0) ?? 0;
}

async function main(): Promise<number> {
  const { workspace, all, rest } = splitWorkspaceArg(process.argv.slice(2), { allowAll: true });
  const args = parseRoutineArgs(rest);
  const required = args.apifyMaxUsd === undefined ? REQUIRED_ENV : [...REQUIRED_ENV, "APIFY_TOKEN"];
  const missing = missingEnv(required);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  if (!all) return runForWorkspace(workspace, args);

  const targets = await resolveAllWorkspaces();
  console.log(`--all: ${targets.length} çalışma alanı sırayla koşacak${args.apifyMaxUsd === undefined ? "" : ` (Apify tavanı çalışma alanı başına $${args.apifyMaxUsd})`}.`);
  const codes: number[] = [];
  for (const target of targets) {
    console.log("");
    console.log(`── ${target.name} (${target.slug ?? target.id.slice(0, 8)}) ──`);
    try {
      codes.push(await runForWorkspace(target.id, args));
    } catch (error) {
      console.error(`Rutin başarısız (${target.name}): ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
      codes.push(1);
    }
  }
  console.log("");
  console.log(`--all özeti: ${codes.filter((code) => code === 0).length}/${codes.length} çalışma alanı sorunsuz.`);
  return worstExitCode(codes);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Rutin başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
