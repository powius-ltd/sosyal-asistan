import { describe, expect, it } from "vitest";

import { goodOutput, mockFacts, OWN_REF } from "@/lib/agents/chat/test-support";
import { reviewChatOutput, verifyChatOutput } from "@/lib/agents/chat/verify";

const problemsOf = async (patch: Parameters<typeof goodOutput>[0]) => verifyChatOutput(goodOutput(patch), await mockFacts());

describe("sohbet yanıtı doğrulaması", () => {
  it("kanıtlı, belirteçli geçerli yanıt temiz geçer", async () => {
    expect(await problemsOf({})).toEqual([]);
    expect(reviewChatOutput(goodOutput(), await mockFacts())).toBeUndefined();
  });

  it("answer en az bir kanıt ister", async () => {
    expect((await problemsOf({ evidence: [] })).join("\n")).toMatch(/en az bir kanıt/);
  });

  it("bilinmeyen / pakette olmayan / bozuk kanıt ref'i reddedilir", async () => {
    expect((await problemsOf({ evidence: [OWN_REF, "c:ci_uydurma_99"] })).join("\n")).toMatch(/pakette yok: c:ci_uydurma_99/);
    expect((await problemsOf({ evidence: [OWN_REF, "x:123"] })).join("\n")).toMatch(/geçersiz kanıt ref'i/);
    expect((await problemsOf({ evidence: [OWN_REF, "plan:2020-01-06"] })).join("\n")).toMatch(/pakette yok/);
  });

  it("bilinmeyen belirteç reddedilir", async () => {
    expect((await problemsOf({ text: "Videon {lift:c:ci_yok_1} katı izlendi." })).join("\n")).toMatch(/bilinmeyen belirteç/);
    expect((await problemsOf({ text: "Takipçin {g:uydurma_alan}." })).join("\n")).toMatch(/bilinmeyen belirteç/);
  });

  it("ölçülemeyen olgunun belirteci reddedilir (0 yazılmaz)", async () => {
    const facts = await mockFacts();
    const unmeasured = facts.pack.unmeasured[0];
    expect(unmeasured).toBeDefined();
    const problems = verifyChatOutput(goodOutput({ text: `Değer {${unmeasured.key}} oldu.` }), facts);
    expect(problems.join("\n")).toMatch(/ölçülemeyen bir değer/);
  });

  it("belirteç dışı rakam, yüzde, çarpan ve sayı sözcüğü reddedilir", async () => {
    for (const text of ["Üç videon tuttu.", "3 videon tuttu.", "İzlenme %60 arttı.", "Videon 4 kat izlendi.", "Yüzde elli arttı."]) {
      expect((await problemsOf({ text })).join("\n"), text).toMatch(/belirteç dışı/);
    }
  });

  it("belirtecin konusu kanıtta değilse reddedilir (kanıtsız sayı yok)", async () => {
    const problems = await problemsOf({ evidence: ["c:ci_064"] }); // metin ci_048'in lift'ini söylüyor
    expect(problems.join("\n")).toMatch(/kanıtta c:ci_048 yok/);
  });

  it("no_data ve out_of_scope sayı belirteci taşımaz; kanıtsız ve belirteçsiz geçerlidir", async () => {
    for (const kind of ["no_data", "out_of_scope"] as const) {
      expect(await problemsOf({ kind, text: "Bu konuda henüz veri yok.", evidence: [] })).toEqual([]);
      expect((await problemsOf({ kind, text: "Takipçin {g:followers}.", evidence: [] })).join("\n")).toMatch(/belirteci olmaz/);
    }
  });

  it("komut, betik adı ve bağlantı yazılamaz", async () => {
    for (const text of ["Şunu çalıştır: npm run collect:now", "Bak: https://example.com/video", "run_cmd:plan uygula", "www.ornek.com adresine git"]) {
      expect((await problemsOf({ kind: "no_data", text, evidence: [] })).join("\n"), text).toMatch(/komut, betik adı ya da bağlantı/);
    }
  });

  it("rakip alt yazısından alıntı reddedilir; kendi cümlenle anlatmak geçer", async () => {
    const facts = await mockFacts();
    const rival = facts.pack.contents.find((content) => content.side === "rival" && typeof content.caption === "string");
    expect(rival, "mock paketinde alt yazılı rakip videosu olmalı").toBeDefined();
    const words = String(rival?.caption).split(/\s+/).slice(0, 7).join(" ");
    const quoted = verifyChatOutput(goodOutput({ kind: "no_data", text: `Rakip şöyle demiş: ${words}`, evidence: [] }), facts);
    expect(quoted.join("\n")).toMatch(/rakip alt yazısından alıntı/);
    const paraphrased = verifyChatOutput(goodOutput({ kind: "no_data", text: "Rakiplerden biri açılışta bir soruyla başlamış.", evidence: [] }), facts);
    expect(paraphrased).toEqual([]);
  });

  it("düzeltme metni sorunları listeler ve belirteç kuralını hatırlatır", async () => {
    const review = reviewChatOutput(goodOutput({ text: "3 videon tuttu.", evidence: [] }), await mockFacts());
    expect(review).toContain("belirteç dışı rakam");
    expect(review).toContain("en az bir kanıt");
    expect(review).toContain("{ad:konu}");
  });

  it("save_idea: out_of_scope + idea ister; idea başka komutla ya da komutsuz verilmez", async () => {
    const idea = { title: "Mutfak turu", note: "Evimin mutfağını gezdireceğim." };
    const base = { kind: "out_of_scope" as const, text: "Fikrini not alıyorum.", evidence: [] };
    expect(await problemsOf({ ...base, command: "save_idea", idea })).toEqual([]);
    expect((await problemsOf({ ...base, command: "save_idea" })).join("\n")).toMatch(/idea \(title, note\) gerekir/);
    expect((await problemsOf({ ...base, idea })).join("\n")).toMatch(/idea yalnız/);
    expect((await problemsOf({ ...base, command: "delegate", idea })).join("\n")).toMatch(/idea yalnız/);
    expect((await problemsOf({ command: "save_idea", idea })).join("\n")).toMatch(/command yalnız out_of_scope/);
  });
});
