import type { AnalysisBackend, ContentAnalysis } from "@/lib/domain/intel";

const BACKEND_LABEL: Record<AnalysisBackend, string> = {
  agy: "Antigravity (agy)",
  "gemini-api": "Gemini API",
  claude_frames: "Claude (kareler + Whisper)",
};

/** Analizin künyesi (küçük yazı): arka uç, model, taksonomi ve istem sürümü. Bilinmeyen arka uç olduğu gibi yazılır. */
export function analysisMetaText(analysis: Pick<ContentAnalysis, "backend" | "model" | "taxonomyVersion" | "promptVersion">): string {
  const parts = [
    analysis.backend ? `Arka uç: ${BACKEND_LABEL[analysis.backend] ?? analysis.backend}` : undefined,
    analysis.model ? `Model: ${analysis.model}` : undefined,
    `Taksonomi ${analysis.taxonomyVersion}`,
    `İstem ${analysis.promptVersion}`,
  ];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function AnalysisMeta({ analysis }: { analysis: ContentAnalysis }) {
  return <p className="border-t pt-3 text-xs text-muted-foreground">{analysisMetaText(analysis)}</p>;
}
