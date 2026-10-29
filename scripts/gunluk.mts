/**
 * Günlük tur (müşteri kopyası): `npm run gunluk [--workspace=<id|slug|ad>] [--dry-run]`. İşletim sistemi zamanlayıcısı günde bir çalıştırır.
 *
 * Adımlar (`lib/setup/daily-plan.ts`):
 *  1. Ajan turu (`AGENT_AUTO=on`: `scripts/director.mts` ile aynı `runDirectorTurn`) YA DA zincir (`CYCLE_AUTO=on`: `scripts/cycle.mts` ile aynı
 *     `advanceCycle`). Para harcayan iş ancak onaylı aylık ajan tavanı içinde açılır (kapı kodda; burada değişmez).
 *  2. İşçi (yalnız gerçek koşuda): turun açtığı işleri koşturur (`scripts/job-worker.mts --drain`, alt süreç). Kopyada işçiyi ayrıca
 *     çalıştıran hizmet yoktur; bu adım olmazsa tur iş açar ama kimse koşturmaz.
 *  3. Ölçüm: yalnız Zernio anahtarı varsa (`measure:zernio` ile aynı `runZernioMeasure`; ücretsiz).
 *  4. Haftalık yedek: `SUPABASE_DB_URL` ile `pg_dump` → `yedek/yedek-YYYY-AA-GG.dump`, son 4 kalır. pg_dump yoksa Türkçe uyarı.
 *     Ücretsiz Supabase projesi 7 gün boşta kalınca uyur; günlük tur bunu da önler.
 *
 * `--dry-run`: hiçbir şey yazmaz (ne iş, ne bildirim, ne ölçüm satırı, ne yedek dosyası); ne yapılacağını söyler. (AGENT_AUTO açıksa ajan
 * kuru koşusu modeli çağırır — abonelik, tutar yok — ama yazmaz.)
 * Bir adımın hatası ötekileri durdurmaz. Çıkış: 0 tamam · 1 en az bir adım hata verdi · 2 yapılandırma eksik (Supabase anahtarı / hesap yok,
 * ya da gerçek koşuda ne AGENT_AUTO ne CYCLE_AUTO açık) (yedeğin atlanması UYARIDIR, çıkış kodunu değiştirmez).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import { runDirectorTurn } from "@/lib/agents/director/turn";
import { advanceCycle } from "@/lib/cycle/advance";
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import { missingEnv } from "@/lib/intel/context";
import { runZernioMeasure } from "@/lib/outcomes/zernio-job";
import { formatZernioResult } from "@/lib/outcomes/measure-zernio";
import { backupFileName, backupsToDelete, isBackupDue } from "@/lib/setup/backup";
import { planDaily, workerNodeArgs, type DailyStep } from "@/lib/setup/daily-plan";
import { execCommand } from "@/lib/setup/exec";
import { splitDbUrl } from "@/lib/setup/migrations";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";
import type { WorkspaceListItem } from "@/lib/workspace/registry-db";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;
const USAGE = "Kullanım: npm run gunluk [--workspace=<id|slug|ad>] [--dry-run]";
const BACKUP_DIR = "yedek";

type StepOutcome = "ok" | "failed" | "skipped";

async function runTurn(step: "agent" | "cycle", workspace: WorkspaceListItem, dryRun: boolean): Promise<StepOutcome> {
  const client = getAdminClient();
  const log = (line: string) => console.log(`  ${line}`);
  if (step === "agent") {
    const result = await runDirectorTurn({ client, workspaceId: workspace.id, queue: JOB_QUEUE_DEFAULT, now: new Date(), env: process.env, trigger: "cli", dryRun, log });
    console.log(`  → ajan turu: ${result.outcome}${result.decision === undefined ? "" : ` · eylem ${result.decision.action}`}`);
  } else {
    const result = await advanceCycle({ client, workspaceId: workspace.id, queue: JOB_QUEUE_DEFAULT, now: new Date(), env: process.env, dryRun, log });
    console.log(`  → zincir: ${result.action}`);
  }
  return "ok";
}

/** Turun açtığı işleri koşturur (`npm run worker -- --drain` ile aynı betik; çıkış 0 = alınacak iş kalmadı). Kopyada ayrı işçi hizmeti yoktur. */
async function runWorker(): Promise<StepOutcome> {
  const result = await execCommand(process.execPath, workerNodeArgs(process.cwd()), { timeoutMs: 3 * 60 * 60_000, inherit: true });
  if (result === undefined || result.exitCode !== 0) {
    console.error(`  İşçi hata ile bitti (çıkış ${result?.exitCode ?? "başlatılamadı"}): açılan işler yarım kalmış olabilir; yarın tekrar denenir.`);
    return "failed";
  }
  console.log("  İşçi bitti: açılan işler koşturuldu.");
  return "ok";
}

