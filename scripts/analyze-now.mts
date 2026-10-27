/**
 * Video analizi (yerel): `npm run analyze:now -- [--pilot] [--limit=N] [--concurrency=N] [--dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Seçim (kod, docs/FAZ2-PLAN.md §3): kendi videolar → rakip ≥3x → kademe 2 → kontrast → kalan niş içi (varsayılan 19). Konu eleği (Claude)
 * niş dışı rakibi çıkarır; video adresi son başarılı Apify reel koşusunun dataset'inden okunur (ÜCRETLİ koşu BAŞLATILMAZ); video geçici
 * indirilir → `agy` ile analiz edilir → silinir. Abonelik çağrıları `collection_runs` (billing subscription) kaydı olur.
 * `--pilot` = 1 kendi + 2 rakip. `--concurrency=N` eşzamanlı analiz sayısı (varsayılan 3, 1–6 dışı hata). `--dry-run` yalnız seçimi ve adres durumunu yazdırır (LLM/yazma yok).
 *
 * `.env.local` Node'un `--env-file`'ıyla yüklenir (bkz. package.json); gizli değerler hiçbir yere yazdırılmaz, eksik değişkenin yalnız ADI.
 * Çıkış kodu: 0 tamam · 1 hata · 2 durdu (adres süresi dolmuş: `collect:now` gerekir / arka uç yok).
 */
import { parseAnalyzeArgs } from "@/lib/intel/args";
import { runAnalysis } from "@/lib/intel/analyze-run";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["APIFY_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parseAnalyzeArgs(rest);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const summary = await runAnalysis(ctx, args, (line) => console.log(line));

  console.log("");
  console.log(`Sonuç (${summary.outcome}): seçilen ${summary.selected} · ok ${summary.ok} · insufficient_data ${summary.insufficient} · failed ${summary.failed}`);
  console.log(`  adresi dolmuş ${summary.expired} · adres yok ${summary.missing} · tavan yüzünden atlanan ${summary.skippedByCap} · agy çağrısı ${summary.agyCalls} · agy token ${summary.agyTokens ?? "bilinmiyor"}`);
  console.log(`  konu eleği: ${summary.screening.screened} elendi (${summary.screening.offNiche} niş dışı, ${summary.screening.unscreenable} metinsiz, ${summary.screening.unsure} belirsiz (niş içi sayıldı), ${summary.screening.failed} hata) · süre ${summary.seconds} sn`);
  return summary.outcome === "needs_recollect" || summary.outcome === "backend_unavailable" ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Analiz başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
