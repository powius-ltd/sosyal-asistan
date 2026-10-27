/**
 * Kreatif Matris etiketleme (yerel): `npm run label:angles -- [--limit=N] [--dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Analizi `ok` olan kendi + izlenen rakip videoları AÇI × FARKINDALIK KATMANI'na etiketler (Claude CLI, hafif model `LLM_MODEL_LIGHT`;
 * parti ≤ 8 içerik, her etiket içeriğin kendi metninden birebir alıntıyla). Alıntısı korpusta bulunamayan etiket `evidence_verified = false`
 * yazılır (matrise girmez); karar verilemeyen içerik için satır YAZILMAZ. Etiketi olmayan ya da istem sürümü eski olanlar seçilir; niş dışı
 * rakipler ve süresi dolmuş transcript'ler hariç. Her başarılı parti bir abonelik `collection_runs` satırıdır (billing subscription).
 * `--dry-run` yalnız seçimi yazdırır (LLM yok, DB'ye yazma yok). Sözleşme: `domain/creative-matrix.ts`, `data/creative-label-schema.ts`.
 *
 * `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json); gizli değerler hiçbir yere yazdırılmaz, eksik değişkenin yalnız ADI.
 * Çıkış kodu: 0 tamam · 1 hata · 2 bazı içerikler etiketlenemedi (parti hatası / model kullanılamıyor).
 */
import { parseLabelArgs } from "@/lib/intel/label-args";
import { runLabeling } from "@/lib/intel/label-run";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseLabelArgs(rest);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const summary = await runLabeling(ctx, args, (line) => console.log(line));

  console.log("");
  if (summary.outcome === "dry_run") {
    console.log(`Dry-run: ${summary.selected} içerik etiketlenecekti (LLM çağrısı ve DB yazımı yapılmadı).`);
    return 0;
  }
  console.log(`Sonuç (${summary.outcome}): seçilen ${summary.selected} · etiketlenen ${summary.labeled} (doğrulanan ${summary.verified}, doğrulanmayan ${summary.unverified}) · belirsiz ${summary.unsure} · hata ${summary.failed}`);
  console.log(`  model çağrısı (parti) ${summary.batches} · metinsiz ${summary.unlabelable} · süre ${summary.seconds} sn`);
  return summary.failed > 0 ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Etiketleme başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
