import { describe, expect, it } from "vitest";

import { findTokens, formatTokenValue, replaceTokens, strayNumberProblems, TokenTable } from "@/lib/agents/analyst/tokens";

describe("belirteç biçimleri", () => {
  it("her biçim lib/format ile tr-TR yerleştirilir", () => {
    const table = new TokenTable();
    table.addGlobal("followers", "int", 1446);
    table.addGlobal("delta", "signed", 120);
    table.addGlobal("loss", "signed", -12);
    table.addGlobal("flat", "signed", 0);
    table.addGlobal("rate", "percent", 0.0304);
    table.addGlobal("usd", "usd", 0.27);
    table.addRef("lift", "c:ci_1", "lift", 4.62);
    table.addRef("score", "c:ci_1", "decimal", 0.8);
    expect(replaceTokens("{g:followers}|{g:delta}|{g:loss}|{g:flat}|{g:rate}|{g:usd}|{lift:c:ci_1}|{score:c:ci_1}", table)).toBe("1.446|+120|-12|0|%3|$0,27|4,6 katı|0,8");
  });

  it("tarih ve süre de belirteçtir: yayından beri \"bugün\" · \"dün\" · \"12 gün önce\"; pencere \"90 gün\"; gelecek/negatif ölçülemez sayılmaz ama yazılmaz", () => {
    const table = new TokenTable();
    for (const [subject, value] of [["a", 0], ["b", 1], ["c", 12]] as const) table.addRef("ago", `c:${subject}`, "days_ago", value);
    table.addGlobal("own_best_window", "days", 90);
    expect(replaceTokens("{ago:c:a}|{ago:c:b}|{ago:c:c}|son {g:own_best_window} içinde", table)).toBe("bugün|dün|12 gün önce|son 90 gün içinde");
    table.addRef("ago", "c:neg", "days_ago", -3);
    expect(formatTokenValue(table.get("ago:c:neg") as never)).toBeUndefined();
  });

  it("çarpan müşteri diliyle yazılır: \"5,9 katı\" (\"5,9x\" değil); çok küçük ve 0 değer de yerleştirilir (liftTimes cümle kurmaz, belirteç düşmez)", () => {
    const table = new TokenTable();
    for (const [subject, value] of [["a", 5.94], ["b", 1], ["c", 0.03], ["d", 0]] as const) table.addRef("lift", `c:${subject}`, "lift", value);
    expect(replaceTokens("{lift:c:a}|{lift:c:b}|{lift:c:c}|{lift:c:d}", table)).toBe("5,9 katı|1,0 katı|0,03 katı|0,00 katı");
    expect(replaceTokens("normalinin {lift:c:a} izlendi", table)).not.toMatch(/\dx/);
  });

  it("0 gerçek ölçümdür (yerleştirilir); ölçülemeyen yerleştirilmez, sebep tutulur", () => {
    const table = new TokenTable();
    table.addGlobal("zero", "int", 0);
    table.addGlobal("missing", "int", undefined, "ölçülmedi");
    table.addGlobal("nan", "int", Number.NaN, "geçersiz");
    expect(replaceTokens("{g:zero}", table)).toBe("0");
    expect(formatTokenValue(table.get("g:missing") ?? { format: "int" })).toBeUndefined();
    expect(() => replaceTokens("{g:missing}", table)).toThrow(/yerleştirilemedi/);
    expect(() => replaceTokens("{g:nope}", table)).toThrow(/yerleştirilemedi/);
    expect(table.unmeasured()).toEqual([
      { key: "g:missing", reason: "ölçülmedi" },
      { key: "g:nan", reason: "geçersiz" },
    ]);
  });

  it("kırpılan olgunun belirteçleri silinir (dropSubjects); genel belirteç kalır", () => {
    const table = new TokenTable();
    table.addGlobal("followers", "int", 5);
    table.addRef("lift", "c:a", "lift", 2);
    table.addRef("lift", "c:b", "lift", 3);
    table.dropSubjects((subject) => subject === "c:a");
    expect(table.get("lift:c:a")).toBeDefined();
    expect(table.get("lift:c:b")).toBeUndefined();
    expect(table.get("g:followers")).toBeDefined();
  });
});

describe("findTokens", () => {
  it("ref'li ve genel belirteçleri sırayla bulur; biçimsizi bulmaz", () => {
    expect(findTokens("a {lift:c:ci_1} b {g:followers} c {rn:cell:sorunu-biliyor:kimlik} {x} { g:y } {lift:c:ci_1")).toEqual([
      { raw: "{lift:c:ci_1}", key: "lift:c:ci_1" },
      { raw: "{g:followers}", key: "g:followers" },
      { raw: "{rn:cell:sorunu-biliyor:kimlik}", key: "rn:cell:sorunu-biliyor:kimlik" },
    ]);
  });
});

describe("strayNumberProblems: belirteç dışı sayı", () => {
  it("belirteç ve rakamsız metin temiz", () => {
    expect(strayNumberProblems("Takipçin {g:followers}, video {lift:c:ci_1} üstünde. Ön matriste bir fırsat var; ikinci video denendi.")).toEqual([]);
  });

  it.each([
    ["3x", "Videon 3x aldı"],
    ["%60", "Etkileşim %60 arttı"],
    ["4 kat", "Normalin 4 kat üstünde"],
    ["rakam", "Haftada 5 video"],
    ["tarih", "2026 başında"],
    ["saat", "Salı 19:00'da"],
    ["yüzde işareti", "Oran % arttı"],
    ["yüzde sözcüğü", "yüzde altmış arttı"],
    ["sayı sözcüğü", "Üç video tuttu"],
    ["sayı sözcüğü (on)", "On rakip var"],
    ["bozuk belirteç", "Takipçin {g:followers"],
    ["bozuk belirteç (boşluk)", "Takipçin { g:followers }"],
    ["Arap-Hint rakamı", "Videon ٣ kat"],
  ])("reddeder: %s", (_name, text) => {
    expect(strayNumberProblems(text).length).toBeGreaterThan(0);
  });

  it("belirtecin içindeki rakam sorun sayılmaz (ref kimliği vb.)", () => {
    expect(strayNumberProblems("{lift:c:ci_12} ve {planned:plan:2026-10-05}")).toEqual([]);
  });
});
