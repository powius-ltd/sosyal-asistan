import { describe, expect, it } from "vitest";

import { EVIDENCE_REPORT_SCHEMA } from "@/lib/data/analysis-schema";
import { HOOK_FIRST_PORTION, HOOK_MAX_CHARS, isMeaningfulSpeech, MIN_QUOTE_WORDS, verifyEvidence } from "@/lib/intel/evidence";

const SPEECH =
  "You are not behind in your life. Let me tell you why the quiet mornings matter so much for your energy. " +
  "First, you slow down and breathe. Second, you choose one small practice and keep it simple. " +
  "Third, you notice how your body feels when you stop rushing. If this helps, comment RENEW and I will send you the guide.";

describe("verifyEvidence · hook", () => {
  it("konuşma kaynaklı hook açılışta ve birebir: doğrulanır, kanal speech", () => {
    const report = verifyEvidence({ speech: SPEECH }, { hook: { text: "You are not behind in your life.", source: "speech" } });
    expect(report).toMatchObject({ verified: true, hookChannel: "speech", checked: 1, passed: 1, failures: [], insufficientData: false });
  });

  it("NFKC + tırnak/tire düzleştirme + Türkçe katlama: kopyala-yapıştır farkı alıntıyı bozmaz", () => {
    const speech = "Bugün çok ÖNEMLİ bir şey söyleyeceğim: don’t wait — başla. Bunu ciddiye al çünkü zaman geçiyor ve sen hazırsın artık.";
    const report = verifyEvidence({ speech }, { hook: { text: "bugün çok önemli bir şey söyleyeceğim", source: "speech" }, hookTypeEvidence: "Don't wait - başla" });
    expect(report.verified).toBe(true);
    const caps = verifyEvidence({ speech: "TANİTİM videosu için hazır mısın bugün ve her zaman." }, { hook: { text: "Tanıtım videosu için hazır mısın", source: "speech" } });
    expect(caps.failures).toEqual([]);
  });

  it("konuşmanın ilk %25'inde değil: outside_first_quarter", () => {
    const report = verifyEvidence({ speech: SPEECH }, { hook: { text: "If this helps, comment RENEW and I will send you the guide.", source: "speech" } });
    expect(report.verified).toBe(false);
    expect(report.failures).toEqual([expect.objectContaining({ target: "hook", failure: "outside_first_quarter", found: false })]);
    expect(report.hookChannel).toBeUndefined();
    expect(HOOK_FIRST_PORTION).toBe(0.25);
  });

  it("korpusta yok: not_found; model bir kelimeyi değiştirirse de", () => {
    expect(verifyEvidence({ speech: SPEECH }, { hook: { text: "You are not ahead in your life.", source: "speech" } }).failures[0].failure).toBe("not_found");
  });

  it("200 karakterden uzun hook: too_long (korpusta olsa bile)", () => {
    const long = `${"word ".repeat(45)}end`;
    expect(Array.from(long).length).toBeGreaterThan(HOOK_MAX_CHARS);
    expect(verifyEvidence({ speech: long }, { hook: { text: long, source: "speech" } }).failures[0].failure).toBe("too_long");
    const exactly = "a".repeat(HOOK_MAX_CHARS);
    expect(verifyEvidence({ speech: `${exactly} ${SPEECH}` }, { hook: { text: exactly, source: "speech" } }).failures).toEqual([]);
  });

  it("boş hook: empty; hook hiç verilmezse doğrulama başarısız (başarılı analizin hook'u olur)", () => {
    expect(verifyEvidence({ speech: SPEECH }, { hook: { text: "   ", source: "speech" } }).failures[0].failure).toBe("empty");
    const none = verifyEvidence({ speech: SPEECH }, {});
    expect(none.verified).toBe(false);
    expect(none.failures).toEqual([expect.objectContaining({ target: "hook", failure: "empty" })]);
  });

  it("ekran yazısı ve açıklama kaynaklı hook: konum kuralı yok, yalnız kendi kanalında aranır", () => {
    const corpus = { speech: SPEECH, screenText: "3 signs you are healing\nSign one: you rest without guilt", caption: "Comment RENEW below for the workshop link today" };
    expect(verifyEvidence(corpus, { hook: { text: "3 signs you are healing", source: "screen_text" } })).toMatchObject({ verified: true, hookChannel: "screen_text" });
    expect(verifyEvidence(corpus, { hook: { text: "Comment RENEW below for the workshop link", source: "caption" } })).toMatchObject({ verified: true, hookChannel: "caption" });
    // Konuşmada geçen cümle "ekran yazısı" diye sunulursa kaynak uyuşmazlığı: not_found.
    expect(verifyEvidence(corpus, { hook: { text: "You are not behind in your life.", source: "screen_text" } }).failures[0].failure).toBe("not_found");
  });

  it("kelime sınırı: 'the end' alıntısı 'breathe endlessly' içinde bulunmuş sayılmaz", () => {
    const speech = "Just breathe endlessly and slowly every morning before the day begins and you will feel it.";
    expect(verifyEvidence({ speech }, { hook: { text: "Just breathe endlessly", source: "speech" }, hookTypeEvidence: "the end" }).failures).toEqual([
      expect.objectContaining({ target: "hook_type", failure: "not_found" }),
    ]);
    const partial = verifyEvidence({ speech }, { hook: { text: "Just breathe endlessly", source: "speech" }, sections: [{ type: "cta", quote: "breathe end" }] });
    expect(partial.failures).toEqual([expect.objectContaining({ target: "section", key: "cta", failure: "not_found" })]);
  });
});

