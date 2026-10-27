import { describe, expect, it } from "vitest";

import { EDIT_METRICS_SCHEMA } from "@/lib/data/analysis-schema";
import { TAXONOMY_VERSION } from "@/lib/domain/intel";
import { DAY_MS } from "@/lib/time";
import { emptyStats } from "@/lib/video-analysis/agy-client";
import { deriveEditMetrics, finalizeAnalysis, type FinalizeInput } from "@/lib/video-analysis/finalize";
import { PROMPT_VERSION } from "@/lib/video-analysis/prompt";
import { NOW, validOutput } from "@/lib/video-analysis/test-support";

function run(overrides: Partial<FinalizeInput> = {}) {
  return finalizeAnalysis({
    contentId: "content-1",
    isCompetitor: true,
    caption: "Comment RENEW for the guide #healing",
    durationSec: 9,
    output: validOutput(),
    now: NOW,
    model: "gemini-3.8-flash-medium",
    stats: emptyStats(),
    ...overrides,
  });
}

describe("finalizeAnalysis — ok", () => {
  it("geçerli çıktı: status ok, evidenceVerified true, sürümler ve arka uç işlenir", () => {
    const result = run();
    expect(result).toMatchObject({
      status: "ok",
      contentId: "content-1",
      backend: "agy",
      model: "gemini-3.8-flash-medium",
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: PROMPT_VERSION,
      evidenceVerified: true,
      durationSec: 9,
    });
    if (result.status !== "ok") throw new Error("ok bekleniyordu");
    expect(result.analysis).toMatchObject({
      hookText: "Most people think healing takes years.",
      hookSource: "speech",
      hookType: "bold_claim",
      hookTypeEvidence: "Most people think healing takes years.",
    });
    expect(result.analysis.sections).toEqual([
      { type: "hook", quote: "Most people think healing takes years.", startSec: 0 },
      { type: "cta", quote: "Comment RENEW for the guide", startSec: 6 },
    ]);
    expect(result.analysis.labels).toHaveLength(2);
    expect(result.analysis.evidenceReport).toMatchObject({ verified: true, insufficientData: false, hookChannel: "speech", failures: [] });
  });

  it("transcript: provider gemini, konuşma metni, kelime sayısı, DB segment biçimi (start/end/channel)", () => {
    const result = run();
    expect(result.transcript).toMatchObject({
      provider: "gemini",
      language: "en",
      text: "Most people think healing takes years. But your body can renew itself in thirty days. Here is how.",
      isMeaningful: true,
    });
    expect(result.transcript.wordCount).toBe(18);
    expect(result.transcript.segments[0]).toEqual({ start: 0, end: 3, text: "Most people think healing takes years.", channel: "speech" });
    // endSec yoksa `end` anahtarı hiç yazılmaz (undefined ≠ 0)
    expect(result.transcript.segments[3]).toEqual({ start: 6, text: "Comment RENEW for the guide", channel: "screen" });
    expect(result.transcript.segments[3]).not.toHaveProperty("end");
  });

  it("ekran yazısı transcript.text'e KARIŞMAZ (kanallar ayrı)", () => {
    expect(run().transcript.text).not.toContain("RENEW");
  });

  it("RAKİP içerikte transcript expiresAt = şimdi + 90 gün", () => {
    const result = run({ isCompetitor: true });
    expect(result.transcript.expiresAt).toBe(new Date(NOW.getTime() + 90 * DAY_MS).toISOString());
  });

  it("KENDİ içerikte expiresAt yok (süresiz)", () => {
    const result = run({ isCompetitor: false });
    expect(result.transcript.expiresAt).toBeUndefined();
    expect(result.transcript).not.toHaveProperty("expiresAt");
  });

  it("hook bulunamazsa analiz yine ok ama evidenceVerified false + rapor sebebi", () => {
    const result = run({ output: validOutput({ hookText: "Something the speaker never said." }) });
    expect(result.status).toBe("ok");
    expect(result.evidenceVerified).toBe(false);
    if (result.status === "ok") expect(result.analysis.evidenceReport.failures[0]).toMatchObject({ target: "hook", failure: "not_found" });
  });

  it("uydurma alıntı (etiket kanıtı) doğrulamayı düşürür", () => {
    const output = validOutput({ labels: [{ key: "topic", value: "healing", evidence: "a quote nobody ever said aloud" }] });
    const result = run({ output });
    expect(result.status).toBe("ok");
    expect(result.evidenceVerified).toBe(false);
  });

  it("hashtag / tek kelime kanıtlı etiket düşürülür, video yine doğrulanır", () => {
    const base = validOutput();
    const output = validOutput({
      labels: [
        ...base.labels,
        { key: "frame", value: "faith", evidence: "#healing" },
        { key: "tone", value: "gentle", evidence: "healing" },
      ],
    });
    const result = run({ output });
    if (result.status !== "ok") throw new Error("ok bekleniyordu");
    expect(result.evidenceVerified).toBe(true);
    expect(result.analysis.labels).toHaveLength(base.labels.length);
  });

  it("hook konuşmanın başında değilse (ilk %25 dışı) doğrulanmaz", () => {
    const output = validOutput({ hookText: "Here is how." }); // konuşmanın sonunda
    const result = run({ output });
    expect(result.evidenceVerified).toBe(false);
    if (result.status === "ok") expect(result.analysis.evidenceReport.failures[0]).toMatchObject({ failure: "outside_first_quarter" });
  });

  it("konuşma yoksa ekran yazısı hook'u (hookSource screen_text) doğrulanır", () => {
    const output = validOutput({
      transcript: [
        { startSec: 0, text: "You are not behind in life", channel: "screen" },
        { startSec: 3, text: "Your timing is perfectly divine today", channel: "screen" },
      ],
      hookText: "You are not behind in life",
      hookSource: "screen_text",
      hookType: "affirmation",
      hookTypeEvidence: "You are not behind in life",
      sections: [{ type: "hook", quote: "You are not behind in life", startSec: 0 }],
      labels: [],
    });
    const result = run({ output, caption: undefined });
    expect(result.status).toBe("ok");
    expect(result.evidenceVerified).toBe(true);
    if (result.status === "ok") {
      expect(result.analysis.hookSource).toBe("screen_text");
      expect(result.analysis.evidenceReport.hookChannel).toBe("screen_text");
      expect(result.transcript.isMeaningful).toBe(false); // konuşma yok → transcript anlamlı değil, ama ekran yazısı 8+ kelime → analiz ok
      expect(result.transcript.text).toBe("");
    }
  });

  it("hook kaynağı yanlış bildirilirse (konuşma denmiş, yalnız ekranda var) doğrulanmaz", () => {
    const output = validOutput({ hookText: "Comment RENEW for the guide", hookSource: "speech" });
    expect(run({ output }).evidenceVerified).toBe(false);
  });

  it("boş hookText: hook alanları yazılmaz, doğrulama başarısız", () => {
    const result = run({ output: validOutput({ hookText: "" }) });
    expect(result.evidenceVerified).toBe(false);
    if (result.status === "ok") {
      expect(result.analysis).not.toHaveProperty("hookText");
      expect(result.analysis).not.toHaveProperty("hookSource");
    }
  });
});

