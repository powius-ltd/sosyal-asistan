/**
 * Haftalık içerik planı (yerel): `npm run plan:week -- [--week=YYYY-MM-DD] [--dry-run] [--workspace=<id|slug|ad>]`.
 *
 * Varsayılan hafta = gelecek Pazartesi (hedef kitle saat diliminde). Akış: girdiler → ses profili (taze değilse) → konu kümeleri →
 * deterministik taslak (`lib/insights`) → gerekçe metinleri → ≥ 5 fikir + script → `save_weekly_plan` RPC (atomik). Çıktı ayrıca
 * `docs/haftalik-plan/<slug>/<hafta>.md` dosyasına yazılır (çalışma alanı başına klasör; slug yoksa kimliğin ilk 8 karakteri; commit'lenmez;
 * kullanıcı ilk planı buradan okur). `--dry-run` yalnız taslağı yazdırır (LLM yok, DB'ye yazma yok; .md yine üretilir ve `-taslak` ekiyle
 * kaydedilir). `--workspace=<id|slug|ad>` çalışma alanını seçer (varsayılan `LOCAL_WORKSPACE_ID`).
 *
 * `.env.local` Node'un `--env-file`'ıyla yüklenir; gizli değerler yazdırılmaz. Çıkış kodu: 0 tamam · 1 hata · 2 durdu (ses profili yetersiz)
 * · 3 durdu (fikir üretimi yetersiz ve hafta için fikirli plan var: mevcut plan ve `<hafta>.md` KORUNUR; yeni taslak `-taslak.md`'ye yazılır).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parsePlanArgs } from "@/lib/intel/args";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { workspaceDocDir } from "@/lib/workspace/doc-dir";
import { splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";
import { runPlan } from "@/lib/intel/plan-run";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;

async function main(): Promise<number> {
  const { workspace, rest } = splitWorkspaceArg(process.argv.slice(2));
  const args = parsePlanArgs(rest);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const ctx = await createIntelContext(new Date(), workspace);
  console.log(workspaceBanner({ id: ctx.workspaceId, name: ctx.workspace.name, slug: ctx.workspaceSlug }));
  const result = await runPlan(ctx, args, (line) => console.log(line));

  const dir = workspaceDocDir(process.cwd(), "haftalik-plan", { id: ctx.workspaceId, slug: ctx.workspaceSlug });
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${result.weekStart}${result.outcome === "saved" ? "" : "-taslak"}.md`);
  writeFileSync(file, result.markdown, "utf8");

  console.log("");
  console.log(`Sonuç (${result.outcome}): hafta ${result.weekStart} · durum ${result.status ?? "—"} · güven ${result.confidence} · ${result.ideas} fikir, ${result.planned} plana girdi · süre ${result.seconds} sn`);
  for (const note of result.notes) console.log(`  not: ${note}`);
  console.log(`Markdown: ${file}`);
  if (result.outcome === "kept_existing") return 3;
  return result.outcome === "voice_unusable" ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Plan başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
