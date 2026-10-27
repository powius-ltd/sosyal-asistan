/**
 * Kanıtlanmış fikir kartları (yerel, salt okuma): `npm run proven:ideas -- [--workspace=<id|slug|ad>] [--json] [--days=90]`.
 *
 * Konu kümesi × hook türü hücrelerinde ≥ 2 farklı hesapta tutmuş (`proven`) ya da tek hesapta ≥ 5x tutmuş (`single`) fikirleri listeler;
 * her kartta kanıt videoları ve anatomi özeti (açılış, ilk bölüm, tempo, çağrı konumu, süre) bulunur. DB'ye YAZMAZ, LLM / Apify çağırmaz ($0).
 * Çıkış kodu: 0 tamam · 1 hata. `.env.local` Node'un `--env-file`'ıyla yüklenir; gizli değerler yazdırılmaz.
 */
import { CTA_POSITION_LABEL, FIRST_SECTION_LABEL, HOOK_LENGTH_LABEL, TEMPO_BUCKET_LABEL } from "@/lib/domain/anatomy";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { createProvenIdeasReaders, loadProvenIdeas } from "@/lib/intel/proven-ideas-load";
import type { ModalBucket, ProvenIdea } from "@/lib/intel/proven-ideas-types";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

function parseArgs(argv: readonly string[]): { json: boolean; days?: number } {
  let json = false;
  let days: number | undefined;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (/^--days=\d+$/.test(arg)) days = Number(arg.slice(7));
    else throw new Error(`Bilinmeyen argüman: ${arg} (geçerli: --json, --days=<gün>).`);
  }
  return { json, days };
}

const modalText = <K extends string>(m: ModalBucket<K>, labels: Record<K, string>): string =>
  m.bucket === undefined ? "ölçülemedi" : `${labels[m.bucket]} (${m.count}/${m.measured})`;

function printIdea(idea: ProvenIdea, index: number): void {
  const tag = idea.kind === "proven" ? "KANITLI" : "tek kanıtlı";
  console.log(`${index + 1}. [${tag} · ${idea.confidence}] ${idea.cellLabel} × ${hookTypeLabel(idea.hookType)} — ${idea.accountCount} hesap, ${idea.platformCount} platform, medyan ${idea.medianLift.toFixed(1)}x · kendin denedin mi: ${idea.ownTried ? "evet" : "hayır"}`);
  const a = idea.anatomy;
  console.log(
    `   açılış: ${modalText(a.hookLength, HOOK_LENGTH_LABEL)} · ilk bölüm: ${modalText(a.firstSection, FIRST_SECTION_LABEL)} · tempo: ${modalText(a.tempo, TEMPO_BUCKET_LABEL)} · çağrı: ${modalText(a.ctaPosition, CTA_POSITION_LABEL)} · süre medyanı: ${a.medianDurationSec === undefined ? "ölçülemedi" : `${Math.round(a.medianDurationSec)} sn`}`,
  );
  console.log(`   kanıt: ${idea.evidence.map((e) => `@${e.handle}${e.isOwn ? " (kendi)" : ""} ${e.lift.toFixed(1)}x ${e.contentItemId.slice(0, 8)}`).join(", ")}`);
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
  const result = await loadProvenIdeas(createProvenIdeasReaders(ctx), { now: ctx.now, days: args.days });
  if (args.json) {
    console.log(JSON.stringify({ workspace: { id: ctx.workspaceId, name: ctx.workspace.name }, counts: result.counts, ideas: result.ideas }, null, 2));
    return 0;
  }
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const proven = result.ideas.filter((i) => i.kind === "proven").length;
  const basis = result.counts.clusters === 0 ? "süre kovası × hook türü (konu kümesi yok)" : "konu kümesi × hook türü";
  console.log(`Girdi: ${result.counts.items} video · ${result.counts.analyses} doğrulanmış analiz · ${result.counts.clusters} küme ataması · ${result.counts.offNiche} niş dışı`);
  console.log(`Kart: ${result.ideas.length} (kanıtlı ${proven}, tek kanıtlı ${result.ideas.length - proven}) · hücre: ${basis}`);
  result.ideas.forEach(printIdea);
  console.log("DB'ye yazılmadı; LLM / Apify çağrılmadı.");
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Kanıtlı fikir listesi başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