describe("finalizeAnalysis — insufficient_data", () => {
  const silent = validOutput({
    transcript: [{ startSec: 1, text: "Comment RENEW", channel: "screen" }], // toplam 2 kelime
    hookText: "Comment RENEW",
    hookSource: "screen_text",
    hookTypeEvidence: "Comment RENEW",
    sections: [{ type: "cta", quote: "Comment RENEW", startSec: 1 }],
  });

  it("konuşma + ekran yazısı < 8 kelime → insufficient_data; evidenceVerified false", () => {
    const result = run({ output: silent });
    expect(result.status).toBe("insufficient_data");
    expect(result.evidenceVerified).toBe(false);
    if (result.status === "insufficient_data") {
      expect(result.reason).toContain("2 kelime");
      expect(result.reason).toContain("8");
      expect(result.analysis.evidenceReport).toMatchObject({ insufficientData: true, verified: false, corpusWords: 2 });
    }
  });

  it("metinden türeyen alanlar boş; görsel kurgu ölçümleri korunur; transcript dönülür", () => {
    const result = run({ output: silent });
    if (result.status !== "insufficient_data") throw new Error("insufficient_data bekleniyordu");
    expect(result.analysis.sections).toEqual([]);
    expect(result.analysis.labels).toEqual([]);
    expect(result.analysis).not.toHaveProperty("hookText");
    expect(result.analysis).not.toHaveProperty("hookType");
    expect(result.analysis.editMetrics).toMatchObject({ cutCount: 4, tempo: "medium" });
    expect(result.transcript.isMeaningful).toBe(false);
    expect(result.transcript.segments).toHaveLength(1);
  });

  it("tam 8 kelime (konuşma + ekran) yeterlidir; 7 kelime değildir", () => {
    const eight = validOutput({
      transcript: [
        { startSec: 0, text: "one two three four five six", channel: "speech" },
        { startSec: 4, text: "seven eight", channel: "screen" },
      ],
      hookText: "one two three four five six",
      hookTypeEvidence: "one two three four five six",
      sections: [],
      labels: [],
    });
    expect(run({ output: eight, caption: undefined }).status).toBe("ok");
    const seven = validOutput({ ...eight, transcript: [{ startSec: 0, text: "one two three four five six", channel: "speech" }, { startSec: 4, text: "seven", channel: "screen" }] });
    expect(run({ output: seven, caption: undefined }).status).toBe("insufficient_data");
  });

  it("açıklama kelimeleri 8 eşiğine SAYILMAZ (videonun kendi içeriği değil)", () => {
    const result = run({ output: silent, caption: "a very long caption with many many many words in it for sure" });
    expect(result.status).toBe("insufficient_data");
  });

  it("rakip insufficient_data transcript'i de expiresAt taşır", () => {
    expect(run({ output: silent, isCompetitor: true }).transcript.expiresAt).toBeDefined();
  });
});

