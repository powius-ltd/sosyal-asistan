import { describe, expect, it, vi } from "vitest";

import { fitPrompt, type PromptLayout } from "@/lib/prompt/fit-prompt";
import { FIT_STEPS, MINIMAL_LIMITS, type FitLimits } from "@/lib/prompt/limits";

const length = (text: string) => Array.from(text).length;

/** Sabit bölümleri belli, değişken kısımları `evidenceSize` kadar yer tutan düzen. */
function layout(over: Partial<PromptLayout> = {}, evidenceSize = 0): PromptLayout {
  return {
    role: ["ROL"],
    task: ["## Görev", "1. görev adımı"],
    constraints: ["## Kısıtlar", "- kısıt"],
    before: () => [["## Fikir", "fikir"]],
    evidence: ({ transcriptMax }) => ["## Kanıt", "x".repeat(evidenceSize + transcriptMax)],
    ...over,
  };
}

describe("fitPrompt", () => {
  it("ilk adımda sığıyorsa yalnız bir kez çizer; sıra Rol · Fikir · Kanıt · Görev · Kısıtlar", () => {
    const evidence = vi.fn(() => ["## Kanıt", "k"]);
    const text = fitPrompt(layout({ evidence }), 1000);
    expect(text).toBe(["ROL", "## Fikir\nfikir", "## Kanıt\nk", "## Görev\n1. görev adımı", "## Kısıtlar\n- kısıt"].join("\n\n"));
    expect(evidence).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveBeenCalledWith(FIT_STEPS[0]);
  });

  it("sığmazsa adımları sırayla dener ve sığan ilk çıktıyı döndürür", () => {
    const seen: FitLimits[] = [];
    const evidence = (limits: FitLimits) => {
      seen.push(limits);
      return ["## Kanıt", "x".repeat(limits.transcriptMax + 50)];
    };
    const fixed = fitPrompt(layout({ evidence: () => ["## Kanıt"] }), 10_000);
    // Kanıt başlığından sonra tek satır: transcriptMax 1200 → 1250, 800 → 850, 400 → 450 (tam sığar).
    const text = fitPrompt(layout({ evidence }), length(fixed) + 1 + 450);
    expect(seen).toHaveLength(3);
    expect(seen.map((l) => l.transcriptMax)).toEqual([1200, 800, 400]);
    expect(text).toContain("x".repeat(450));
    expect(text).not.toContain("x".repeat(451));
  });

  it("kısma sırası: transcript → bölümler → kanıt alt yazısı (200→80→0) → hook/script sayısı → kanıt sayısı (5→3)", () => {
    const first = (pick: (l: FitLimits) => boolean) => FIT_STEPS.findIndex(pick);
    const transcriptGone = first((l) => l.transcriptMax === 0);
    const sectionsGone = first((l) => l.sectionCount === 0);
    const caption80 = first((l) => l.captionMax === 80);
    const caption0 = first((l) => l.captionMax === 0);
    const fewerHooks = first((l) => l.hookSuggestions < 5 || l.scriptSteps < 8);
    const fewerEvidence = first((l) => l.evidenceCount < 5);

    expect(FIT_STEPS[0]).toMatchObject({ captionMax: 200, hookSuggestions: 5, scriptSteps: 8, evidenceCount: 5 });
    const order = [transcriptGone, sectionsGone, caption80, caption0, fewerHooks, fewerEvidence];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order, "kesin artan sıra").toEqual([...new Set(order)].sort((a, b) => a - b));
    expect(FIT_STEPS.at(-1)).toBe(MINIMAL_LIMITS);
    expect(MINIMAL_LIMITS.evidenceCount).toBe(3);
  });

  it("her adım öncekinden kısık ya da eşittir (hiçbir alan geri büyümez)", () => {
    const keys = ["transcriptMax", "sectionCount", "sectionQuoteMax", "captionMax", "hookSuggestions", "scriptSteps", "evidenceCount"] as const;
    for (let i = 1; i < FIT_STEPS.length; i++) {
      for (const key of keys) expect(FIT_STEPS[i]![key], `${i}. adım ${key}`).toBeLessThanOrEqual(FIT_STEPS[i - 1]![key]);
    }
  });

  it("son çare: hiçbir adım sığmazsa kesim KANIT bölümünün içinden olur; Rol/Görev/Kısıtlar tam kalır", () => {
    const evidence = () => ["## Kanıt", ...Array.from({ length: 200 }, (_, i) => `satır ${i} ${"y".repeat(40)}`)];
    const text = fitPrompt(layout({ evidence }), 600);
    expect(length(text)).toBeLessThanOrEqual(600);

    const beforeTask = text.slice(0, text.indexOf("## Görev"));
    expect(text.startsWith("ROL\n\n## Fikir\nfikir\n\n## Kanıt\n")).toBe(true);
    expect(beforeTask.trimEnd().endsWith("…")).toBe(true); // kesim Kanıt'ın sonunda, Görev'den önce
    expect(text.endsWith("## Görev\n1. görev adımı\n\n## Kısıtlar\n- kısıt")).toBe(true);
  });

  it("değişken bölümlerin (Fikir) kısılamayan kısmı Kanıt'ı ezmez: sabit bölümler yine tam", () => {
    const text = fitPrompt(layout({ before: () => [["## Fikir", "f".repeat(300)]], evidence: () => ["## Kanıt", "k".repeat(2000)] }), 700);
    expect(length(text)).toBeLessThanOrEqual(700);
    expect(text).toContain("## Görev\n1. görev adımı\n\n## Kısıtlar\n- kısıt");
    expect(text).toContain("f".repeat(300));
  });

  it("kod noktası sayar: emoji ikiye bölünmez", () => {
    const text = fitPrompt(layout({ evidence: () => ["## Kanıt", "😀".repeat(500)] }), 300);
    expect(length(text)).toBeLessThanOrEqual(300);
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // yalnız yüksek vekil yok
  });

  it("sabit bölümlerin kendisi sınıra sığmıyorsa (olağan dışı küçük sınır) sınır yine aşılmaz", () => {
    const text = fitPrompt(layout(), 20);
    expect(length(text)).toBeLessThanOrEqual(20);
    expect(text.endsWith("…")).toBe(true);
  });

  it("geçersiz sınırda boş metin", () => {
    expect(fitPrompt(layout(), 0)).toBe("");
  });
});
