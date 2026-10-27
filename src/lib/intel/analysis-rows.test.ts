import { describe, expect, it } from "vitest";

import { unanalyzedResult } from "@/lib/intel/analysis-failures";
import { toAnalysisRow, toTranscriptRow } from "@/lib/intel/analysis-rows";
import type { EvidenceReport } from "@/lib/domain/intel";
import { emptyStats } from "@/lib/video-analysis/agy-client";
import type { AnalyzedTranscript, InsufficientAnalysisResult, OkAnalysisResult } from "@/lib/video-analysis/types";

const ctx = { workspaceId: "ws1", runId: "run1", ownerHandle: "Noelle" };

const report = (verified: boolean, insufficientData = false): EvidenceReport => ({ verified, corpusWords: 40, insufficientData, checked: 3, passed: verified ? 3 : 2, failures: [] });

const transcript = (over: Partial<AnalyzedTranscript> = {}): AnalyzedTranscript => ({
  provider: "gemini",
  language: "en",
  text: "You are not behind in life.",
  wordCount: 6,
  segments: [{ start: 0, end: 2, text: "You are not behind in life.", channel: "speech" }],
  isMeaningful: false,
  ...over,
});

function okResult(over: Partial<OkAnalysisResult> = {}): OkAnalysisResult {
  return {
    status: "ok",
    contentId: "c1",
    backend: "agy",
    model: "gemini-3.8-flash-medium",
    taxonomyVersion: "2026-10-v1",
    promptVersion: "video-analysis-2026-10-v2",
    stats: emptyStats(),
    transcript: transcript(),
    analysis: {
      hookText: "You are not behind in life.",
      hookSource: "speech",
      hookType: "bold_claim",
      hookTypeEvidence: "not behind",
      sections: [{ type: "hook", quote: "You are not behind in life.", startSec: 0 }],
      labels: [{ key: "topic", value: "timing", evidence: "not behind" }],
      evidenceReport: report(true),
    },
    evidenceVerified: true,
    ...over,
  };
}

describe("toAnalysisRow", () => {
  it("ok + doğrulanmış sonuç: hook alanları, run_id, backend ve arama anahtarı yazılır", () => {
    const row = toAnalysisRow(okResult(), ctx);
    expect(row).toMatchObject({ status: "ok", evidence_verified: true, hook_type: "bold_claim", hook_source: "speech", backend: "agy", run_id: "run1", workspace_id: "ws1" });
    expect(row.search_key).toContain("noelle");
    expect(row.edit_metrics).toBeNull(); // ölçülemeyen = NULL (0 değil)
  });

  it("ok ama kanıt doğrulanamadı: evidence_verified false", () => {
    expect(toAnalysisRow(okResult({ evidenceVerified: false }), ctx).evidence_verified).toBe(false);
  });

  it("evidence_verified yalnız status ok iken true olabilir (insufficient_data → false)", () => {
    const insufficient: InsufficientAnalysisResult = {
      status: "insufficient_data",
      contentId: "c2",
      backend: "agy",
      model: "m",
      taxonomyVersion: "2026-10-v1",
      promptVersion: "p",
      stats: emptyStats(),
      reason: "8 kelimeden az",
      transcript: transcript({ text: "", wordCount: 0, segments: [] }),
      analysis: { sections: [], labels: [], editMetrics: { cutCount: 0, hasMusic: true }, evidenceReport: report(false, true) },
      evidenceVerified: false,
    };
    const row = toAnalysisRow(insufficient, ctx);
    expect(row).toMatchObject({ status: "insufficient_data", evidence_verified: false, failure_reason: "8 kelimeden az", sections: [], labels: [] });
    expect(row.hook_text).toBeUndefined();
    expect(row.edit_metrics).toEqual({ cutCount: 0, hasMusic: true }); // 0 gerçek ölçüm: korunur
  });

  it("edit_metrics yoksa NULL, varsa olduğu gibi", () => {
    const withMetrics = okResult();
    withMetrics.analysis.editMetrics = { cutCount: 12, tempo: "fast" };
    expect(toAnalysisRow(withMetrics, ctx).edit_metrics).toEqual({ cutCount: 12, tempo: "fast" });
  });

  it("failed: sebep yazılır, hook/kanıt alanı yok, run_id yoksa NULL", () => {
    const row = toAnalysisRow(unanalyzedResult("c3", "expired_url", "m"), { workspaceId: "ws1", ownerHandle: "x" });
    expect(row).toMatchObject({ status: "failed", evidence_verified: false, run_id: null, sections: [], labels: [] });
    expect(row.failure_reason).toContain("süresi dolmuş");
    expect(row.hook_text).toBeUndefined();
  });
});

describe("toTranscriptRow", () => {
  it("rakipte expires_at (+90 gün motordan), kendi içerikte NULL", () => {
    const rival = toTranscriptRow(transcript({ expiresAt: "2027-01-01T00:00:00.000Z" }), { workspaceId: "ws1", contentId: "c1" });
    expect(rival.expires_at).toBe("2027-01-01T00:00:00.000Z");
    expect(toTranscriptRow(transcript(), { workspaceId: "ws1", contentId: "c1" }).expires_at).toBeNull();
  });

  it("konuşma yoksa text boş dize (NULL değil: metin yalnız süre dolumuyla kaybolur); dil biçime uymazsa NULL", () => {
    const row = toTranscriptRow(transcript({ text: "", wordCount: 0, language: "English (US)" }), { workspaceId: "ws1", contentId: "c1" });
    expect(row.text).toBe("");
    expect(row.language).toBeNull();
    expect(row.provider).toBe("gemini");
  });
});