async function runMeasure(workspace: WorkspaceListItem, dryRun: boolean): Promise<StepOutcome> {
  // Müşteri "Otomatik" ekranında günlük ölçümü kapattıysa okunmaz (`workspaces.auto_measure`; okunamazsa varsayılan açık).
  const flag = await getAdminClient().from("workspaces").select("auto_measure").eq("id", workspace.id).maybeSingle();
  if (flag.data?.auto_measure === false) {
    console.log("  Otomatik günlük ölçüm kapalı (Otomatik ekranı): ölçüm atlandı.");
    return "skipped";
  }
  const run = await runZernioMeasure({ client: getAdminClient(), workspaceId: workspace.id, workspaceSlug: workspace.slug, now: new Date(), dryRun, env: process.env });
  if (run.outcome === "key_missing") {
    console.log("  Bu çalışma alanı için Zernio anahtarı yok (ZERNIO_API_KEY_<SLUG>): ölçüm atlandı.");
    return "skipped";
  }
  for (const line of formatZernioResult(run.result)) console.log(`  ${line}`);
  return "ok";
}

async function runBackup(dryRun: boolean): Promise<StepOutcome> {
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  const dir = path.join(process.cwd(), BACKUP_DIR);
  const existing = existsSync(dir) ? readdirSync(dir) : [];
  const now = new Date();
  if (!isBackupDue(existing, now)) {
    console.log("  Son yedek 7 günden yeni: bu hafta yedek alınmaz.");
    return "ok";
  }
  const file = path.join(dir, backupFileName(now));
  if (dbUrl === undefined || dbUrl === "") {
    console.warn("  UYARI: SUPABASE_DB_URL boş: yedek alınamadı. Supabase panelinde Project Settings > Database > Connection string (URI) adresini .env.local'a SUPABASE_DB_URL olarak yaz.");
    return "skipped";
  }
  const probe = await execCommand("pg_dump", ["--version"]);
  if (probe === undefined) {
    console.warn("  UYARI: pg_dump bulunamadı: yedek alınamadı. PostgreSQL istemci araçlarını kur (Windows: winget install PostgreSQL.PostgreSQL · macOS: brew install libpq · Linux: sudo apt install postgresql-client).");
    return "skipped";
  }
  let target: ReturnType<typeof splitDbUrl>;
  try {
    target = splitDbUrl(dbUrl);
  } catch {
    console.error("  SUPABASE_DB_URL geçerli bir adres değil (Supabase Connect sayfasındaki adres; parolada @ # / varsa %40 %23 %2F yaz): yedek alınamadı.");
    return "failed";
  }
  if (dryRun) {
    console.log(`  Kuru koşu: ${path.join(BACKUP_DIR, backupFileName(now))} yazılacaktı (${target.url}); eski yedekler: ${backupsToDelete([...existing, backupFileName(now)]).join(", ") || "yok"}.`);
    return "ok";
  }
  mkdirSync(dir, { recursive: true });
  const result = await execCommand("pg_dump", ["--format=custom", "--no-owner", `--file=${file}`, target.url], { timeoutMs: 600_000, env: target.env });
  if (result === undefined || result.exitCode !== 0) {
    rmSync(file, { force: true });
    console.error("  Yedek alınamadı (pg_dump hata verdi: adres / parola doğru mu, proje uyanık mı?).");
    return "failed";
  }
  for (const name of backupsToDelete(readdirSync(dir))) rmSync(path.join(dir, name), { force: true });
  console.log(`  Yedek alındı: ${path.join(BACKUP_DIR, backupFileName(now))}`);
  return "ok";
}

async function main(): Promise<number> {
  const { workspace: workspaceRef, rest } = splitWorkspaceArg(process.argv.slice(2));
  const unknown = rest.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    console.error(`Bilinmeyen bayrak: ${unknown.join(" ")}. ${USAGE}`);
    return 2;
  }
  const dryRun = rest.includes("--dry-run");
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}. Önce: npm run kurulum -- denetle`);
    return 2;
  }
  const plan = planDaily(process.env, { dryRun });
  const workspace = await resolveWorkspaceArg(workspaceRef);
  console.log(`${dryRun ? "Kuru koşu: hiçbir şey yazılmaz. " : ""}${workspaceBanner(workspace)}`);
  for (const note of plan.notes) console.warn(`  ${note}`);

  const outcomes: Partial<Record<DailyStep, StepOutcome>> = {};
  for (const step of plan.steps) {
    console.log(`[${step}]`);
    try {
      outcomes[step] = step === "agent" || step === "cycle" ? await runTurn(step, workspace, dryRun) : step === "worker" ? await runWorker() : step === "measure" ? await runMeasure(workspace, dryRun) : await runBackup(dryRun);
    } catch (error) {
      outcomes[step] = "failed";
      console.error(`  Adım başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    }
  }
  const noTurn = !plan.steps.includes("agent") && !plan.steps.includes("cycle");
  if (Object.values(outcomes).includes("failed")) return 1;
  if (noTurn && !dryRun) return 2;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Günlük tur başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
