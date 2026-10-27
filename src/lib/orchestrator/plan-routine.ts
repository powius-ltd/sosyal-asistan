/**
 * `planRoutine(state)`: SAF karar fonksiyonu (DB/ağ/saat yok). Durumdan her adım için `run | skip(sebep) | needs_approval(tahmin)` üretir.
 * Onay kapıları buradadır: Apify (para) YALNIZ `state.apifyMaxUsd` verilmişse `run`; verilmemişse `needs_approval` (ya da toplama taze ise
 * `skip`). Ölçüm koşusu (`measure:now`, para) rutinin işi değildir: adım 5 yalnız ücretsiz kontroldür.
 * Çalışma anındaki sonuçlar (kalıcı LLM hatası, `needs_recollect` …) burada değil `routine.ts`'tedir; bu fonksiyon yalnız başlangıç durumunu görür.
 */
import { accountTypeLabel, usesMatrix } from "@/lib/domain/account-type";
import { BRIEFING_STALE_REASON_LABEL } from "@/lib/domain/briefing";
import { formatNumber, formatUsd } from "@/lib/format";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import { labelingSkipReason } from "@/lib/intel/label-select";
import type { PlanEntry, RoutinePlan, RoutineState, StepDecision } from "@/lib/orchestrator/types";
import { DAY_MS } from "@/lib/time";

/** Son toplama bu süreden tazeyse (ve onay verilmemişse) yeniden toplama önerilmez. */
export const COLLECTION_FRESH_MS = DAY_MS;

const hoursSince = (iso: string, nowMs: number): number | undefined => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : Math.max(0, Math.floor((nowMs - ms) / 3_600_000));
};

function decideCollect(state: RoutineState, nowMs: number): StepDecision {
  const { apifyMaxUsd } = state;
  const reference = state.collection.referenceUsd;
  if (apifyMaxUsd !== undefined) {
    const cap = formatUsd(apifyMaxUsd) ?? String(apifyMaxUsd);
    const warn =
      reference !== undefined && reference > apifyMaxUsd
        ? ` Son toplama ≈ ${formatUsd(reference)} tuttu: gerçek tahmin tavanı aşarsa koşu başlamaz.`
        : "";
    return { action: "run", reason: `Apify tavanı onaylandı (${cap}).${warn}` };
  }
  const last = state.collection.lastCollectedAt;
  const hours = last === undefined ? undefined : hoursSince(last, nowMs);
  if (hours !== undefined && hours * 3_600_000 < COLLECTION_FRESH_MS) {
    return { action: "skip", reason: `Son toplama ${formatNumber(hours)} saat önce: taze, yeniden toplanmaz.` };
  }
  // Neden iki yüzeyde de okunur (terminal özeti + paneldeki adım notu): onayın NASIL verileceğini yüzey söyler (terminalde durum satırı
  // bayrağı yazar, panelde "Yeni veri de topla" kutusu); buraya bayrak ya da komut yazılmaz.
  const basis = reference === undefined ? "Geçmiş koşu yok: tahmini toplamanın ön bakışı (kuru koşu) verir." : `Son toplama oturumu ≈ ${formatUsd(reference)} (referans).`;
  return {
    action: "needs_approval",
    reason: `Apify parası harcar; geçerli tutar onayı yok. ${basis}`,
    ...(reference === undefined ? {} : { estimateUsd: reference }),
  };
}

function decideAnalyze(state: RoutineState): StepDecision {
  const n = state.analysis.selectable;
  return n > 0
    ? { action: "run", reason: `${formatNumber(n)} analizsiz video seçilebilir (en çok ${DEFAULT_ANALYZE_LIMIT} analiz edilir).` }
    : { action: "skip", reason: "Analizsiz seçilebilir video yok." };
}

function decideLabel(state: RoutineState, analyzeRuns: boolean): StepDecision {
  // Hesap türü açı etiketlemesini uygulamıyorsa (içerik üreticisi) çalışma alanı atlanır: içerik bu çerçeveye uymaz.
  const skipReason = labelingSkipReason(state.accountType);
  if (skipReason !== undefined) return { action: "skip", reason: skipReason };
  const n = state.labeling.eligible;
  if (n > 0) return { action: "run", reason: `${formatNumber(n)} analizli video etiketsiz.` };
  if (analyzeRuns) return { action: "run", reason: "Analiz yeni etiketlenecek video çıkarabilir." };
  return { action: "skip", reason: "Etiketlenecek video yok (analizli videoların hepsi güncel sürümle etiketli)." };
}

