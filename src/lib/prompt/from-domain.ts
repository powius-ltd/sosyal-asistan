/**
 * Alan modellerinden (`ContentDetail`, `Idea`) prompt girdisine çeviri. SAF. Depoyu bilmez: sunucu aksiyonu okur, buraya verir.
 *
 * Kural: hook alıntısı ve bölümler yalnız `ok` VE kanıtı doğrulanmış (`evidenceVerified`) analizden alınır; doğrulanamamış
 * alıntı "birebir alıntı" diye sunulmaz (hook kütüphanesiyle aynı kapsam kuralı).
 */
import type { ContentDetail } from "@/lib/domain/content";
import type { Idea, IdeaEvidence } from "@/lib/domain/intel";
import type { PromptIdea, PromptTranscript, PromptVideo } from "@/lib/prompt/types";

function transcriptOf(transcript: ContentDetail["transcript"]): PromptTranscript {
  if (!transcript || !transcript.isMeaningful) return { state: "none" };
  return transcript.text === undefined ? { state: "expired" } : { state: "available", text: transcript.text };
}

/** Tam içerik detayından kanıt video (izlenme, baz çizgisi, hook, bölümler, transcript dahil). */
export function videoFromDetail(detail: ContentDetail): PromptVideo {
  const { item, analysis, baseline } = detail;
  const verified = analysis?.status === "ok" && analysis.evidenceVerified ? analysis : undefined;

  return {
    ownerHandle: item.owner.handle,
    isOwn: item.owner.kind === "own",
    platform: item.platform,
    format: item.format,
    views: item.metrics.views,
    viewsKind: item.metrics.viewsKind ?? item.score.viewsKind,
    lift: item.score.lift,
    baselineViews: item.score.baselineViews,
    baselineN: item.score.baselineN,
    lowConfidence: item.score.lowConfidence,
    immature: item.score.immature,
    liftUnmeasuredReason: baseline.unmeasuredReason,
    caption: item.caption,
    url: item.url,
    hookText: verified?.hookText,
    hookType: verified?.hookType,
    sections: verified?.sections ?? [],
    transcript: transcriptOf(detail.transcript),
  };
}

/**
 * Kanıt özetinden (içerik detayı okunamadığında: silinmiş ya da erişilemeyen içerik) asgari kanıt video. Yalnız özetin
 * bildiği alanlar dolar; izlenme, baz çizgisi ve transcript bilinmiyor kalır.
 */
export function videoFromEvidence(evidence: IdeaEvidence): PromptVideo {
  return {
    ownerHandle: evidence.ownerHandle,
    platform: evidence.platform,
    format: evidence.format,
    lift: evidence.currentLift,
    caption: evidence.caption,
    url: evidence.url,
    hookType: evidence.hookType,
    sections: [],
    transcript: { state: "none" },
  };
}

export function ideaForPrompt(idea: Idea): PromptIdea {
  return {
    title: idea.title,
    rationale: idea.rationale,
    platform: idea.platform,
    format: idea.format,
    hooks: idea.hooks,
    hookType: idea.hookType,
    scriptOutline: idea.scriptOutline,
  };
}
