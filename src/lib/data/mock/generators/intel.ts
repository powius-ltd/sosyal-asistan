/**
 * Mock üreteci: 40 transcript + içerik analizi.
 *
 * Seçim önceliği: ci_001 → tutan rakip içerikleri (lift ≥ 3) → kendi hesabın yeni videoları →
 * rastgele rakip videoları. Transcript = hook + gövde + çağrı (katalogdan; altyazıyla aynı hook).
 * Analiz alıntıları transcript'ten BİREBİR alınır ve `evidenceVerified` gerçekten kontrol edilerek
 * yazılır. Dağılım: çoğu ok + doğrulanmış; birkaç ok ama doğrulanamamış (model alıntıyı değiştirmiş),
 * birkaç `insufficient_data` (yalnız müzik) ve birkaç `failed` (model hatası).
 *
 * Faz 2 alanları (`intel-v2.ts`): ilk `LEGACY_FROM` analiz video analizi (agy) biçimindedir: hook kanalı, kurgu ölçümleri (bir kısmı
 * ölçülemez/kısmi), alıntı denetim raporu, arka uç ve koşu bağı; son birkaçı Faz 1'den kalma "eski" analizdir (bu alanlar yok).
 * Ayrıca konu eleği sonuçları (`topicScreens`): seçilen içerikler niş içi, bir rakibin birkaç analiz edilmemiş videosu niş dışı.
 */
import type { ContentItem } from "@/lib/domain/content";
import { TAXONOMY_VERSION as CURRENT_TAXONOMY_VERSION } from "@/lib/domain/intel";
import type { AnalysisSection, AnalysisStatus, ContentAnalysis, ContentTopicScreen, Transcript } from "@/lib/domain/intel";
import { topicByKey } from "@/lib/data/mock/catalog/topics";
import type { ContentMeta } from "@/lib/data/mock/generators/content";
import {
  AGY_MODEL,
  buildEditMetrics,
  buildSegments,
  buildEvidenceReport,
  buildTopicScreens,
  insufficientEvidenceReport,
  pickHookSource,
  VIDEO_PROMPT_VERSION,
  type QuoteCheckInput,
} from "@/lib/data/mock/generators/intel-v2";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import type { Rng } from "@/lib/data/mock/prng";

export const TRANSCRIPT_TARGET = 40;
export const TAXONOMY_VERSION = "mock-2026.09";
export const PROMPT_VERSION = "hook-analysis-v1";
/** Sıra bu değerden sonraki analizler Faz 1'den kalma "eski" biçimdedir (hook kanalı, kurgu, denetim raporu, arka uç yok). */
export const LEGACY_FROM = 34;

const WORDS_PER_SEC = 2.6;
const MUSIC_ONLY = ["♪ enstrümantal müzik ♪", "(müzik) (klavye sesleri)", "♪ ♪ ♪ (alkış)"];
const FAILURE_REASONS = [
  "Model yanıtı şemaya uymadı (2 deneme).",
  "Model isteği zaman aşımına uğradı; koşu yeniden denenecek.",
  "Hook türü taksonomide yok (kanıt alıntısı eşleşmedi).",
];

export interface IntelResult {
  transcripts: Transcript[];
  analyses: ContentAnalysis[];
  /** Konu eleği sonuçları: seçilen içerikler niş içi + birkaç niş dışı (analiz edilmemiş) içerik. */
  topicScreens: ContentTopicScreen[];
}

export interface IntelOptions {
  /** Yeni (agy) analizlerin bağlandığı abonelik koşusu (`collection_runs.id`); verilmezse koşu bağı yazılmaz. */
  analysisRunId?: string;
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
const pad3 = (n: number) => String(n).padStart(3, "0");

function selectItems(rng: Rng, items: ContentItem[], meta: Map<string, ContentMeta>): ContentItem[] {
  const videos = items.filter((c) => c.format === "short_video");
  const outliers = videos
    .filter((c) => c.owner.kind === "competitor" && (c.score.lift ?? 0) >= 3)
    .sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0));
  const first = videos.filter((c) => c.id === "ci_001");
  const ownIg = videos.filter((c) => c.owner.kind === "own" && c.platform === "instagram").slice(0, 8);
  const ownOther = videos.filter((c) => c.owner.kind === "own" && c.platform !== "instagram").slice(0, 3);
  const rest = rng.shuffle(videos.filter((c) => c.owner.kind === "competitor"));

  const picked: ContentItem[] = [];
  const seenItems = new Set<string>();
  const seenScripts = new Set<string>();
  for (const c of [...first, ...outliers, ...ownIg, ...ownOther, ...rest]) {
    if (picked.length >= TRANSCRIPT_TARGET) break;
    const m = meta.get(c.id);
    const script = m ? `${m.topicKey}|${m.hook.text}|${m.ctaIndex}` : c.id;
    if (seenItems.has(c.id) || seenScripts.has(script)) continue;
    seenItems.add(c.id);
    seenScripts.add(script);
    picked.push(c);
  }
  return picked;
}

function sectionsFor(text: string, quotes: { type: string; quote: string }[]): AnalysisSection[] {
  return quotes.map(({ type, quote }) => {
    const at = text.indexOf(quote);
    // Alıntı transcript'te yoksa (doğrulanamayan) zaman da bilinmez.
    if (at < 0) return { type, quote };
    return { type, quote, startSec: Math.round(countWords(text.slice(0, at)) / WORDS_PER_SEC) };
  });
}