/**
 * Konu kümeleme: yalnız konu × hook matrisi kullanan türlerde (`creator`, `mixed`) ve kümeleme adımı bağlıysa. Koşar: kümeler yoksa, kümesiz
 * analizli video varsa ya da bu rutinde yeni analiz geliyorsa; kümelerin varlığı okunamıyorsa da koşar (kümeleme tekrarlanabilir, abonelik $0).
 */
function decideCluster(state: RoutineState, analyzeRuns: boolean): StepDecision {
  if (!usesMatrix(state.accountType, "topic_hook")) {
    return { action: "skip", reason: `Hesap türü "${accountTypeLabel(state.accountType)}": konu × hook matrisi kullanılmaz, konu kümelenmez.` };
  }
  const { available, clusteredCount, unclusteredCount } = state.clustering;
  if (!available) return { action: "skip", reason: "Konu kümeleme adımı henüz bağlı değil (plan koşusu kümeleri yine yazar: npm run plan:week)." };
  if (clusteredCount === undefined) return { action: "run", reason: "Konu kümelerinin durumu okunamadı: kümeleme koşar (tekrarlanabilir)." };
  if (clusteredCount === 0) return { action: "run", reason: "Konu kümesi yok." };
  if (unclusteredCount !== undefined && unclusteredCount > 0) return { action: "run", reason: `${formatNumber(unclusteredCount)} analizli video kümesiz.` };
  if (analyzeRuns) return { action: "run", reason: "Yeni analiz geliyor: kümeler güncellenir." };
  return { action: "skip", reason: "Konu kümeleri güncel (kümesiz analizli video yok, yeni analiz yok)." };
}

function decidePlan(state: RoutineState): StepDecision {
  if (state.plan.exists) {
    const status = state.plan.status === undefined ? "" : ` (${state.plan.status})`;
    return { action: "skip", reason: `${state.planWeek} haftası için plan zaten var${status}: yeniden üretilmez (elle: npm run plan:week).` };
  }
  return { action: "run", reason: `${state.planWeek} haftası için plan yok.` };
}

function decideMeasureCheck(state: RoutineState): StepDecision {
  const n = state.measurement.dueCount;
  return { action: "run", reason: n > 0 ? `${formatNumber(n)} Reels'in ölçümü geldi (ücretsiz kontrol, bildirim yazılır).` : "Ücretsiz kontrol (Apify yok)." };
}

function decideBriefing(state: RoutineState, earlierRun: boolean): StepDecision {
  const { generatedAt, freshness } = state.briefing;
  if (generatedAt === undefined || freshness === undefined) return { action: "run", reason: "Brifing yok." };
  if (freshness.stale) return { action: "run", reason: `Brifing bayat: ${BRIEFING_STALE_REASON_LABEL[freshness.reason]}.` };
  if (state.collection.newContentSinceBriefing > 0) {
    return { action: "run", reason: `Brifingten sonra ${formatNumber(state.collection.newContentSinceBriefing)} yeni içerik görüldü.` };
  }
  if (earlierRun) return { action: "run", reason: "Bu rutinde yeni analiz/etiket/plan üretiliyor: brifing yenilenir." };
  return { action: "skip", reason: "Brifing taze ve bu rutinde yeni veri üretilmiyor." };
}

export function planRoutine(state: RoutineState): RoutinePlan {
  const nowMs = Date.parse(state.now);
  const collect = decideCollect(state, nowMs);
  const analyze = decideAnalyze(state);
  const label = decideLabel(state, analyze.action === "run");
  const cluster = decideCluster(state, analyze.action === "run");
  const plan = decidePlan(state);
  const measure = decideMeasureCheck(state);
  // Brifingin dayandığı veriyi değiştirebilecek adımlardan biri koşacaksa brifing de yenilenir (ölçüm kontrolü bunu değiştirmez).
  const earlierRun = [collect, analyze, label, cluster, plan].some((d) => d.action === "run");
  const briefing = decideBriefing(state, earlierRun);

  const entries: PlanEntry[] = [
    { step: "collect", decision: collect },
    { step: "analyze", decision: analyze },
    { step: "label", decision: label },
    { step: "cluster", decision: cluster },
    { step: "plan", decision: plan },
    { step: "measure_check", decision: measure },
    { step: "briefing", decision: briefing },
  ];
  return entries;
}
