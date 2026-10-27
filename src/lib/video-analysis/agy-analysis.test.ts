import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { DEFAULT_AGY_MODEL, emptyStats, type AgyConfig } from "@/lib/video-analysis/agy-client";
import { analyzeWithAgy, parseAgyResponse, SCHEMA_FILE_NAME } from "@/lib/video-analysis/agy-analysis";
import { agyEnvelope, makeBaseDir, noSleep, validOutput } from "@/lib/video-analysis/test-support";

const base = makeBaseDir();
afterAll(() => base.cleanup());

const CONFIG: AgyConfig = { bin: "agy", model: DEFAULT_AGY_MODEL, timeoutMs: 360_000 };

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(base.dir, "ag-"));
});

const input = () => ({ dir, fileName: "video.mp4", caption: "Comment RENEW", durationSec: 9 });

describe("parseAgyResponse", () => {
  it("GERÇEK agy 1.2.14 zarfı: structured_output nesnesi okunur, usage çıkarılır", () => {
    const parsed = parseAgyResponse(agyEnvelope(validOutput(), "real"));
    expect(parsed.ok).toBe(true);
    expect(parsed.usage).toEqual({ inputTokens: 30508, outputTokens: 23280, totalTokens: 53788, thinkingTokens: 22779 });
    // Toplam = giriş + çıkış: düşünme token'ları çıkışın içindedir (ayrıca eklenmez).
    expect((parsed.usage.inputTokens ?? 0) + (parsed.usage.outputTokens ?? 0)).toBe(parsed.usage.totalTokens);
  });

  it("structured_output varsa response metninden ÖNCELİKLİDİR (response bozuk olsa da)", () => {
    const envelope = JSON.parse(agyEnvelope(validOutput(), "real"));
    envelope.response = "bozuk metin, JSON değil";
    expect(parseAgyResponse(JSON.stringify(envelope)).ok).toBe(true);
  });

  it("structured_output şemaya uymuyorsa düzeltme turuna girecek sorunlar döner", () => {
    const envelope = JSON.parse(agyEnvelope(validOutput(), "real"));
    envelope.structured_output.hookType = "clickbait";
    const parsed = parseAgyResponse(JSON.stringify(envelope));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems).toContain("hookType");
  });

  it("usage yoksa tanımsız kalır (0 değil)", () => {
    expect(parseAgyResponse(agyEnvelope(validOutput(), "fenced")).usage).toEqual({});
  });

  it("çitli zarf: response ```json … ``` içinde metin", () => {
    const parsed = parseAgyResponse(agyEnvelope(validOutput(), "fenced"));
    expect(parsed.ok).toBe(true);
  });

  it("çitsiz zarf", () => {
    expect(parseAgyResponse(agyEnvelope(validOutput(), "plain")).ok).toBe(true);
  });

  it("zarfta response doğrudan nesne (--json-schema zorlaması)", () => {
    expect(parseAgyResponse(agyEnvelope(validOutput(), "object")).ok).toBe(true);
  });

  it("zarf yoksa stdout'un kendisi yanıttır (çitli ya da düz)", () => {
    expect(parseAgyResponse(JSON.stringify(validOutput())).ok).toBe(true);
    expect(parseAgyResponse(`İşte sonuç:\n\`\`\`json\n${JSON.stringify(validOutput())}\n\`\`\``).ok).toBe(true);
  });

  it("şema hatası: zod sorunları düzeltme turu için hazır metin olarak döner", () => {
    const parsed = parseAgyResponse(agyEnvelope(validOutput({ hookType: "clickbait" as never })));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.problems).toContain("hookType");
      expect(parsed.responseText).toContain("clickbait");
    }
  });

  it("JSON olmayan yanıt: sebep döner", () => {
    const parsed = parseAgyResponse(JSON.stringify({ status: "success", response: "Üzgünüm, videoyu açamadım." }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems).toMatch(/JSON/);
  });

  it("boş yanıt: sebep döner", () => {
    expect(parseAgyResponse("").ok).toBe(false);
    expect(parseAgyResponse(JSON.stringify({ status: "success", response: "" })).ok).toBe(false);
  });
});

