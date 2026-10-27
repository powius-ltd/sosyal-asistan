import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import type { ContentDetail } from "@/lib/domain/content";
import { buildContentPrompt } from "@/lib/prompt/build-content-prompt";
import { buildIdeaPrompt } from "@/lib/prompt/build-idea-prompt";
import { ideaForPrompt, videoFromDetail, videoFromEvidence } from "@/lib/prompt/from-domain";
import { MAX_EVIDENCE_VIDEOS, PROMPT_MAX_CHARS } from "@/lib/prompt/limits";
import { PROMPT_LANGUAGES } from "@/lib/prompt/types";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const repo = createMockRepository();

async function detailsWithAnalysis(): Promise<ContentDetail[]> {
  const page = await repo.listContent(WS, { limit: 200 });
  const details = await Promise.all(page.items.map((item) => repo.getContent(WS, item.id)));
  return details.filter((d): d is ContentDetail => d !== null);
}

describe("videoFromDetail", () => {
  it("kanıtı doğrulanmış analizden hook + bölümler; skor alanları içerikten gelir", async () => {
    const detail = (await detailsWithAnalysis()).find((d) => d.analysis?.status === "ok" && d.analysis.evidenceVerified);
    expect(detail).toBeDefined();
    const video = videoFromDetail(detail!);
    expect(video.ownerHandle).toBe(detail!.item.owner.handle);
    expect(video.isOwn).toBe(detail!.item.owner.kind === "own");
    expect(video.lift).toBe(detail!.item.score.lift);
    expect(video.hookText).toBe(detail!.analysis!.hookText);
    expect(video.sections).toEqual(detail!.analysis!.sections);
  });

  it("analizi olmayan içerikte hook yok (uydurulmaz)", async () => {
    const detail = (await detailsWithAnalysis()).find((d) => d.analysis === undefined);
    expect(detail).toBeDefined();
    const video = videoFromDetail(detail!);
    expect(video.hookText).toBeUndefined();
    expect(video.hookType).toBeUndefined();
    expect(video.sections).toEqual([]);
  });

  it("kanıtı doğrulanamayan analizin hook'u 'birebir alıntı' olarak geçmez", async () => {
    const base = (await detailsWithAnalysis()).find((d) => d.analysis?.status === "ok")!;
    const detail: ContentDetail = { ...base, analysis: { ...base.analysis!, evidenceVerified: false } };
    expect(videoFromDetail(detail).hookText).toBeUndefined();
  });

  it("transcript durumları: metin var / süresi doldu / anlamsız-yok", async () => {
    const base = (await detailsWithAnalysis()).find((d) => d.transcript?.text !== undefined)!;
    expect(videoFromDetail(base).transcript).toEqual({ state: "available", text: base.transcript!.text });
    expect(videoFromDetail({ ...base, transcript: { ...base.transcript!, text: undefined } }).transcript).toEqual({
      state: "expired",
    });
    expect(videoFromDetail({ ...base, transcript: { ...base.transcript!, isMeaningful: false } }).transcript).toEqual({
      state: "none",
    });
    expect(videoFromDetail({ ...base, transcript: undefined }).transcript).toEqual({ state: "none" });
  });
});

describe("mock veriyle uçtan uca prompt", () => {
  it("her içerik için iki dilde prompt: sınır içinde, undefined/NaN sızıntısı yok, kaynak hesap var", async () => {
    for (const detail of await detailsWithAnalysis()) {
      for (const language of PROMPT_LANGUAGES) {
        const text = buildContentPrompt({
          video: videoFromDetail(detail),
          nicheBrief: "Örnek niş tanımı",
          complianceRegion: "TR_US",
          language,
        });
        expect(Array.from(text).length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
        expect(text).not.toMatch(/undefined|NaN|\[object|Infinity/);
        expect(text).toContain(`@${detail.item.owner.handle}`);
      }
    }
  });

  it("her fikir için iki dilde prompt: kanıt videolar (≤5) ve fikir başlığı", async () => {
    const ideas = await repo.listIdeas(WS, {});
    expect(ideas.length).toBeGreaterThan(0);
    for (const idea of ideas) {
      const evidence = await Promise.all(
        idea.evidence.slice(0, MAX_EVIDENCE_VIDEOS).map(async (e) => {
          const detail = await repo.getContent(WS, e.contentItemId);
          return detail ? videoFromDetail(detail) : videoFromEvidence(e);
        }),
      );
      for (const language of PROMPT_LANGUAGES) {
        const text = buildIdeaPrompt({
          idea: ideaForPrompt(idea),
          evidence,
          nicheBrief: undefined,
          complianceRegion: "TR",
          language,
        });
        expect(Array.from(text).length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
        expect(text).not.toMatch(/undefined|NaN|\[object|Infinity/);
        expect(text).toContain(idea.title.slice(0, 30));
        expect(text.match(/^### /gm)).toHaveLength(evidence.length);
      }
    }
  });
});

describe("videoFromEvidence", () => {
  it("özetin bilmediği alanlar 'bilinmiyor' kalır (izlenme/baz çizgisi yok, 0 değil)", async () => {
    const idea = (await repo.listIdeas(WS, {}))[0];
    const video = videoFromEvidence(idea.evidence[0]);
    expect(video.views).toBeUndefined();
    expect(video.baselineViews).toBeUndefined();
    expect(video.transcript).toEqual({ state: "none" });
    const text = buildContentPrompt({ video, complianceRegion: "TR", language: "tr" });
    expect(text).toContain("- İzlenme: bilinmiyor");
  });
});
