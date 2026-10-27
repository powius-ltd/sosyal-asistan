/**
 * Sözleşme süiti test verisi (2/3): transcript, içerik analizi (ok+doğrulanmış / başarısız / yetersiz veri), fikirler +
 * kanıtları. Hook metni ve tüm kanıt alıntıları transcript'ten BİREBİR alınır (`evidence_verified` doğru olsun);
 * `search_key` uygulamanın yazacağı gibi `foldTurkish(hook + hesap + tür etiketi)`dir.
 */
import { randomUUID } from "node:crypto";

import { hookTypeLabel } from "@/lib/domain/hook-types";
import { foldTurkish } from "@/lib/text";
import { DAY_MS } from "@/lib/time";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { SeedItem } from "@/lib/data/supabase/testing/seed-content";

interface Script {
  hook: string;
  body: string;
  hookType: string;
  topic: string;
  cta: string;
}

const SCRIPTS: Script[] = [
  {
    hook: "Stop scrolling if you feel stuck in your morning routine.",
    body: "Start with five minutes of silence before you touch your phone. Then write down three things you want to feel today.",
    hookType: "mistake_warning",
    topic: "morning routine",
    cta: "Try it tomorrow and tell me what happens.",
  },
  {
    hook: "Why do successful women never talk about this?",
    body: "They protect their energy before they protect their calendar. Every yes is a no to something you actually want.",
    hookType: "question",
    topic: "energy",
    cta: "Save this and send it to a friend who needs it.",
  },
  {
    hook: "Three boundaries that changed my business this year.",
    body: "First, no calls before ten. Second, one focus block every single day. Third, one offline evening each week.",
    hookType: "list",
    topic: "boundaries",
    cta: "Comment the word boundaries and I will send you my checklist.",
  },
  {
    hook: "I used to think rest was lazy.",
    body: "Then I burned out twice and finally learned that recovery is part of the work. It changed how I plan my weeks.",
    hookType: "confession",
    topic: "rest",
    cta: "Follow for more honest business talk.",
  },
];

const fullText = (s: Script) => `${s.hook} ${s.body} ${s.cta}`;

export interface IntelSeed {
  transcriptRows: TablesInsert<"transcripts">[];
  analysisRows: TablesInsert<"content_analyses">[];
  /** Konu eleği sonuçları: analizli içerikler niş içi, birkaç rakip videosu niş dışı (`offNicheContentIds`). */
  topicScreenRows: TablesInsert<"content_topic_screens">[];
  /** Seed'in niş dışı işaretlediği içerikler (sözleşme süiti `offNicheContentIds` seçeneği: eleme sonucu depo üzerinden yazılamaz). */
  offNicheContentIds: string[];
  ideaRows: TablesInsert<"ideas">[];
  evidenceRows: TablesInsert<"idea_evidence">[];
  /** Fikir kimlikleri (durum sırası: new, saved, published). */
  ideaIds: string[];
}

const top = (items: SeedItem[], handle: string, rank = 0) =>
  items
    .filter((i) => i.owner.handle === handle && i.views !== undefined)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[rank];

const newest = (items: SeedItem[], handle: string, rank: number) =>
  items
    .filter((i) => i.owner.handle === handle && i.views !== undefined && i.format === "short_video")
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[rank];

