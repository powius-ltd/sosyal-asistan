/**
 * `plan:week` orkestrasyonu. Sıra:
 *   girdiler (içerik, analiz, eleme, transcript) → ses profili (taze değilse Claude) → konu kümeleri (Claude) → deterministik taslak
 *   (`buildPlanDraft`, kümelerle) → `synthesizeWeek` (gerekçe metinleri) → `generateIdeas` (≥ 5 fikir + script) → `save_weekly_plan` RPC.
 * Sayılabilen her şey kodun (lib/insights); LLM yalnız kümeleme, gerekçe ve fikir/script metni. Her LLM çağrısı abonelik `collection_runs`
 * satırıdır ve plan `run_ids`'te taşır. Bir LLM adımı başarısız olursa plan yine yazılır ama `draft` durumuyla (eksik adım notlanır);
 * ses profili kullanılamıyorsa fikir üretimi yapılmaz (script "sesinde" olamaz) ve plan yazılmaz. Fikir adımı başarısız olur ya da ≥ 5 fikir
 * çıkmazsa ve o hafta için fikirli bir plan ZATEN varsa RPC çağrılmaz (yeniden üretim dokunulmamış fikirleri siler): eski plan korunur (`kept_existing`).
 * Geri besleme: geçen 4 haftanın plan sonucu (`getWeekReview`) yön puanına 0,85–1,15 çarpan olur (`lib/insights/feedback.ts`); okunamazsa
 * (`not_implemented`/hata) çarpan 1'dir ve sebep nota yazılır.
 * İçerik dili (hook/script/açıklama; panel metni hep Türkçe): `resolveContentLanguage` (ayar → kendi transcript dilleri → uyum bölgesi → en),
 * ses profiline ve fikir üretimine geçer; kaynak plan notuna yazılır (dry-run'da da).
 * Hesap sahibinin önerileri: sohbetten kaydettirdiği `new` elle fikirler (en çok 10, en yeni önce) fikir istemine veri bloğu olarak girer; sayı plan notuna
 * (kuru koşuda da) yazılır, okunamazsa öneri olmadan sürer.
 * `--dry-run`: yalnız taslak (LLM yok, yazma yok).
 * Hesap türü (`workspace.accountType`, `accountTypeProfile`): amaç metni ve önerilecek CTA'lar fikir üretimine, karma türde slot bölümü
 * (`splitPlanSlots`) fikir seçimine, tür ve amaç plan Markdown'una girer. Rakipsiz mod (`draft.mode = "own"`, `lib/insights/mode.ts`): yön/aday/kanıt
 * kendi tutanlarındandır; mod plan notuna ve fikre yazılır. Konu kümeleri `usesMatrix(type, "topic_hook")` türlerde `content_topic_clusters`'a yazılır
 * (`topic-cluster-store.ts`); `clusterOnly(ctx)` yalnız kümeleme yapar (rutin "kümele" adımı, matris plan beklemeden dolsun).
 */
import "server-only";

