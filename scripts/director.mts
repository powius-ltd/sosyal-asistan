/**
 * Yönetici ajan: `npm run ajan -- tur --workspace=<id|slug|ad> [--dry-run] [--emir="…"]`. Bir ajan turu çalıştırır (model önerir, kapı denetler,
 * karar uygulanır). `--dry-run` model çağırır ama hiçbir şey yazmaz (ne iş, ne bildirim, ne koşu kaydı). Gerçek koşuda ücretli iş yalnız
 * onaylı aylık ajan tavanı içinde açılır (`workspace set --agent-cap=…`). `AGENT_AUTO` yalnız işçi kancasını açar; bu komut anahtara bakmaz.
 * Çıkış: 0 tamam · 1 hata/geçersiz girdi.
 */
import { runDirectorTurn } from "@/lib/agents/director/turn";
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import { missingEnv } from "@/lib/intel/context";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;
const USAGE = 'Kullanım: npm run ajan -- tur --workspace=<id|slug|ad> [--dry-run] [--emir="…"]';

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const [command, ...flags] = rest;
  const dryRun = flags.includes("--dry-run");
  const emirFlag = flags.find((flag) => flag.startsWith("--emir="));
  const unknown = flags.filter((flag) => flag !== "--dry-run" && !flag.startsWith("--emir="));
  if (command !== "tur" || unknown.length > 0) {
    console.error(`${unknown.length > 0 ? `Bilinmeyen bayrak: ${unknown.join(" ")}. ` : ""}${USAGE}`);
    return 1;
  }
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(workspaceBanner(workspace));
  const instruction = emirFlag?.slice("--emir=".length).trim();
  const result = await runDirectorTurn({
    client: getAdminClient(),
    workspaceId: workspace.id,
    queue: JOB_QUEUE_DEFAULT,
    now: new Date(),
    env: process.env,
    trigger: "cli",
    ...(instruction ? { instruction } : {}),
    dryRun,
    log: (line) => console.log(`  ${line}`),
  });
  const decision = result.decision;
  console.log(`${dryRun ? "Kuru koşu: hiçbir şey yazılmadı. " : ""}Sonuç: ${result.outcome}${decision === undefined ? "" : ` · eylem ${decision.action}${decision.kind === undefined ? "" : ` ${decision.kind}`} · karar ${decision.source === "llm" ? "model" : `yedek (${decision.fallbackReason ?? ""})`}`}`);
  if (decision?.message !== undefined) console.log(`  Mesaj: ${decision.message}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Ajan komutu başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
