import { describe, expect, it } from "vitest";

import { commandAction, contentEntry } from "@/lib/agents/analyst/facts-entries";
import { assembleFacts } from "@/lib/agents/analyst/facts-pack";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { buildBriefingItems } from "@/lib/agents/analyst/items";
import { ANALYST_OUTPUT_SCHEMA, type AnalystItemOutput } from "@/lib/agents/analyst/schema";
import { TEST_ACCOUNT } from "@/lib/agents/analyst/test-support";
import { TokenTable } from "@/lib/agents/analyst/tokens";
import { reviewAnalystOutput, verifyAnalystOutput } from "@/lib/agents/analyst/verify";
import { briefingItemSchema } from "@/lib/data/briefing-schema";

function makeFacts(): BriefingFacts {
  const tokens = new TokenTable();
  tokens.addGlobal("followers", "int", 1446);
  tokens.addGlobal("followers_delta", "signed", undefined, "takipçi ölçümü yok");
  tokens.addGlobal("views", "int", 16625, "ölçülemedi", "low");
  const entries = [
    contentEntry({ id: "ci_a", handle: "rakip", isOwn: false, caption: "Kısa açıklama", lift: 4.62, views: 21112, baselineN: 12 }, tokens, 1),
    contentEntry({ id: "ci_b", handle: "ben", isOwn: true, baselineN: 12 }, tokens, 2), // lift ölçülemedi
  ];
  return assembleFacts({
    accountType: "business",
    account: TEST_ACCOUNT,
    weekday: "Salı",
    numbers: { followers: 1446, views: 16625 },
    entries,
    commands: [commandAction("plan")],
    tokens,
    basis: { analyzedCount: 3, labeledCount: 2 },
  });
}

const item = (patch: Partial<AnalystItemOutput> = {}): AnalystItemOutput => ({
  kind: "changed",
  headline: "Bir rakip videosu tuttu",
  body: "Video normalinin {lift:c:ci_a} izlendi.",
  evidence: ["c:ci_a"],
  ...patch,
});
const problemsOf = (...items: AnalystItemOutput[]) => verifyAnalystOutput({ items }, makeFacts());

describe("verifyAnalystOutput: geçerli çıktı", () => {
  it("belirteç + pakette olan ref/eylem → sorun yok; sayılar yerleştirilir", () => {
    const facts = makeFacts();
    const output = {
      items: [item({ body: "Video normalinin {lift:c:ci_a} izlendi; takipçin {g:followers}.", actionId: "open_video:c:ci_a" }), item({ kind: "next_step", actionId: "run_cmd:plan" })],
    };
    expect(verifyAnalystOutput(output, facts)).toEqual([]);
    expect(reviewAnalystOutput(output, facts)).toBeUndefined();
    const built = buildBriefingItems(output, facts);
    expect(built[0].body).toBe("Video normalinin 4,6 katı izlendi; takipçin 1.446.");
    expect(built[0].action).toEqual({ type: "open_video", label: "Videoyu aç", target: "c:ci_a", spendsMoney: false });
    expect(built[1].action).toMatchObject({ type: "run_cmd", commandId: "plan" });
    // Son çıktı S0'ın katı madde şemasından geçer (yazan ve okuyan aynı kural).
    for (const finalItem of built) expect(briefingItemSchema.safeParse(finalItem).success).toBe(true);
  });
});