export function buildIntel(
  rng: Rng,
  clock: MockClock,
  items: ContentItem[],
  meta: Map<string, ContentMeta>,
  options: IntelOptions = {},
): IntelResult {
  const picked = selectItems(rng, items, meta);
  // Faz 2 alanları AYRI akıştan çekilir: ana akış (transcript/analiz çekilişleri) kaymaz.
  const v2 = rng.fork("v2");
  // Kenar durumları düşük öncelikli (sondaki) içeriklere dağıt; tutanlar ve ci_001 "ok" kalsın.
  const tail = rng.shuffle(picked.slice(20).map((c) => c.id));
  const statusOf = new Map<string, AnalysisStatus | "unverified">();
  tail.slice(0, 3).forEach((id) => statusOf.set(id, "insufficient_data"));
  tail.slice(3, 6).forEach((id) => statusOf.set(id, "failed"));
  tail.slice(6, 9).forEach((id) => statusOf.set(id, "unverified"));

  const transcripts: Transcript[] = [];
  const analyses: ContentAnalysis[] = [];

  picked.forEach((item, k) => {
    const m = meta.get(item.id);
    if (!m) return;
    const topic = topicByKey(m.topicKey);
    const plan = statusOf.get(item.id) ?? "ok";
    const cta = topic.ctas[m.ctaIndex];
    const text = plan === "insufficient_data" ? rng.pick(MUSIC_ONLY) : [m.hook.text, ...topic.body, cta].join(" ");
    const wordCount = countWords(text);

    const seenMs = new Date(item.firstSeenAt).getTime();
    const createdMs = Math.min(seenMs + rng.float(0.1, 0.6) * DAY_MS, clock.nowMs - 0.05 * DAY_MS);
    const createdAt = new Date(createdMs).toISOString();
    transcripts.push({
      id: `tr_${pad3(k + 1)}`,
      contentItemId: item.id,
      language: "tr",
      text,
      wordCount,
      isMeaningful: wordCount >= 8,
      source: item.owner.kind === "own" ? "openai_stt" : rng.weighted([["apify", 0.8], ["deepgram", 0.2]] as const),
      expiresAt: new Date(createdMs + 90 * DAY_MS).toISOString(),
      createdAt,
    });

    // Yeni (agy) analiz: güncel taksonomi/prompt, arka uç ve koşu bağı; eski Faz 1 analizinde bu alanlar yoktur.
    const modern = k < LEGACY_FROM;
    const base = {
      id: `an_${pad3(k + 1)}`,
      contentItemId: item.id,
      ...(modern
        ? { taxonomyVersion: CURRENT_TAXONOMY_VERSION, promptVersion: VIDEO_PROMPT_VERSION, model: AGY_MODEL, backend: "agy" as const, runId: options.analysisRunId }
        : { taxonomyVersion: TAXONOMY_VERSION, promptVersion: PROMPT_VERSION, model: "mock-llm" }),
      createdAt: new Date(Math.min(createdMs + 0.05 * DAY_MS, clock.nowMs)).toISOString(),
    };
    if (plan === "insufficient_data" || plan === "failed") {
      const status: AnalysisStatus = plan;
      analyses.push({
        ...base,
        status,
        failureReason:
          status === "failed" ? rng.pick(FAILURE_REASONS) : `Transcript anlamlı değil (${wordCount} kelime, yalnız müzik/efekt).`,
        sections: [],
        labels: [],
        // Başarısız analizde denetim hiç yapılmadı (rapor yok); yetersiz veride korpus çok kısa olduğu için rapor "yetersiz" der.
        ...(modern && status === "insufficient_data" ? { evidenceReport: insufficientEvidenceReport(wordCount) } : {}),
        evidenceVerified: false,
      });
    } else {
      // "unverified": model bir değer cümlesini kendi sözleriyle yazmış → birebir alıntı değil.
      const valueQuote = plan === "unverified" ? `${topic.body[1].slice(0, -1)}, diyor.` : topic.body[1];
      const sections = sectionsFor(text, [
        { type: "hook", quote: m.hook.text },
        { type: "problem", quote: topic.body[0] },
        { type: "value", quote: valueQuote },
        { type: "value", quote: topic.body[2] },
        { type: "cta", quote: cta },
      ]);
      const labels = [
        { key: "topic", value: topic.label, evidence: topic.topicEvidence },
        { key: "tone", value: topic.tone, evidence: topic.body[2] },
      ];
      const checks: QuoteCheckInput[] = [
        { target: "hook", quote: m.hook.text },
        { target: "hook_type", quote: m.hook.evidence },
        ...sections.map((s) => ({ target: "section" as const, key: s.type, quote: s.quote })),
        ...labels.map((l) => ({ target: "label" as const, key: l.key, quote: l.evidence })),
      ];
      const hookSource = modern ? pickHookSource(v2) : undefined;
      const editMetrics = modern ? buildEditMetrics(v2, item.durationSec) : undefined;
      // Yeni (agy) analizde transcript kanallı parçalara da sahiptir; ekran yazısı adedi kurgu ölçümüyle tutarlı.
      if (modern) transcripts[transcripts.length - 1].segments = buildSegments(text, item.durationSec, editMetrics?.onScreenTextCount ?? 0);
      analyses.push({
        ...base,
        status: "ok",
        hookText: m.hook.text,
        hookSource,
        hookType: m.hook.type,
        hookTypeEvidence: m.hook.evidence,
        sections,
        labels,
        editMetrics,
        evidenceVerified: checks.every((c) => text.includes(c.quote)),
        evidenceReport: hookSource ? buildEvidenceReport(text, wordCount, hookSource, checks) : undefined,
      });
    }
    item.hasTranscript = true;
    item.analysisStatus = analyses[analyses.length - 1].status;
  });

  return { transcripts, analyses, topicScreens: buildTopicScreens(v2, clock, picked, items, meta) };
}