describe("evidenceVerified kuralı", () => {
  it("yalnız status 'ok' iken true olabilir (insufficient_data/failed asla)", () => {
    const cases = [run(), run({ output: validOutput({ hookText: "uydurma cümle burada" }) }), run({ output: validOutput({ transcript: [] }) })];
    for (const result of cases) {
      if (result.evidenceVerified) expect(result.status).toBe("ok");
      if (result.status !== "ok") expect(result.evidenceVerified).toBe(false);
    }
    expect(cases.map((c) => c.status)).toEqual(["ok", "ok", "insufficient_data"]);
    expect(cases.map((c) => c.evidenceVerified)).toEqual([true, false, false]);
  });
});

describe("deriveEditMetrics", () => {
  it("kesme hızı ve ortalama plan süresi süre + kesme sayısından KODDA hesaplanır", () => {
    const metrics = deriveEditMetrics({ cutCount: 9, tempo: "fast" }, 60);
    expect(metrics).toEqual({ cutCount: 9, tempo: "fast", cutsPerMinute: 9, avgShotSec: 6 });
    expect(EDIT_METRICS_SCHEMA.safeParse(metrics).success).toBe(true);
  });

  it("süre bilinmiyorsa türevler YAZILMAZ (undefined ≠ 0)", () => {
    const metrics = deriveEditMetrics({ cutCount: 9 }, undefined);
    expect(metrics).toEqual({ cutCount: 9 });
    expect(metrics).not.toHaveProperty("cutsPerMinute");
    expect(metrics).not.toHaveProperty("avgShotSec");
  });

  it("kesme sayısı bilinmiyorsa türev yok; 0 kesme (tek plan) ölçülmüş bir değerdir", () => {
    expect(deriveEditMetrics({ tempo: "slow" }, 30)).toEqual({ tempo: "slow" });
    expect(deriveEditMetrics({ cutCount: 0 }, 30)).toEqual({ cutCount: 0, cutsPerMinute: 0, avgShotSec: 30 });
  });

  it("hiç ölçüm yoksa undefined; kesme sayısı tam sayıya yuvarlanır", () => {
    expect(deriveEditMetrics({}, 30)).toBeUndefined();
    expect(deriveEditMetrics({ cutCount: 4.6 }, undefined)).toEqual({ cutCount: 5 });
  });

  it("süre girdisi yoksa modelin bildirdiği süre kullanılır", () => {
    const result = run({ durationSec: undefined, output: validOutput({ durationSec: 30 }) });
    expect(result.durationSec).toBe(30);
    expect(result.status === "ok" && result.analysis.editMetrics?.cutsPerMinute).toBe(8);
  });

  it("süre hiç bilinmiyorsa durationSec alanı yazılmaz", () => {
    const result = run({ durationSec: undefined, output: validOutput({ durationSec: undefined }) });
    expect(result).not.toHaveProperty("durationSec");
  });
});
