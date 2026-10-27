/**
 * Halka: `npm run halka -- durum --workspace=<id|slug|ad> [--json]` (salt okunur, $0) ve
 * `npm run halka -- ilerlet --workspace=<id|slug|ad> | --all [--dry-run]` (zincirin tek girişi: sıradaki $0 adımı açar, para adımında durup bildirir).
 *
 * `ilerlet` her çalışma alanında EN ÇOK BİR istek açar (`--all` kayıt sırasıyla dolaşır), isteği `panel` kuyruğuna yazar; işi ayrık işçi alır.
 * Para harcayan iş ASLA açılmaz (`lib/cycle/next.ts`). `--dry-run` hiçbir şey yazmaz (ne iş ne bildirim), kararı söyler.
 * Zamanlayıcı taslağı: `tools/systemd/halka-ilerlet.*` (kurulum ana oturumda). `CYCLE_AUTO=on` hem işçi kancasını hem bu komutun gerçek koşusunu açar (kapalıyken yalnız --dry-run).
 *
 * Durum:
 * Bir hesabın halkada nerede olduğunu ve sıradaki adımı söyler. Durum saklanmaz, veritabanı olgularından türetilir
 * (`lib/cycle/derive.ts`); `--json` çıktısı `lib/cycle/schema.ts` şemasından geçer (ekran ve yönetici ajan aynısını okur).
 * Hiçbir şey yazmaz, hiçbir dış servisi çağırmaz. Çıkış: 0 tamam · 1 hata/geçersiz girdi.
 */
import { advanceCycle } from "@/lib/cycle/advance";
import { deriveCycle } from "@/lib/cycle/derive";
import { readCycleFacts } from "@/lib/cycle/read";
import { cycleStateSchema } from "@/lib/cycle/schema";
import { formatCycleState } from "@/lib/cycle/format";
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import { ilerletRefusal } from "@/lib/cycle/enabled";
import { missingEnv } from "@/lib/intel/context";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolveAllWorkspaces, resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;
const USAGE = "Kullanım: npm run halka -- durum --workspace=<id|slug|ad> [--json] | ilerlet --workspace=<id|slug|ad> | --all [--dry-run]";

async function showState(workspaceRef: string | undefined, json: boolean): Promise<number> {
  const workspace = await resolveWorkspaceArg(workspaceRef);
  const now = new Date();
  const state = cycleStateSchema.parse(deriveCycle(await readCycleFacts(getAdminClient(), workspace.id, now, process.env), now));
  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return 0;
  }
  console.log(workspaceBanner(workspace));
  for (const line of formatCycleState(state)) console.log(line);
  return 0;
}

/** Her çalışma alanında en çok bir istek. Bir çalışma alanının hatası ötekileri durdurmaz; çıkış 1 = en az bir hata. */
async function advanceAll(workspaceRef: string | undefined, all: boolean, dryRun: boolean): Promise<number> {
  const targets = all ? await resolveAllWorkspaces() : [await resolveWorkspaceArg(workspaceRef)];
  const client = getAdminClient();
  let failures = 0;
  for (const workspace of targets) {
    console.log(workspaceBanner(workspace));
    try {
      const result = await advanceCycle({ client, workspaceId: workspace.id, queue: JOB_QUEUE_DEFAULT, now: new Date(), env: process.env, dryRun, log: (line) => console.log(`  ${line}`) });
      console.log(`  → ${result.action}`);
    } catch (error) {
      failures += 1;
      console.error(`  Halka ilerletilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    }
  }
  console.log(`${dryRun ? "Kuru koşu: hiçbir şey yazılmadı. " : ""}${targets.length} çalışma alanı işlendi${failures > 0 ? `, ${failures} hata` : ""}.`);
  return failures > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const { workspace: workspaceRef, all, rest } = splitWorkspaceArg(process.argv.slice(2), { allowAll: true });
  const [command, ...flags] = rest;
  const allowedFlags = command === "durum" ? ["--json"] : command === "ilerlet" ? ["--dry-run"] : [];
  const unknown = flags.filter((flag) => !allowedFlags.includes(flag));
  if ((command !== "durum" && command !== "ilerlet") || unknown.length > 0 || (command === "durum" && all)) {
    console.error(`${unknown.length > 0 ? `Bilinmeyen bayrak: ${unknown.join(" ")}. ` : ""}${USAGE}`);
    return 1;
  }
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const refusal = command === "ilerlet" ? ilerletRefusal(process.env, flags.includes("--dry-run")) : undefined;
  if (refusal !== undefined) {
    console.error(refusal);
    return 1;
  }
  return command === "durum" ? showState(workspaceRef, flags.includes("--json")) : advanceAll(workspaceRef, all, flags.includes("--dry-run"));
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Halka komutu başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