import { accountTypeProfile, usesMatrix, type AccountType } from "@/lib/domain/account-type";
import type { ContentItem } from "@/lib/domain/content";
import { TAXONOMY_VERSION } from "@/lib/domain/intel";
import type { Json } from "@/lib/supabase/database.types";
import { isVoiceProfileUsable } from "@/lib/domain/voice-profile";
import type { ConfidenceLevel, WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { applyFeedbackNotes, audienceZone, buildFeedback, buildPlanDraft, FEEDBACK_MIN_N, previousWeeks } from "@/lib/insights";
import type { FeedbackIndex, FeedbackReview, TopicCluster, WeeklyPlanDraft } from "@/lib/insights";
import { nextMondayOf, type PlanArgs } from "@/lib/intel/args";
import { lightModel, type IntelContext } from "@/lib/intel/context";
import { loadAllContent, loadAnalyses, loadScreens, loadTranscripts } from "@/lib/intel/content-load";
import { clusterItems, evidenceContents, poolIds, weekContents, type PlanSources } from "@/lib/intel/plan-corpus";
import { saveTopicClusters, type SaveClustersResult } from "@/lib/intel/topic-cluster-store";
import { renderPlanMarkdown, type EvidenceRef } from "@/lib/intel/plan-markdown";
import { directBrief } from "@/lib/intel/creative-director";
import { defaultScriptReviewDeps, reviewPlannedScripts } from "@/lib/intel/script-review-run";
import { planBriefToStorage } from "@/lib/data/weekly-plan-schema";
import { rankIdeas, toPayloadIdeas, type PlanPayload } from "@/lib/intel/plan-payload";
import { loadOwnerSuggestions, ownerSuggestionsNote, type OwnerSuggestion } from "@/lib/intel/owner-suggestions";
import { runHousekeeping } from "@/lib/intel/housekeeping";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { ensureVoiceProfile } from "@/lib/intel/voice-step";
import { RepositoryError } from "@/lib/data/repository";
import { createLlmBackend } from "@/lib/llm/backend";
import { clusterTopics, MIN_ITEMS_TO_CLUSTER, PROMPT_VERSION as CLUSTER_PROMPT } from "@/lib/llm/cluster-topics";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import { generateIdeas, PROMPT_VERSION as IDEAS_PROMPT } from "@/lib/llm/generate-ideas";
import { PROMPT_VERSION as SYNTH_PROMPT, synthesizeWeek } from "@/lib/llm/synthesize-week";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";
import { audienceRegionOf, resolveContentLanguage } from "@/lib/workspace/content-language";

export type PlanOutcome = "saved" | "dry_run" | "voice_unusable" | "kept_existing";

export interface PlanRunResult {
  outcome: PlanOutcome;
  weekStart: string;
  status?: "draft" | "ready";
  confidence: ConfidenceLevel;
  ideas: number;
  planned: number;
  notes: string[];
  /** `docs/haftalik-plan/<hafta>.md` içeriği (dry-run'da da taslaktan üretilir). */
  markdown: string;
  seconds: number;
}

const CANDIDATES_FOR_EVIDENCE = 8;
const OWN_TOP_FOR_EVIDENCE = 6;
/** LLM çağrısı: başarıda koşuyu kaydeder, hatada başarısız koşuyu kaydedip `undefined` döndürür (plan eksik adımla sürer). */
async function guarded<T extends { meta?: LlmCallMeta }>(
  ctx: IntelContext,
  kind: Parameters<typeof recordFailedLlmRun>[2],
  label: string,
  notes: string[],
  runIds: string[],
  call: () => Promise<T>,
): Promise<T | undefined> {
  try {
    const result = await call();
    if (result.meta) runIds.push(await recordLlmRun(ctx.client, ctx.workspaceId, result.meta, label));
    return result;
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    notes.push(`${label}: ${error.message}`);
    await recordFailedLlmRun(ctx.client, ctx.workspaceId, kind, label, error.message);
    return undefined;
  }
}

interface PlanFeedback {
  reviews: FeedbackReview[];
  index: FeedbackIndex;
}

/**
 * Son 4 haftanın plan sonucunu okur (W−7, W−14, …). Plan yoksa o hafta atlanır; `not_implemented`/hata → çarpan 1 ve sebep nota
 * (plan yine üretilir). Okuma salt okunurdur: dry-run'da da çalışır.
 */
async function loadFeedback(ctx: IntelContext, weekStart: string, notes: string[]): Promise<PlanFeedback> {
  const reviews: FeedbackReview[] = [];
  for (const week of previousWeeks(weekStart)) {
    try {
      const review = await ctx.repo.getWeekReview(ctx.workspaceId, week, ctx.now);
      if (review !== null) reviews.push({ weekStart: review.weekStart, directions: review.directions });
    } catch (error) {
      const reason = error instanceof RepositoryError && error.code === "not_implemented" ? "bu veri kaynağında henüz yok" : error instanceof Error ? error.message : "bilinmeyen hata";
      notes.push(`Geri besleme: geçen haftaların sonucu okunamadı (${reason}); yön puanı çarpanı 1.`);
      return { reviews: [], index: new Map() };
    }
  }
  const index = buildFeedback(reviews);
  const applied = [...index.values()].filter((f) => f.n >= FEEDBACK_MIN_N).length;
  notes.push(
    applied > 0
      ? `Geri besleme: ${applied} yönün puanı geçen haftaların sonucuyla ayarlandı (çarpan 0,85–1,15; ≥ ${FEEDBACK_MIN_N} ölçülmüş sonuç).`
      : `Geri besleme: son 4 haftada ≥ ${FEEDBACK_MIN_N} ölçülmüş sonucu olan yön yok; yön puanı çarpanı 1.`,
  );
  return { reviews, index };
}

function evidenceRefOf(byId: ReadonlyMap<string, ContentItem>): (contentId: string) => EvidenceRef {
  return (contentId) => {
    const item = byId.get(contentId);
    return { contentId, handle: item?.owner.handle ?? "?", isOwn: item?.owner.kind === "own", lift: item?.score.lift, url: item?.url };
  };
}

interface PlanInputs {
  ownAccounts: Awaited<ReturnType<IntelContext["repo"]["listOwnAccounts"]>>;
  competitors: Awaited<ReturnType<IntelContext["repo"]["listCompetitors"]>>;
  /** Kendi hesap (ilk): plan ve ses bunun için. */
  account: Awaited<ReturnType<IntelContext["repo"]["listOwnAccounts"]>>[number];
  items: ContentItem[];
  src: PlanSources;
  offNiche: Set<string>;
}

/** Plan ve kümeleme girdileri (içerik, analiz, eleme, transcript): `runPlan` ve `clusterOnly` ortak. Kendi hesap yoksa fırlatır. */
async function loadPlanInputs(ctx: IntelContext): Promise<PlanInputs> {
  const [ownAccounts, competitors] = await Promise.all([ctx.repo.listOwnAccounts(ctx.workspaceId), ctx.repo.listCompetitors(ctx.workspaceId, { status: "tracked" })]);
  const account = ownAccounts[0];
  if (account === undefined) throw new Error("Kendi hesap yok: plan üretilemez.");
  const tracked = new Set(competitors.map((c) => c.id));
  const items = (await loadAllContent(ctx.repo, ctx.workspaceId, { format: "short_video" })).filter((i) => i.owner.kind === "own" || tracked.has(i.owner.id));
  const [analyses, screens, transcripts] = await Promise.all([loadAnalyses(ctx.client, ctx.workspaceId), loadScreens(ctx.client, ctx.workspaceId), loadTranscripts(ctx.client, ctx.workspaceId, ctx.now)]);
  const src: PlanSources = { byId: new Map(items.map((item) => [item.id, item])), transcripts, analyses, screens };
  const offNiche = new Set([...screens].filter(([, s]) => !s.inNiche).map(([id]) => id));
  return { ownAccounts, competitors, account, items, src, offNiche };
}

/**
 * Konu kümeleme adımı (Claude, hafif model): kümeler planın `topic_cluster` eksenine girer; `usesMatrix(type, "topic_hook")` türlerde ayrıca
 * `content_topic_clusters`'a yazılır (yazım hatası plan/kümeleme sonucunu düşürmez, nota yazılır). Çok az içerikte model çağrılmaz.
 */
async function clusterStep(ctx: IntelContext, llm: LlmBackend, inputs: PlanInputs, acc: { notes: string[]; runIds: string[] }, log: (line: string) => void): Promise<{ clusters?: TopicCluster[]; saved?: SaveClustersResult }> {
  const clusterInput = clusterItems(inputs.items, inputs.src, inputs.offNiche);
  if (clusterInput.length < MIN_ITEMS_TO_CLUSTER) return {};
  log(`Konu kümeleme (${clusterInput.length} içerik)...`);
  const runsBefore = acc.runIds.length;
  const outcome = await guarded(ctx, "llm_topic_cluster", "konu kümeleme", acc.notes, acc.runIds, () => clusterTopics(llm, { items: clusterInput }, { model: lightModel() }));
  if (!outcome) return {};
  acc.notes.push(...outcome.problems.map((p) => `Kümeleme: ${p}`));
  const clusters = outcome.clusters.map((c) => ({ id: c.key, label: c.label, contentItemIds: c.contentIds }));
  if (!usesMatrix(ctx.workspace.accountType, "topic_hook")) return { clusters };
  try {
    const runId = acc.runIds.length > runsBefore ? acc.runIds[acc.runIds.length - 1] : undefined;
    const saved = await saveTopicClusters(ctx.client, outcome.clusters, { workspaceId: ctx.workspaceId, promptVersion: CLUSTER_PROMPT, model: outcome.meta?.model, runId, now: ctx.now });
    log(`Konu kümeleri kaydedildi: ${saved.saved} içerik, ${outcome.clusters.length} küme${saved.cleared !== undefined && saved.cleared > 0 ? `, ${saved.cleared} eski satır temizlendi` : ""}.`);
    return { clusters, saved };
  } catch (error) {
    acc.notes.push(`Konu kümeleri kaydedilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"} (plan kümelerle sürdü).`);
    return { clusters };
  }
}

export interface ClusterOnlyResult {
  outcome: "clustered" | "skipped_account_type" | "too_few" | "failed";
  /** Üretilen küme ve kümeye giren içerik sayısı. */
  clusters: number;
  contents: number;
  /** `content_topic_clusters`'a yazıldı mı (satır sayısı); yazılmadıysa undefined. */
  saved?: number;
  notes: string[];
  seconds: number;
}

/**
 * Yalnız konu kümeleme (plan/ses/fikir YOK): rutinin "kümele" adımı; matris plan beklemeden dolsun. Hesap türü konu × hook matrisini kullanmıyorsa
 * (`usesMatrix(type, "topic_hook")` yanlış: `business`) atlanır (`options.force` ile zorlanır). Her LLM çağrısı abonelik koşusu olarak kaydedilir.
 */
export async function clusterOnly(ctx: IntelContext, log: (line: string) => void = () => {}, options: { force?: boolean } = {}): Promise<ClusterOnlyResult> {
  const t0 = performance.now();
  const acc = { notes: [] as string[], runIds: [] as string[] };
  const done = (outcome: ClusterOnlyResult["outcome"], extra: Partial<Pick<ClusterOnlyResult, "clusters" | "contents" | "saved">> = {}): ClusterOnlyResult => ({
    outcome,
    clusters: extra.clusters ?? 0,
    contents: extra.contents ?? 0,
    ...(extra.saved === undefined ? {} : { saved: extra.saved }),
    notes: acc.notes,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
  });
  if (!options.force && !usesMatrix(ctx.workspace.accountType, "topic_hook")) {
    acc.notes.push(`Hesap türü "${accountTypeProfile(ctx.workspace.accountType).label}" konu × hook matrisini kullanmıyor: kümeleme atlandı.`);
    return done("skipped_account_type");
  }
  const inputs = await loadPlanInputs(ctx);
  if (clusterItems(inputs.items, inputs.src, inputs.offNiche).length < MIN_ITEMS_TO_CLUSTER) {
    acc.notes.push(`Kümelenecek en az ${MIN_ITEMS_TO_CLUSTER} metinli içerik yok.`);
    return done("too_few");
  }
  const { clusters, saved } = await clusterStep(ctx, createLlmBackend(), inputs, acc, log);
  if (clusters === undefined) return done("failed");
  return done("clustered", { clusters: clusters.length, contents: clusters.reduce((n, c) => n + c.contentItemIds.length, 0), saved: saved?.saved });
}

export async function runPlan(ctx: IntelContext, args: PlanArgs, log: (line: string) => void): Promise<PlanRunResult> {
  const t0 = performance.now();
  const zone = audienceZone(ctx.workspace);
  const weekStart = args.week ?? nextMondayOf(toDayKey(ctx.now, zone) as string);
  const notes: string[] = [];
  const runIds: string[] = [];

  if (!args.dryRun) await runHousekeeping(ctx, log); // transcript 90 gün saklama + kapanmamış eski abonelik koşuları

  // 1) Girdiler.
  const inputs = await loadPlanInputs(ctx);
  const { ownAccounts, competitors, account, items, src, offNiche } = inputs;
  const { byId, transcripts, analyses, screens } = src;
  const accountType: AccountType = ctx.workspace.accountType;
  const profile = accountTypeProfile(accountType);
  const analysisRefs = [...analyses].map(([contentItemId, a]) => ({ contentItemId, status: a.status, evidenceVerified: a.evidenceVerified, hookType: a.hookType }));
  const feedback = await loadFeedback(ctx, weekStart, notes);
  let ownerSuggestions: OwnerSuggestion[] = [];
  try {
    ownerSuggestions = await loadOwnerSuggestions(ctx.repo, ctx.workspaceId);
  } catch {
    notes.push("Hesap sahibinin elle fikirleri okunamadı; plan onlarsız sürdü.");
  }
  const suggestionsNote = ownerSuggestionsNote(ownerSuggestions.length);
  if (suggestionsNote !== undefined) notes.push(suggestionsNote);
  // İçerik dili (hook/script/açıklama): ayar → kendi transcript dilleri → uyum bölgesi → en. Kaynak nota yazılır (varsayım görünür).
  const ownItems = items.filter((i) => i.owner.kind === "own");
  const contentLanguage = resolveContentLanguage({
    configured: ctx.workspace.contentLanguage,
    ownContentLanguages: ownItems.map((item) => transcripts.get(item.id)?.language),
    complianceRegion: ctx.workspace.complianceRegion,
  });
  notes.push(contentLanguage.note);
  log(`Girdi: ${items.length} video (${items.filter((i) => i.owner.kind === "own").length} kendi), ${analyses.size} analiz, ${transcripts.size} transcript, ${offNiche.size} niş dışı.`);

  const buildDraft = (clusters?: TopicCluster[]): WeeklyPlanDraft =>
    buildPlanDraft({ weekStart, now: ctx.now, workspace: ctx.workspace, own: ownAccounts, competitors, items, accountId: account.id, analyses: analysisRefs, clusters, offNicheContentIds: [...offNiche], screenedContentIds: [...screens.keys()], reviews: feedback.reviews });
  const evidenceOf = evidenceRefOf(byId);
  const finish = (partial: Omit<PlanRunResult, "weekStart" | "seconds" | "notes" | "markdown">, draft: WeeklyPlanDraft, sections: WeeklyPlanSections, extra: { ideas?: PlanPayload["ideas"]; summary?: string; voiceSummary?: string; brief?: CreativeBrief } = {}): PlanRunResult => ({
    ...partial,
    weekStart,
    notes,
    markdown: renderPlanMarkdown({ weekStart, generatedAt: ctx.now, audienceZone: zone, summary: extra.summary, confidence: draft.confidence, sections, ideas: extra.ideas ?? [], evidenceOf, notes, voiceSummary: extra.voiceSummary, brief: extra.brief, accountType, mode: draft.mode }),
    seconds: Math.round((performance.now() - t0) / 100) / 10,
  });

  // 2) Dry-run: yalnız taslak.
  if (args.dryRun) {
    const draft = buildDraft();
    notes.push(`Hesap türü: ${profile.label} (amaç: ${profile.purpose})`, draft.modeNote);
    log(`Taslak (LLM yok, hesap türü ${accountType}, mod ${draft.mode}): ${draft.stats.rivalVideos} rakip, ${draft.stats.ownVideos} kendi video; ${draft.sections.winners.rivals.length} rakip + ${draft.sections.winners.own.length} kendi tutan, ${draft.sections.focus.directions.length} yön, ${draft.candidates.length} aday, ${draft.sections.schedule.slots.length} slot.`);
    return finish({ outcome: "dry_run", confidence: draft.confidence, ideas: 0, planned: 0 }, draft, draft.sections);
  }

  const llm: LlmBackend = createLlmBackend();

  // 3) Ses profili (Claude; taze değilse).
  let ownStats;
  try {
    const insights = await ctx.repo.getInsights(ctx.workspaceId, { accountId: account.id });
    ownStats = insights.rows.find((row) => row.subjectKind === "own" && row.subjectId === account.id)?.voice;
  } catch {
    ownStats = undefined;
  }
  const voice = await ensureVoiceProfile(ctx, llm, { accountId: account.id, handle: account.handle, platform: account.platform, language: contentLanguage.language, ownItems, src, stats: ownStats, log });
  notes.push(...voice.notes);
  if (voice.runId) runIds.push(voice.runId);
  if (voice.profile === null || !isVoiceProfileUsable(voice.profile)) {
    const draft = buildDraft();
    notes.push("Ses profili kullanılamıyor (en az 5 doğrulanmış özellik gerekli): fikir/script üretilmedi, plan yazılmadı.");
    return finish({ outcome: "voice_unusable", confidence: draft.confidence, ideas: 0, planned: 0 }, draft, draft.sections);
  }

  // 4) Konu kümeleri (Claude, hafif model; konu × hook matrisi kullanan türlerde DB'ye de yazılır).
  const { clusters } = await clusterStep(ctx, llm, inputs, { notes, runIds }, log);

  // 5) Deterministik taslak (kümelerle) + gerekçe metinleri.
  const draft = buildDraft(clusters);
  notes.push(`Hesap türü: ${profile.label} (amaç: ${profile.purpose})`, draft.modeNote);
  log(`Taslak (mod ${draft.mode}): ${draft.sections.winners.rivals.length} rakip + ${draft.sections.winners.own.length} kendi tutan, ${draft.sections.focus.directions.length} yön, ${draft.candidates.length} aday, ${draft.sections.schedule.slots.length} slot (güven: ${draft.confidence}).`);
  const winnerIds = [...draft.sections.winners.rivals, ...draft.sections.winners.own].map((w) => w.contentItemId);
  const synth = await guarded(ctx, "llm_week_synthesis", "haftalık plan metni", notes, runIds, () =>
    synthesizeWeek(llm, { draft: draft.sections, corpus: weekContents(poolIds([winnerIds, draft.sections.focus.directions.flatMap((d) => d.evidenceContentIds)], 60), src), niche: ctx.workspace.nicheBrief }),
  );
  const synthesized = synth?.sections ?? draft.sections;
  // `synthesize-week` gerekçeyi yeniden yazar: geri besleme notu LLM metnine bağlı kalmasın diye sentezden sonra eklenir.
  const sections: WeeklyPlanSections = { ...synthesized, focus: applyFeedbackNotes(synthesized.focus, feedback.index) };
  if (synth) notes.push(...synth.dropped.map((d) => `Plan metni: ${d}`));

  // 5b) Kreatif direktör brifi (tema, sütunlar, ~%70/%30 oran, tek deneme değişkeni, süreklilik). Üretilemezse brifsiz, bugünkü yolla sürer.
  const directed = await directBrief(ctx, llm, { weekStart, sections, mode: draft.mode, reviews: feedback.reviews, voiceSummary: voice.profile?.summary, notes, runIds, log });
  const brief = directed?.brief;

  // 6) Fikirler + script (Claude).
  // Rakipsiz modda kendi tutan azsa (≥ 2 kanıt gerekir) lift'e göre en iyi kendi videoları da havuza girer (kanıt kuralı yine ≥ 1 kendi tutanı ister).
  const ownTopIds = draft.mode === "own" ? [...ownItems].filter((item) => item.score.lift !== undefined).sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0)).slice(0, OWN_TOP_FOR_EVIDENCE).map((item) => item.id) : [];
  const evidenceIds = poolIds([Object.values(directed?.evidenceByRef ?? {}).flat(), draft.candidates.slice(0, CANDIDATES_FOR_EVIDENCE).flatMap((c) => c.evidenceContentIds), draft.sections.winners.rivals.map((w) => w.contentItemId), draft.sections.winners.own.map((w) => w.contentItemId), ownTopIds]);
  log(`Fikir üretimi (${evidenceIds.length} kanıt içeriği)...`);
  const evidence = evidenceContents(evidenceIds, src);
  const generated = await guarded(ctx, "llm_idea_generation", "fikir ve script üretimi", notes, runIds, () =>
    generateIdeas(llm, { ownerHandle: account.handle, language: contentLanguage.language, audienceRegion: audienceRegionOf(ctx.workspace.complianceRegion), niche: ctx.workspace.nicheBrief, directions: sections.focus.directions, evidence, voice: voice.profile as NonNullable<typeof voice.profile>, mode: draft.mode, accountType, brief, briefEvidence: directed?.evidenceByRef, briefConfidence: directed?.confidenceByRef, ownerSuggestions }),
  );
  if (generated) notes.push(...generated.dropped.map((d) => `Fikir düştü: "${d.title}" — ${d.reasons.join("; ")}.`));
  if (generated) for (const idea of generated.ideas) for (const note of idea.notes.filter((n) => n.startsWith("CTA önerisi"))) notes.push(`Fikir "${idea.title}": ${note}`);
  if (generated && generated.uncoveredSlots.length > 0) notes.push(`Brif slotları fikirsiz kaldı: ${generated.uncoveredSlots.join(", ")}.`);
  if (generated && !generated.meetsMinimum) notes.push(`Yalnız ${generated.ideas.length} fikir doğrulamadan geçti (en az 5 gerekli).`);

  // 7) Kaydet. Fikir adımı yetersizse ve hafta için fikirli plan varsa eskisini ezme (save_weekly_plan eski fikirleri siler).
  if (generated === undefined || !generated.meetsMinimum) {
    const existing = await ctx.repo.getWeeklyPlan(ctx.workspaceId, weekStart);
    const existingIdeas = existing === null ? 0 : existing.items.length + existing.alternatives.length;
    if (existing !== null && existingIdeas > 0) {
      notes.push(`Fikir üretimi yetersiz (${generated?.ideas.length ?? 0} doğrulanmış fikir, en az 5 gerekli): ${weekStart} haftasının mevcut planı (${existingIdeas} fikir) KORUNDU, yeniden yazılmadı. Tekrar çalıştırın.`);
      return finish({ outcome: "kept_existing", confidence: draft.confidence, ideas: 0, planned: 0 }, draft, sections);
    }
  }
  const rankedIdeas = toPayloadIdeas(rankIdeas(generated?.ideas ?? [], (id) => byId.get(id)?.owner.kind === "own", draft.mode), sections.schedule, { accountType, platform: account.platform, brief });
  // 6b) Senaryo editörü + olgu kontrolü: yalnız plana giren fikirler; tur başarısızsa özgün senaryo kalır, plan düşmez.
  const payloadIdeas = generated === undefined ? rankedIdeas : await reviewPlannedScripts(llm, rankedIdeas, { language: contentLanguage.language, evidence, notes, runIds, log }, defaultScriptReviewDeps(ctx));
  const status: PlanPayload["status"] = synth !== undefined && generated?.meetsMinimum === true ? "ready" : "draft";
  const payload: PlanPayload = {
    account_id: account.id,
    status,
    summary: synth?.summary,
    confidence: draft.confidence,
    sections,
    taxonomy_version: TAXONOMY_VERSION,
    prompt_version: `${SYNTH_PROMPT}+${IDEAS_PROMPT}`,
    model: generated?.meta.model,
    run_ids: runIds,
    ...(brief === undefined ? {} : { brief: planBriefToStorage(brief) }),
    ideas: payloadIdeas,
  };
  const { error } = await ctx.client.rpc("save_weekly_plan", { p_ws: ctx.workspaceId, p_week: weekStart, p_payload: payload as unknown as Json });
  if (error) throw new Error(`Plan kaydedilemedi: ${error.message}`);
  log(`Plan kaydedildi (${status}): ${payloadIdeas.length} fikir, ${payloadIdeas.filter((i) => i.position !== undefined).length} plana girdi.`);

  return finish(
    { outcome: "saved", status, confidence: draft.confidence, ideas: payloadIdeas.length, planned: payloadIdeas.filter((i) => i.position !== undefined).length },
    draft,
    sections,
    { ideas: payloadIdeas, summary: synth?.summary, voiceSummary: voice.profile?.summary, brief },
  );
}
