/**
 * `analyze:now` orkestrasyonu. Sıra:
 *   içerik oku → seç (kod, §3 sırası) → konu eleği (Claude; niş dışı rakip çıkar, yeniden seç) → video adresleri (Apify dataset, ücretsiz)
 *   → adres süresi kontrolü → agy analizi (varsayılan 3 eşzamanlı, `--concurrency=1–6`; çağrı tavanı) → transcripts + content_analyses + collection_runs yazımı.
 * Yerel dosyası olan kendi video (stüdyo `final.mp4`, `local-video-source.ts`) Apify adresi aranmadan dosyadan incelenir; asla `needs_recollect`/`invalid_url` olmaz.
 * ÜCRETLİ Apify koşusu başlatılmaz. `--dry-run`: yalnız seçim + adres durumu (LLM yok, yazma yok).
 * Video geçici klasörde analiz edilir ve `lib/video-analysis` tarafından silinir; bu katman video/adres yazmaz ve ADRESİ GÜNLÜĞE YAZMAZ.
 */
import "server-only";

import type { ContentItem } from "@/lib/domain/content";
import { unanalyzedResult } from "@/lib/intel/analysis-failures";
import { pickScreeningBatch, selectForAnalysis, type AnalysisCandidate } from "@/lib/intel/analysis-select";
import { saveAnalysis } from "@/lib/intel/analysis-store";
import { createCallBudget, readMaxAgyCalls, runBudgetedQueue } from "@/lib/intel/call-budget";
import { lightModel, type IntelContext } from "@/lib/intel/context";
import { loadAllContent, loadScreens, loadTranscripts, type ScreenInfo } from "@/lib/intel/content-load";
import type { AnalyzeArgs } from "@/lib/intel/args";
import { resolveLocalVideos } from "@/lib/intel/local-video-source";
import { runHousekeeping } from "@/lib/intel/housekeeping";
import { closeRun, openSubscriptionRun } from "@/lib/intel/run-log";
import { dropStaleScreens } from "@/lib/intel/screen-freshness";
import { screenAndSave } from "@/lib/intel/topic-screen";
import { supportsVideoInspection } from "@/lib/platforms/registry";
import { mustRecollect, partitionVideos, resolveVideoUrls, type VideoNeed } from "@/lib/intel/video-source";
import { createLlmBackend } from "@/lib/llm/backend";
import { PROMPT_VERSION as SCREEN_PROMPT_VERSION } from "@/lib/llm/screen-topics";
import { createVideoAnalyzer, sweepStaleTempDirs } from "@/lib/video-analysis";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import type { AnalyzeVideoInput, VideoAnalysisResult, VideoAnalyzer } from "@/lib/video-analysis/types";

/** `unsupported_platform`: seçilen videoların platformu video incelemesini desteklemiyor (indirme kuralı yok); hiçbir video indirilmedi, model çağrılmadı. */
export type AnalyzeOutcome = "completed" | "dry_run" | "needs_recollect" | "backend_unavailable" | "nothing_to_do" | "unsupported_platform";

export interface AnalyzeSummary {
  outcome: AnalyzeOutcome;
  selected: number;
  ok: number;
  insufficient: number;
  failed: number;
  /** Çağrı tavanı yüzünden başlatılmayan. */
  skippedByCap: number;
  /** Adresi süresi dolmuş / bulunamamış (model çağrılmadı). */
  expired: number;
  missing: number;
  agyCalls: number;
  /** agy zarfında bildirilen toplam token (video başına `stats.totalTokens` toplamı); hiçbir çağrı bildirmediyse undefined (0 değil). */
  agyTokens?: number;
  screening: { screened: number; offNiche: number; unscreenable: number; unsure: number; failed: number };
  seconds: number;
}