describe("analyzeWithAgy", () => {
  it("tek çağrıda geçerli yanıtı döndürür; şema dosyasını çağrı sırasında klasörde bulundurur", async () => {
    let schemaSeen = "";
    const fake = createFakeSubprocess((options) => {
      const schemaPath = options.args?.[options.args.indexOf("--json-schema") + 1] as string;
      expect(path.basename(schemaPath)).toBe(SCHEMA_FILE_NAME);
      expect(existsSync(schemaPath)).toBe(true);
      schemaSeen = readFileSync(schemaPath, "utf8");
      return { stdout: agyEnvelope(validOutput()) };
    });
    const stats = emptyStats();
    const output = await analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats);

    expect(output.hookText).toBe("Most people think healing takes years.");
    expect(fake.calls).toHaveLength(1);
    expect(stats).toMatchObject({ calls: 1, retries: 0, correctionTurns: 0, inputTokens: 30508, outputTokens: 23280, totalTokens: 53788, thinkingTokens: 22779 });
    expect(JSON.parse(schemaSeen).type).toBe("object");
    expect(fake.calls[0].input).toContain('"video.mp4"'); // istem dosya adını verir
    expect(fake.calls[0].input).toContain("Comment RENEW"); // açıklama veri bloğunda
  });

  it("turlardan birinde token yoksa toplam bilinmiyordur: kısmi toplam tam sayı gibi yazılmaz", async () => {
    const bad = agyEnvelope(validOutput({ hookType: "clickbait" as never }));
    // İkinci tur zarfsız (çitli) yanıt: usage yok.
    const fake = createFakeSubprocess({ stdout: bad }, { stdout: agyEnvelope(validOutput(), "fenced") });
    const stats = emptyStats();
    await analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats);
    expect(stats).toMatchObject({ calls: 2, correctionTurns: 1 });
    expect([stats.inputTokens, stats.outputTokens, stats.totalTokens, stats.thinkingTokens]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("zod hatasında 1 düzeltme turu: hata geri verilir, ikinci yanıt geçerliyse kabul edilir", async () => {
    const bad = agyEnvelope(validOutput({ hookType: "clickbait" as never }));
    const fake = createFakeSubprocess({ stdout: bad }, { stdout: agyEnvelope(validOutput()) });
    const stats = emptyStats();
    const output = await analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats);

    expect(output.hookType).toBe("bold_claim");
    expect(fake.calls).toHaveLength(2);
    expect(stats).toMatchObject({ calls: 2, correctionTurns: 1, inputTokens: 2 * 30508, outputTokens: 2 * 23280, totalTokens: 2 * 53788 }); // iki çağrının token'ı toplanır
    const correctionPrompt = fake.calls[1].input ?? "";
    expect(correctionPrompt).toContain("CORRECTION");
    expect(correctionPrompt).toContain("hookType"); // formatZodIssues çıktısı
    expect(correctionPrompt).toContain("clickbait"); // önceki yanıt
    expect(correctionPrompt.startsWith(fake.calls[0].input ?? "")).toBe(true); // aynı istem + ek
  });

  it("düzeltme turundan sonra da geçersizse invalid_output (en çok 2 çağrı)", async () => {
    const bad = agyEnvelope(validOutput({ hookType: "clickbait" as never }));
    const fake = createFakeSubprocess({ stdout: bad });
    const stats = emptyStats();
    await expect(analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(fake.calls).toHaveLength(2); // ilk + tek düzeltme; üçüncü yok
    expect(stats.correctionTurns).toBe(1);
  });

  it("JSON olmayan ilk yanıt da düzeltme turuna girer", async () => {
    const fake = createFakeSubprocess({ stdout: JSON.stringify({ status: "success", response: "I cannot open the file." }) }, { stdout: agyEnvelope(validOutput()) });
    const stats = emptyStats();
    await analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats);
    expect(stats.correctionTurns).toBe(1);
  });

  it("kota yeniden denemeleri ve düzeltme turu istatistikte ayrı sayılır", async () => {
    const fake = createFakeSubprocess(
      { exitCode: 3, stderr: "429" },
      { stdout: agyEnvelope(validOutput({ hookType: "clickbait" as never })) },
      { stdout: agyEnvelope(validOutput()) },
    );
    const stats = emptyStats();
    await analyzeWithAgy(input(), { runner: fake.runner, sleep: noSleep, config: CONFIG }, stats);
    expect(stats).toMatchObject({ calls: 3, retries: 1, correctionTurns: 1 });
  });
});