describe("verifyEvidence · diğer alıntılar", () => {
  const hook = { text: "You are not behind in your life.", source: "speech" as const };

  it("hook türü kanıtı, bölüm ve etiket alıntıları üç kanalda aranır (konuşma → ekran yazısı → açıklama)", () => {
    const corpus = { speech: SPEECH, screenText: "One small practice, every day", caption: "Workshop link in bio for the circle" };
    const report = verifyEvidence(corpus, {
      hook,
      hookTypeEvidence: "You are not behind",
      sections: [
        { type: "problem", quote: "you notice how your body feels when you stop rushing" },
        { type: "practice", quote: "One small practice, every day" },
        { type: "cta", quote: "Workshop link in bio" },
      ],
      labels: [{ key: "tone", evidence: "keep it simple" }],
    });
    expect(report).toMatchObject({ verified: true, checked: 6, passed: 6, failures: [] });
  });

  it("bulunamayan alıntı doğrulamayı düşürür; yalnız BAŞARISIZLAR rapora girer, sayılar tutarlı", () => {
    const report = verifyEvidence({ speech: SPEECH }, {
      hook,
      sections: [
        { type: "insight", quote: "you choose one small practice and keep it simple" },
        { type: "proof", quote: "science proves this works in seven days" },
      ],
      labels: [{ key: "topic", evidence: "quiet mornings" }],
    });
    expect(report.verified).toBe(false);
    expect([report.checked, report.passed]).toEqual([4, 3]);
    expect(report.failures).toEqual([{ target: "section", key: "proof", quote: "science proves this works in seven days", found: false, failure: "not_found" }]);
  });

  it(`çok kısa alıntı (< ${MIN_QUOTE_WORDS} kelime) kanıt sayılmaz; boş alıntı empty`, () => {
    const report = verifyEvidence({ speech: SPEECH }, {
      hook,
      sections: [{ type: "cta", quote: "the" }],
      labels: [{ key: "tone", evidence: "" }],
    });
    expect(report.failures.map((f) => f.failure)).toEqual(["too_short", "empty"]);
  });

  it("hookTypeEvidence undefined ise denetlenmez (hook türü yok)", () => {
    expect(verifyEvidence({ speech: SPEECH }, { hook }).checked).toBe(1);
  });
});

describe("verifyEvidence · yetersiz veri ve korpus", () => {
  it("konuşma + ekran yazısı < 8 kelime → insufficientData, verified false (alıntılar bulunsa bile)", () => {
    const report = verifyEvidence({ speech: "one two three four five six seven" }, { hook: { text: "one two three", source: "speech" } });
    expect(report).toMatchObject({ insufficientData: true, verified: false, corpusWords: 7 });
    expect(report.failures).toEqual([]);
  });

  it("tam 8 kelime yeterli; ekran yazısı kelimeleri de sayılır", () => {
    expect(verifyEvidence({ speech: "one two three four five six seven eight" }, {}).insufficientData).toBe(false);
    expect(verifyEvidence({ speech: "one two three four", screenText: "five six seven eight" }, {}).corpusWords).toBe(8);
  });

  it("açıklama kelime sayımına girmez (videonun kendi içeriği değil): müzik + uzun açıklama yine yetersiz", () => {
    const report = verifyEvidence({ speech: "♪ ♪ ♪", caption: "a very long caption with many many words about the topic of this video" }, {});
    expect(report.insufficientData).toBe(true);
    expect(report.corpusWords).toBe(0);
  });

  it("korpus boşsa (yalnız undefined) çökmez", () => {
    expect(verifyEvidence({}, { hook: { text: "merhaba dünya", source: "speech" } })).toMatchObject({ verified: false, insufficientData: true });
  });

  it("rapor DB'ye yazılan biçime (zod şeması) uyar", () => {
    const report = verifyEvidence({ speech: SPEECH }, { hook: { text: "If this helps, comment RENEW", source: "speech" }, sections: [{ type: "cta", quote: "no such quote here" }] });
    expect(EVIDENCE_REPORT_SCHEMA.safeParse(JSON.parse(JSON.stringify(report))).success).toBe(true);
  });
});

describe("isMeaningfulSpeech", () => {
  it("≥ 8 kelime anlamlı; müzik/boş/undefined değil", () => {
    expect(isMeaningfulSpeech("one two three four five six seven eight")).toBe(true);
    expect(isMeaningfulSpeech("one two three four five six seven")).toBe(false);
    expect(isMeaningfulSpeech("♪ enstrümantal müzik ♪")).toBe(false);
    expect(isMeaningfulSpeech(undefined)).toBe(false);
  });
});