const SCREEN_ROUNDS = 6;
/** Bir eleme turunda elenen rakip sayısı (pilotta küçük: 3 video için 71 rakibi elemeye gerek yok). */
const SCREEN_WINDOW = 20;
const SCREEN_WINDOW_PILOT = 4;
/** Bu hatalarda kalan videolar denenmez (kota dolu / arka uç yok): boşa süre ve kota harcanmasın. */
const HALTING_FAILURES = ["agy_quota", "agy_missing", "claude_quota", "claude_missing"];
const STALE_TEMP_MS = 60 * 60 * 1000;

const emptySummary = (): AnalyzeSummary => ({
  outcome: "completed",
  selected: 0,
  ok: 0,
  insufficient: 0,
  failed: 0,
  skippedByCap: 0,
  expired: 0,
  missing: 0,
  agyCalls: 0,
  screening: { screened: 0, offNiche: 0, unscreenable: 0, unsure: 0, failed: 0 },
  seconds: 0,
});

const hasCaption = (item: ContentItem | undefined): boolean => (item?.caption ?? "").trim() !== "";

/** `unsure`: modelin karar veremediği içerik (satır yok) bu koşuda NİŞ İÇİ sayılır; "karar verilemez" niş dışı değildir. */
function toCandidate(item: ContentItem, screens: ReadonlyMap<string, ScreenInfo>, unsure: ReadonlySet<string>): AnalysisCandidate {
  return {
    id: item.id,
    isOwn: item.owner.kind === "own",
    handle: item.owner.handle,
    lift: item.score.lift,
    liftTier: item.score.liftTier,
    publishedAt: item.publishedAt,
    inNiche: screens.get(item.id)?.inNiche ?? (unsure.has(item.id) ? true : undefined),
    analysisStatus: item.analysisStatus,
  };
}

const label = (item: ContentItem) => `@${item.owner.handle} ${item.shortcode ?? item.externalId}`;

/**
 * Seç → seçilenler arasında elenmemiş rakip varsa, rakip sırasındaki ilk `window` elenmemiş içeriği eleğe sok → niş dışıları çıkarıp
 * yeniden seç. Eleme pahalı olduğu için bir turda pencere kadar içerik elenir (tek tek değil): niş dışı oranı yüksek olsa da birkaç turda
 * yakınsar. En çok `SCREEN_ROUNDS` tur; metni olmayan rakip elenemez ve seçimde kalır.
 */
async function selectWithScreening(ctx: IntelContext, args: AnalyzeArgs, items: readonly ContentItem[], screens: Map<string, ScreenInfo>, summary: AnalyzeSummary, log: (line: string) => void): Promise<AnalysisCandidate[]> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const unsure = new Set<string>();
  const candidates = () => items.map((item) => toCandidate(item, screens, unsure));
  const pick = () => selectForAnalysis(candidates(), { limit: args.limit, pilot: args.pilot });
  const niche = ctx.workspace.nicheBrief?.trim();
  if (args.dryRun) return pick();
  if (!niche) {
    log("Uyarı: niş özeti (niche_brief) boş; konu eleği atlandı, rakipler elenmeden seçildi.");
    return pick();
  }

  const llm = createLlmBackend();
  // Daha önce analiz edilmiş içeriğin transcript açılışı (varsa) açıklamayla birlikte modele verilir: ince açıklamada karar için ek metin.
  const openings = new Map([...(await loadTranscripts(ctx.client, ctx.workspaceId, ctx.now))].flatMap(([id, t]) => (t.speech === undefined ? [] : [[id, t.speech] as const])));
  const tried = new Set<string>();
  const screenable = (c: AnalysisCandidate) => !c.isOwn && c.inNiche === undefined && !tried.has(c.id) && (hasCaption(byId.get(c.id)) || openings.has(c.id));
  const window = args.pilot ? SCREEN_WINDOW_PILOT : SCREEN_WINDOW;
  let selection = pick();
  for (let round = 0; round < SCREEN_ROUNDS; round++) {
    const pending = pickScreeningBatch(candidates(), selection, screenable, window);
    if (pending.length === 0) break;
    pending.forEach((c) => tried.add(c.id));
    log(`Konu eleği: ${pending.length} rakip içerik (tur ${round + 1})...`);
    const step = await screenAndSave({
      client: ctx.client,
      llm,
      workspaceId: ctx.workspaceId,
      niche,
      items: pending.map((c) => ({ id: c.id, caption: byId.get(c.id)?.caption, transcriptOpening: openings.get(c.id) })),
      now: ctx.now,
      model: lightModel(),
      log,
    });
    for (const [id, info] of step.screens) screens.set(id, info);
    summary.screening.screened += step.screens.size;
    summary.screening.offNiche += step.offNiche;
    summary.screening.unscreenable += step.unscreenable;
    step.unsure.forEach((id) => unsure.add(id));
    summary.screening.unsure += step.unsure.length;
    summary.screening.failed += step.failed;
    selection = pick();
  }
  return selection;
}