export function buildIntel(wsId: string, items: SeedItem[], liftOf: Map<string, number | undefined>, now: Date): IntelSeed {
  const transcriptRows: TablesInsert<"transcripts">[] = [];
  const analysisRows: TablesInsert<"content_analyses">[] = [];
  const at = new Date(now.getTime() - DAY_MS).toISOString();

  const ok: [SeedItem | undefined, Script][] = [
    [newest(items, "test.hesap", 1), SCRIPTS[0]],
    [newest(items, "test.hesap", 2), SCRIPTS[3]],
    [top(items, "rakip.bir", 0), SCRIPTS[1]],
    [top(items, "rakip.bir", 1), SCRIPTS[2]],
    [top(items, "rakip.iki", 0), SCRIPTS[0]],
    [top(items, "yoksayilan", 0), SCRIPTS[1]], // yoksayılan rakip: kütüphanede ve tutanlarda görünmemeli
  ];
  for (const [item, script] of ok) {
    if (!item) continue;
    const own = item.owner.kind === "own";
    transcriptRows.push({
      workspace_id: wsId,
      content_item_id: item.id,
      provider: own ? "gemini" : "apify",
      language: "en",
      text: fullText(script),
      segments: [{ start: 0, end: 3.2, text: script.hook }],
      word_count: fullText(script).split(/\s+/).length,
      is_meaningful: true,
      // Rakip transcript'i 90 gün sonra silinir; kendi içeriğin transcript'i süresiz.
      expires_at: own ? null : new Date(now.getTime() + 90 * DAY_MS).toISOString(),
    });
    analysisRows.push({
      workspace_id: wsId,
      content_item_id: item.id,
      status: "ok",
      hook_text: script.hook,
      hook_type: script.hookType,
      hook_type_evidence: script.hook,
      sections: [
        { type: "hook", quote: script.hook, startSec: 0 },
        { type: "cta", quote: script.cta, startSec: 18 },
      ],
      labels: [{ key: "topic", value: script.topic, evidence: script.body.split(".")[0] }],
      evidence_verified: true,
      taxonomy_version: "v1",
      prompt_version: "p1",
      model: "test-model",
      search_key: foldTurkish(`${script.hook} ${item.owner.handle} ${hookTypeLabel(script.hookType)}`),
      created_at: at,
    });
  }

  // Başarısız analiz (transcript var) ve yetersiz veri (anlamsız transcript): hook kütüphanesine girmez.
  const failed = top(items, "rakip.uc", 0);
  if (failed) {
    transcriptRows.push({
      workspace_id: wsId,
      content_item_id: failed.id,
      provider: "apify",
      language: "en",
      text: fullText(SCRIPTS[2]),
      word_count: 30,
      is_meaningful: true,
      expires_at: new Date(now.getTime() + 90 * DAY_MS).toISOString(),
    });
    analysisRows.push({
      workspace_id: wsId,
      content_item_id: failed.id,
      status: "failed",
      failure_reason: "Model geçerli JSON döndürmedi.",
      sections: [],
      labels: [],
      evidence_verified: false,
      taxonomy_version: "v1",
      prompt_version: "p1",
      created_at: at,
    });
  }
  const quiet = newest(items, "test.hesap2", 0);
  if (quiet) {
    transcriptRows.push({
      workspace_id: wsId,
      content_item_id: quiet.id,
      provider: "gemini",
      language: "en",
      text: "music only",
      word_count: 2,
      is_meaningful: false,
      expires_at: null,
    });
    analysisRows.push({
      workspace_id: wsId,
      content_item_id: quiet.id,
      status: "insufficient_data",
      failure_reason: "Anlamlı konuşma yok (2 kelime).",
      sections: [],
      labels: [],
      evidence_verified: false,
      taxonomy_version: "v1",
      prompt_version: "p1",
      created_at: at,
    });
  }

  // Fikirler: kanıt = tutan rakip içerikleri (≥2 kanıt, 3–5 hook).
  const evidencePool = [top(items, "rakip.bir", 0), top(items, "rakip.bir", 1), top(items, "rakip.iki", 0), top(items, "rakip.uc", 0)].filter((i): i is SeedItem => i !== undefined);
  const ideaIds = [randomUUID(), randomUUID(), randomUUID()];
  const specs: { status: string; title: string; rank: number; hookType: string | null; evidence: SeedItem[] }[] = [
    { status: "new", title: "Sabah rutini için 5 dakika sessizlik", rank: 8.5, hookType: "mistake_warning", evidence: evidencePool.slice(0, 2) },
    { status: "saved", title: "Enerjini takvimden önce koru", rank: 6.2, hookType: "question", evidence: evidencePool.slice(1, 4) },
    { status: "published", title: "Dinlenmek tembellik değil", rank: 3.1, hookType: null, evidence: evidencePool.slice(0, 3) },
  ];
  const ideaRows: TablesInsert<"ideas">[] = specs.map((spec, i) => ({
    id: ideaIds[i],
    workspace_id: wsId,
    status: spec.status,
    title: spec.title,
    rationale: "Aynı kalıp iki farklı rakipte baz çizgisinin 3 katından fazla tuttu.",
    platform: "instagram",
    format: "short_video",
    hook_type: spec.hookType,
    hooks: ["Stop scrolling.", "Nobody tells you this.", "Try this tomorrow."],
    script_outline: ["Hook: soru", "Sorun: enerji kaybı", "Çözüm: 5 dakika sessizlik", "CTA: kaydet"],
    rank_score: spec.rank,
    rank_inputs: { lift: 4.2, novelty: 0.8 },
  }));
  const evidenceRows: TablesInsert<"idea_evidence">[] = specs.flatMap((spec, i) =>
    spec.evidence.map((item) => ({
      idea_id: ideaIds[i],
      content_item_id: item.id,
      workspace_id: wsId,
      lift_at_creation: liftOf.get(item.id) ?? 3,
    })),
  );
  const { topicScreenRows, offNicheContentIds } = buildTopicScreens(wsId, items, analysisRows, now);
  return { transcriptRows, analysisRows, topicScreenRows, offNicheContentIds, ideaRows, evidenceRows, ideaIds };
}

/**
 * Konu eleği: analizli her içerik niş içi. Niş dışı: izlenen rakiplerin en yeni birkaç kısa videosu (analizsiz) + analizi `ok` +
 * doğrulanmış bir rakip videosu (niş dışı içerik hook türü gruplarına da girmemeli). Hepsi pencere içinde ve izlenen rakip sahipli.
 */
function buildTopicScreens(wsId: string, items: SeedItem[], analysisRows: TablesInsert<"content_analyses">[], now: Date) {
  const screenedAt = new Date(now.getTime() - DAY_MS).toISOString();
  const row = (id: string, inNiche: boolean, topic: string): TablesInsert<"content_topic_screens"> => ({
    content_item_id: id,
    workspace_id: wsId,
    in_niche: inNiche,
    topic,
    reason: inNiche ? "Açıklama nişle uyumlu." : "Ana konu niş dışı.",
    prompt_version: "screen-topics-v1",
    model: "test-model",
    screened_at: screenedAt,
  });
  const analyzed = analysisRows.map((a) => a.content_item_id);
  const offNicheContentIds = [
    newest(items, "rakip.uc", 1),
    newest(items, "rakip.iki", 2),
    top(items, "rakip.bir", 1), // analizi ok + doğrulanmış (yukarıdaki `ok` listesi)
  ]
    .filter((item): item is SeedItem => item !== undefined)
    .map((item) => item.id);
  const off = new Set(offNicheContentIds);
  const topicScreenRows = [
    ...analyzed.filter((id) => !off.has(id)).map((id) => row(id, true, "Sabah rutini")),
    ...offNicheContentIds.map((id) => row(id, false, "Kahve tarifi")),
  ];
  return { topicScreenRows, offNicheContentIds };
}
