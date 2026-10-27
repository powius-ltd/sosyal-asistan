// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricCards } from "@/components/video/metric-cards";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { VideoSummary } from "@/components/video/video-summary";
import { WhyItWorks } from "@/components/video/why-it-works";
import type { BaselineExplanation, ContentItem } from "@/lib/domain/content";
import type { Transcript } from "@/lib/domain/intel";

// 30 Eyl 2026 22:30 UTC: İstanbul'da (UTC+3) 1 Eki 01:30, Los Angeles'ta (UTC-7) 30 Eyl 15:30.
const AT = "2026-09-30T22:30:00.000Z";

const item = {
  id: "ci_1",
  platform: "instagram",
  format: "short_video",
  owner: { kind: "competitor", id: "cp_1", handle: "kahve", followers: 1000 },
  publishedAt: AT,
  hashtags: [],
  missingFields: [],
  metrics: { capturedAt: AT, views: 10, viewsKind: "ig_play_count" },
  score: { lowConfidence: false, immature: false },
} as unknown as ContentItem;

const baseline = {
  format: "short_video",
  windowSize: 25,
  n: 1,
  lowConfidence: false,
  basis: [{ contentItemId: "b1", views: 5, publishedAt: AT }],
  excluded: { self: 0, otherFormat: 0, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 0 },
} as unknown as BaselineExplanation;

const transcript = { id: "t", contentItemId: "ci_1", text: "Merhaba dünya", wordCount: 2, isMeaningful: false, source: "manual", expiresAt: AT, createdAt: AT } as unknown as Transcript;

describe("video ekranı tarihleri workspace saat dilimiyle", () => {
  it("yayın tarihi ve son ölçüm verilen saat diliminde", () => {
    render(<VideoSummary item={item} timeZone="America/Los_Angeles" />);
    expect(screen.getByText("30 Eyl 2026 15:30")).toBeInTheDocument();
    render(<MetricCards item={item} timeZone="America/Los_Angeles" />);
    expect(screen.getByText(/Son ölçüm: 30 Eyl 2026 15:30/)).toBeInTheDocument();
  });

  it("saat dilimi verilmezse varsayılan (Europe/Istanbul) gün sınırı", () => {
    render(<VideoSummary item={item} />);
    expect(screen.getByText("1 Eki 2026 01:30")).toBeInTheDocument();
  });

  it("baz çizgisi içerik günleri ve transcript saklama bitişi de aynı saat diliminde", () => {
    render(<WhyItWorks score={item.score} baseline={baseline} timeZone="America/Los_Angeles" />);
    // <details> içeriği DOM'da var; gün Los Angeles'ta 30 Eyl.
    expect(screen.getByText("30 Eyl 2026")).toBeInTheDocument();
    render(<TranscriptPanel item={item} transcript={transcript} timeZone="America/Los_Angeles" />);
    expect(screen.getByText(/Saklama bitişi: 30 Eyl 2026/)).toBeInTheDocument();
  });
});