function describe(result: VideoAnalysisResult): string {
  if (result.status === "failed") return `failed (${result.failure.kind})`;
  if (result.status === "insufficient_data") return "insufficient_data";
  return `ok${result.evidenceVerified ? " + kanıt doğrulandı" : " (kanıt doğrulanamadı)"}${result.analysis.hookType ? `, hook: ${result.analysis.hookType}` : ""}`;
}

/** Yerel dosyadan inceleme; arka uç yerel dosya desteklemiyorsa fırlatır (sessizce başka yola düşülmez; kullanılabilir arka uçlar hepsi destekler). */
async function analyzeFromFile(analyzer: VideoAnalyzer, input: Omit<AnalyzeVideoInput, "videoUrl">, file: string): Promise<VideoAnalysisResult> {
  if (analyzer.analyzeLocal === undefined) throw new VideoAnalysisError("not_implemented", `${analyzer.backend} arka ucu yerel dosya incelemesini desteklemiyor.`);
  return analyzer.analyzeLocal(input, file);
}

export async function runAnalysis(ctx: IntelContext, args: AnalyzeArgs, log: (line: string) => void): Promise<AnalyzeSummary> {
  const t0 = performance.now();
  const summary = emptySummary();
  const finish = (outcome: AnalyzeOutcome): AnalyzeSummary => ({ ...summary, outcome, seconds: Math.round((performance.now() - t0) / 100) / 10 });

  if (!args.dryRun) await runHousekeeping(ctx, log); // transcript 90 gün saklama + kapanmamış eski abonelik koşuları
  const tracked = new Set((await ctx.repo.listCompetitors(ctx.workspaceId, { status: "tracked" })).map((c) => c.id));
  const all = await loadAllContent(ctx.repo, ctx.workspaceId, { format: "short_video" });
  const items = all.filter((item) => item.owner.kind === "own" || tracked.has(item.owner.id));
  // Güncel elek sürümüyle yazılmamış kararlar (eski istem) "elenmedi" sayılır: seçimdeki içerik yeniden elenir ve kayıt yenilenir.
  const { screens, stale } = dropStaleScreens(await loadScreens(ctx.client, ctx.workspaceId), SCREEN_PROMPT_VERSION);
  log(`İçerik: ${items.length} kısa video (${items.filter((i) => i.owner.kind === "own").length} kendi).`);
  if (stale > 0) log(`Eski elek sürümüyle yazılmış ${stale} konu eleği kaydı bayat sayıldı (${SCREEN_PROMPT_VERSION}); seçimdeki içerikler yeniden elenecek.`);

  const selection = await selectWithScreening(ctx, args, items, screens, summary, log);
  summary.selected = selection.length;
  if (selection.length === 0) return finish("nothing_to_do");

  const byId = new Map(items.map((item) => [item.id, item]));
  // Platform video incelemesini desteklemiyorsa (oturumsuz indirilebilen adres yok) adres aranmaz, indirme denenmez, "yeniden topla" DENMEZ:
  // adım açık sonuçla atlanır. Konu eleği yukarıda yapıldı (açıklama metniyle); plan sayılar + açıklama ile sürer.
  // Stüdyoda üretilip yayınlanan kendi videonun yerel dosyası varsa o kullanılır (platform kuralı ve Apify adresi aranmaz).
  const ownHandle = items.find((item) => item.owner.kind === "own")?.owner.handle;
  const local = await resolveLocalVideos(
    ctx.client,
    ctx.workspaceId,
    selection.map((c) => {
      const item = byId.get(c.id) as ContentItem;
      return { id: item.id, platform: item.platform, shortcode: item.shortcode, externalId: item.externalId, isOwn: item.owner.kind === "own" };
    }),
    { workspaceSlug: ctx.workspaceSlug, handle: ownHandle },
  );
  for (const note of local.notes) log(`Not: ${note}`);
  if (!selection.some((c) => local.files.has(c.id) || supportsVideoInspection((byId.get(c.id) as ContentItem).platform))) {
    log(`Seçilen ${selection.length} videonun platformunda video incelemesi henüz yok: indirme ve model çağrısı yapılmadı.`);
    return finish(args.dryRun ? "dry_run" : "unsupported_platform");
  }
  const remote = selection.filter((c) => !local.files.has(c.id));
  const needs: VideoNeed[] = remote.map((c) => {
    const item = byId.get(c.id) as ContentItem;
    return { contentId: item.id, externalId: item.externalId, shortcode: item.shortcode, platform: item.platform, ownerId: item.owner.id, handle: item.owner.handle };
  });
  const resolution = await resolveVideoUrls(ctx.client, ctx.workspaceId, needs);
  for (const note of resolution.notes) log(`Not: ${note}`);
  const partition = partitionVideos(remote, resolution.urls, ctx.now);
  summary.expired = partition.expired.length;
  summary.missing = partition.missing.length;

  log(`Seçilen ${selection.length} video: ${partition.ready.length + local.files.size} hazır (${local.files.size} yerel dosyadan), ${partition.expired.length} adresi dolmuş, ${partition.missing.length} adres yok.`);
  for (const c of selection) log(`  - ${c.isOwn ? "kendi" : "rakip"} ${label(byId.get(c.id) as ContentItem)} lift ${c.lift?.toFixed(2) ?? "—"} (kademe ${c.liftTier ?? "—"})`);
  if (args.dryRun) return finish("dry_run");
  if (local.files.size === 0 && mustRecollect(partition)) {
    log("Seçilen videoların adresi yok ya da süresi dolmuş: önce `npm run collect:now` gerekir (ücretli Apify koşusu, kullanıcı onayı ister). Analiz başlatılmadı.");
    return finish("needs_recollect");
  }

  const analyzer = createVideoAnalyzer();
  const availability = await analyzer.checkAvailable();
  if (!availability.available) {
    log(`Video analizi arka ucu kullanılamıyor: ${availability.reason ?? "bilinmeyen sebep"}`);
    return finish("backend_unavailable");
  }
  log(`Arka uç: ${analyzer.backend} ${availability.version ?? ""} (model ${analyzer.model}).`);
  const swept = sweepStaleTempDirs(STALE_TEMP_MS);
  if (swept.removed > 0) log(`Eski geçici klasör temizlendi: ${swept.removed}.`);

  // Adresi dolmuş/eksik olanlar: model çağrılmadan `failed`; sonraki koşuda yeniden denenir.
  for (const c of partition.expired) await saveAnalysis(ctx.client, unanalyzedResult(c.id, "expired_url", analyzer.model, analyzer.backend), { workspaceId: ctx.workspaceId, ownerHandle: c.handle });
  for (const c of partition.missing) await saveAnalysis(ctx.client, unanalyzedResult(c.id, "invalid_url", analyzer.model, analyzer.backend), { workspaceId: ctx.workspaceId, ownerHandle: c.handle });
  summary.failed += partition.expired.length + partition.missing.length;

  type Work = { item: AnalysisCandidate; url?: string; file?: string };
  const work: Work[] = [...selection.filter((c) => local.files.has(c.id)).map((item) => ({ item, file: local.files.get(item.id) })), ...partition.ready];
  const budget = createCallBudget(readMaxAgyCalls(process.env));
  let index = 0;
  let agyTokens: number | undefined;
  // İsteğe bağlı kancalar (panel işçisi): sayaç + videolar arası durdurma. Verilmediyse hiçbir etkisi yok; kanca hatası analizi düşürmez.
  let finished = 0;
  const checkpoint = async (): Promise<void> => {
    try {
      await args.onProgress?.({ done: finished, total: work.length });
    } catch {
      // sayaç kancasının hatası yok sayılır (durdurma yine sorulur)
    }
    try {
      if (!budget.halted && (await args.shouldStop?.()) === true) {
        budget.halt();
        log("Durdurma istendi: kalan videolar başlatılmadı (yolda olanlar bitecek).");
      }
    } catch {
      // durdurma kancasının hatası yok sayılır
    }
  };
  await checkpoint();
  const queue = await runBudgetedQueue(work, budget, async ({ item: c, url, file }) => {
    const item = byId.get(c.id) as ContentItem;
    const position = `${++index}/${work.length}`;
    log(`[${position}] ${label(item)} analiz ediliyor...`);
    const run = await openSubscriptionRun(ctx.client, ctx.workspaceId, analyzer.backend === "claude_frames" ? "claude_cli" : "gemini", "video_analysis", label(item));
    try {
      const input = { contentId: item.id, isCompetitor: !c.isOwn, caption: item.caption, durationSec: item.durationSec };
      const result = file !== undefined ? await analyzeFromFile(analyzer, input, file) : await analyzer.analyze({ ...input, videoUrl: url as string });
      await saveAnalysis(ctx.client, result, { workspaceId: ctx.workspaceId, runId: run.id, ownerHandle: c.handle });
      await closeRun(ctx.client, run.id, {
        ok: result.status !== "failed",
        error: result.status === "failed" ? result.failure.message : undefined,
        itemCount: 1,
        // Giriş/çıkış token'ı zarfta varsa yazılır (yoksa NULL: bilinmeyen ≠ 0); abonelik koşusunun "API'de tutardı" gölge maliyeti bunlardan okunur.
        inputTokens: result.stats.inputTokens,
        outputTokens: result.stats.outputTokens,
        // Model: zarf bildirmez, yapılandırılan ad yazılır (gölge maliyet bununla fiyatlanır).
        model: analyzer.model,
      });
      const tokens = result.stats.totalTokens;
      if (tokens !== undefined) agyTokens = (agyTokens ?? 0) + tokens;
      log(`[${position}] ${label(item)} → ${describe(result)} (${result.stats.calls} agy çağrısı, ${tokens === undefined ? "token bilinmiyor" : `${tokens} token`}, ${Math.round(result.stats.durationMs / 1000)} sn)`);
      if (result.status === "failed" && HALTING_FAILURES.includes(result.failure.kind)) {
        budget.halt();
        log(`Kalan videolar durduruldu (${result.failure.kind}): ${result.failure.message}`);
      }
      return { result, calls: result.stats.calls };
    } catch (error) {
      // Beklenmeyen hata (çoğunlukla DB yazımı): koşu satırı açık kalmasın, hata yukarı gitsin.
      await closeRun(ctx.client, run.id, { ok: false, error: error instanceof Error ? error.message : "bilinmeyen hata" }).catch(() => undefined);
      throw error;
    } finally {
      finished++;
      await checkpoint();
    }
  }, args.concurrency);

  for (const { result } of queue.done) {
    if (result.status === "ok") summary.ok++;
    else if (result.status === "insufficient_data") summary.insufficient++;
    else summary.failed++;
  }
  summary.skippedByCap = queue.skipped.length;
  summary.agyCalls = budget.used;
  summary.agyTokens = agyTokens;
  return finish("completed");
}
