/** Yalnız testler için: en az alanla `ContentAnalysis` (mock depoya bağımlı olmadan). */
import type { ContentAnalysis, EditMetrics, EvidenceReport } from "@/lib/domain/intel";

export function testAnalysis(overrides: Partial<ContentAnalysis> = {}): ContentAnalysis {
  return {
    id: "an_1",
    contentItemId: "ci_1",
    status: "ok",
    hookText: "Sabah kahveni yanlış içiyorsun.",
    hookSource: "speech",
    hookType: "mistake_warning",
    hookTypeEvidence: "yanlış içiyorsun",
    sections: [
      { type: "hook", quote: "Sabah kahveni yanlış içiyorsun.", startSec: 0 },
      { type: "story", quote: "Üç yıl boyunca ben de aynısını yaptım." },
    ],
    labels: [
      { key: "topic", value: "sabah rutini", evidence: "Sabah kahveni" },
      { key: "frame", value: "practical", evidence: "şunu dene" },
    ],
    evidenceVerified: true,
    taxonomyVersion: "2026-10-v1",
    promptVersion: "video-v2",
    model: "gemini-3.8-flash-medium",
    backend: "agy",
    createdAt: "2026-09-30T10:00:00.000Z",
    ...overrides,
  };
}

export const FULL_EDIT_METRICS: EditMetrics = {
  cutCount: 14,
  avgShotSec: 2.4,
  cutsPerMinute: 25,
  tempo: "fast",
  onScreenTextCount: 3,
  onCameraSpeaker: true,
  hasMusic: false,
  hasBurnedCaptions: true,
};

export function testEvidenceReport(overrides: Partial<EvidenceReport> = {}): EvidenceReport {
  return {
    verified: true,
    corpusWords: 64,
    insufficientData: false,
    hookChannel: "speech",
    checked: 6,
    passed: 6,
    failures: [],
    ...overrides,
  };
}