describe("verifyAnalystOutput: reddedilenler", () => {
  it("bilinmeyen kanıt ref'i ve biçimsiz ref", () => {
    expect(problemsOf(item({ body: "Metin.", evidence: ["c:yok"] }))).toEqual([expect.stringContaining("kanıt ref'i pakette yok: c:yok")]);
    expect(problemsOf(item({ body: "Metin.", evidence: ["foo"] }))[0]).toContain('geçersiz kanıt ref\'i "foo"');
  });

  it("bilinmeyen belirteç (paketteki olgu değil)", () => {
    expect(problemsOf(item({ body: "Video {lift:c:yok} aldı." }))[0]).toContain("bilinmeyen belirteç {lift:c:yok}");
    expect(problemsOf(item({ headline: "Takipçi {g:yok}" }))[0]).toContain("bilinmeyen belirteç {g:yok}");
  });

  it.each([
    ["çarpan", "Video 3x aldı."],
    ["yüzde", "Etkileşim %60 arttı."],
    ["kat", "Normalin 4 kat üstünde."],
    ["düz rakam", "Haftada 5 video çekildi."],
    ["sayı sözcüğü", "Üç video tuttu."],
  ])("belirteç dışı sayı: %s", (_name, body) => {
    const problems = problemsOf(item({ body }));
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem).toMatch(/^madde 1: body: belirteç dışı/);
  });

  it("başlıktaki belirteç dışı rakam da reddedilir", () => {
    expect(problemsOf(item({ headline: "5 video tuttu" }))[0]).toContain("headline: belirteç dışı rakam");
  });

  it("değeri ölçülemeyen olgunun belirteci (ref'li ve genel)", () => {
    expect(problemsOf(item({ body: "Videom {lift:c:ci_b} aldı.", evidence: ["c:ci_b"] }))[0]).toContain("{lift:c:ci_b} ölçülemeyen bir değer");
    expect(problemsOf(item({ body: "Takipçi farkı {g:followers_delta}." }))[0]).toContain("takipçi ölçümü yok");
  });

  it("ref'li belirtecin konusu maddenin kanıtında olmalı", () => {
    expect(problemsOf(item({ evidence: ["c:ci_b"] }))[0]).toContain("kanıtta c:ci_a yok");
  });

  it("pakette olmayan eylem kimliği; next_step eylemsiz olamaz", () => {
    expect(problemsOf(item({ actionId: "open_video:c:yok" }))[0]).toContain('eylem kimliği pakette yok: "open_video:c:yok"');
    expect(problemsOf(item({ actionId: "run_cmd:collect" }))[0]).toContain("pakette yok"); // komut sunulmadı → seçilemez
    expect(problemsOf(item({ kind: "next_step" }))[0]).toContain("next_step maddesi actionId ister");
    expect(problemsOf(item({ kind: "next_step", actionId: "run_cmd:plan" }))).toEqual([]);
  });

  it("lift belirteci zaten çarpandır (\"4,6 katı\"): ardına \"kat\" eklenemez (\"4,6 katı katı\")", () => {
    expect(problemsOf(item({ body: "Video {lift:c:ci_a} katı aldı." }))[0]).toContain('ardına "kat" ekleme');
    expect(problemsOf(item({ body: "Video {lift:c:ci_a}kat aldı." }))[0]).toContain('ardına "kat" ekleme');
    expect(problemsOf(item({ body: "Video normalinin {lift:c:ci_a} izlendi; kat kat." }))).toEqual([]);
  });

  it("kapanmayan belirteç; yerleştirilince sınırı aşan metin", () => {
    expect(problemsOf(item({ body: "Video {lift:c:ci_a üstünde." }))[0]).toContain("bozuk belirteç");
    expect(problemsOf(item({ body: "a".repeat(501) }))[0]).toContain("500 karakteri aşıyor");
  });

  it("sorunlar madde numarasıyla listelenir; düzeltme metni modele kural hatırlatır", () => {
    const output = { items: [item(), item({ evidence: ["c:yok"] })] };
    const review = reviewAnalystOutput(output, makeFacts());
    expect(review).toContain("madde 2: kanıt ref'i pakette yok: c:yok");
    expect(review).not.toContain("madde 1:");
    expect(review).toContain("{ad:konu}");
  });
});

describe("şema: katı çıktı", () => {
  it("ajan güven/eylem metni/sayı alanı yazamaz (bilinmeyen alan reddedilir); 0 ve 6 madde reddedilir", () => {
    const withExtra = (extra: Record<string, unknown>) => ANALYST_OUTPUT_SCHEMA.safeParse({ items: [{ ...item(), ...extra }] }).success;
    expect(withExtra({})).toBe(true);
    expect(withExtra({ confidence: "high" })).toBe(false);
    expect(withExtra({ lift: 3 })).toBe(false);
    expect(ANALYST_OUTPUT_SCHEMA.safeParse({ items: [] }).success).toBe(false);
    expect(ANALYST_OUTPUT_SCHEMA.safeParse({ items: Array.from({ length: 6 }, () => item()) }).success).toBe(false);
    expect(ANALYST_OUTPUT_SCHEMA.safeParse({ items: [item()], note: "x" }).success).toBe(false);
  });
});

describe("buildBriefingItems: güveni KOD hesaplar", () => {
  it("kanıt ref'lerinin en zayıfı; tek video güveni en çok orta; genel sayının örnek güveni de sınırlar", () => {
    const facts = makeFacts();
    const [single, weakest, capped, deduped] = buildBriefingItems(
      {
        items: [
          item({ evidence: ["c:ci_a"] }), // baz çizgisi 12 ama tek video → orta
          item({ evidence: ["c:ci_a", "c:ci_b"], body: "Metin." }), // ci_b lift ölçülemedi → düşük
          item({ body: "İzlenmen {g:views}.", evidence: ["c:ci_a"] }), // views düşük örnekli sayı → düşük
          item({ evidence: ["c:ci_a", "c:ci_a"] }),
        ],
      },
      facts,
    );
    expect(single.confidence).toBe("medium");
    expect(weakest.confidence).toBe("low");
    expect(capped.confidence).toBe("low");
    expect(deduped.evidence).toEqual(["c:ci_a"]);
  });
});
