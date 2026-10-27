/**
 * Panel planından stüdyo sipariş fişi yazar (yerel, $0): `npm run siparis:yaz -- --workspace=<id|slug|ad> --week=<Pazartesi YYYY-AA-GG> [--slot=S1] [--fikir=<id>] [--dir=<klasör>] [--dry-run] [--commit]`.
 *
 * Her plan öğesi için `<klasör>/<hesap>/<hafta>/<siparis_id>.md` yazar (`durum: taslak`, `onay: hayir`); var olan fişin üstüne YAZMAZ (atlar, söyler).
 * Klasör varsayılanı `KS_ORDERS_DIR`, yoksa `SIPARIS_KOK` (kopyada repo içi siparisler/; hiçbiri yoksa /opt/panel/siparisler). Sözleşme: studyo `docs/kurgu/SIPARIS.md` v2. Dış servis çağırmaz.
 * Çıkış: 0 tamam (yazılan 0 olabilir: hepsi var) · 1 hata (ortam, plan yok, stüdyoda tanımsız hesap).
 */
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { StudioAccountError } from "@/lib/studio-order/accounts";
import { orderRootOf } from "@/lib/studio-order/order-root";
import { runOrderWrite } from "@/lib/studio-order/run";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID"] as const;
const USAGE = "Kullanım: npm run siparis:yaz -- --workspace=<id|slug|ad> --week=YYYY-AA-GG [--slot=S1] [--fikir=<id>] [--dir=<klasör>] [--dry-run] [--commit]";

function parseArgs(argv: readonly string[]) {
  const out: { week?: string; slot?: string; ideaId?: string; dir?: string; dryRun: boolean; commit: boolean } = { dryRun: false, commit: false };
  for (const arg of argv) {
    const [flag, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (flag === "--week" && value) out.week = value;
    else if (flag === "--slot" && value) out.slot = value;
    else if (flag === "--fikir" && value) out.ideaId = value;
    else if (flag === "--dir" && value) out.dir = value;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--commit") out.commit = true;
    else throw new Error(`Bilinmeyen ya da eksik argüman: ${arg}\n${USAGE}`);
  }
  return out;
}

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseArgs(rest);
  if (args.week === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(args.week)) {
    console.error(`--week zorunlu (Pazartesi, YYYY-AA-GG).\n${USAGE}`);
    return 1;
  }
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const ordersDir = args.dir ?? process.env.KS_ORDERS_DIR?.trim() ?? orderRootOf();
  console.log(`Sipariş klasörü: ${ordersDir}${args.dryRun ? " (dry-run: dosya yazılmaz)" : ""}`);
  const result = await runOrderWrite({
    repo: ctx.repo,
    workspaceId: ctx.workspaceId,
    workspaceSlug: ctx.workspaceSlug,
    week: args.week,
    ...(args.slot ? { slot: args.slot } : {}),
    ...(args.ideaId ? { ideaId: args.ideaId } : {}),
    ordersDir,
    dryRun: args.dryRun,
    commit: args.commit,
    log: (line) => console.log(line),
  });
  if (!result.planFound) {
    console.error(`${args.week} haftası için plan yok.`);
    return 1;
  }
  const existing = result.skipped.filter((s) => s.reason === "exists").length;
  console.log(`\nSonuç: ${result.written.length} fiş yazıldı · ${existing} zaten vardı (atlandı) · ${result.skipped.length - existing} kurulamadı.`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof StudioAccountError ? error.message : `Sipariş fişi yazılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
