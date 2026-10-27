import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { LABEL_ANGLES_KIND, LABEL_BATCH_MAX, labelAngles, PROMPT_VERSION, type LabelAnglesItem } from "@/lib/llm/label-angles";

const SPEECH_1 = "Most women do not realize their mind replays the same old story every single morning. Today I will show you how to rewrite it in ten minutes.";
const SCREEN_2 = "Join my 5 day reset today";
const CAPTION_2 = "Seven clients cut their stress in half after the reset, here is what they said.";

const items: LabelAnglesItem[] = [
  { id: "c1", transcript: SPEECH_1, caption: "Morning mind reset" },
  { id: "c2", screenText: SCREEN_2, caption: CAPTION_2, ctaType: "link_in_bio" },
  { id: "c3", transcript: "Some other talk about gratitude and prayer that never decides anything clearly." },
];

const labeled = (id: string, angleEvidence: string, funnelEvidence: string, extra: Record<string, unknown> = {}) => ({
  id,
  verdict: "labeled",
  angle: "aci-korku",
  funnel_stage: "sorunu-biliyor",
  angle_evidence: angleEvidence,
  funnel_evidence: funnelEvidence,
  ...extra,
});
const unsure = (id: string) => ({ id, verdict: "unsure" });

const good1 = labeled("c1", "their mind replays the same old story", "every single morning");
const good2 = labeled("c2", "Seven clients cut their stress in half", "Join my 5 day reset today", { angle: "sosyal-kanit", funnel_stage: "sicak-musteri" });

describe("labelAngles", () => {
  it("geçerli çıktı: girdi sırasında etiket; alıntı konuşma/ekran yazısı/açıklamadan doğrulanır; unsure satır üretmez", async () => {
    const llm = createFakeLlm({ results: [unsure("c3"), good2, good1] });
    const out = await labelAngles(llm.backend, items);

    expect(out.labels.map((l) => [l.id, l.angle, l.funnelStage, l.evidenceVerified])).toEqual([
      ["c1", "aci-korku", "sorunu-biliyor", true],
      ["c2", "sosyal-kanit", "sicak-musteri", true],
    ]);
    expect(out.unsure).toEqual(["c3"]);
    expect(out.promptVersion).toBe(PROMPT_VERSION);
    expect(out.meta).toMatchObject({ kind: LABEL_ANGLES_KIND, billing: "subscription", attempts: 1 });
  });

  it("metni olmayan içerik modele gitmez (unlabelable); hepsi metinsizse çağrı yapılmaz", async () => {
    const llm = createFakeLlm({ results: [good1] });
    const out = await labelAngles(llm.backend, [items[0], { id: "c9", caption: "  " }]);
    expect(out.unlabelable).toEqual(["c9"]);
    expect(out.labels.map((l) => l.id)).toEqual(["c1"]);
    expect(llm.calls[0].input).not.toContain('"c9"');

    const none = createFakeLlm();
    const empty = await labelAngles(none.backend, [{ id: "c9" }]);
    expect(empty).toMatchObject({ labels: [], unlabelable: ["c9"] });
    expect(empty.meta).toBeUndefined();
    expect(none.calls).toHaveLength(0);
  });

  it("çıktı id kümesi girdiyle birebir eşit olmalı: eksik id düzeltme turu ister, ikinci yanıt tamamsa kabul", async () => {
    const llm = createFakeLlm({ results: [good1] }, { results: [good1, unsure("c3"), good2] });
    const out = await labelAngles(llm.backend, items);
    expect(out.labels).toHaveLength(2);
    expect(out.meta?.attempts).toBe(2);
    expect(llm.calls[1].input).toContain("eksik id: c2, c3");
  });

  it("fazla ya da yinelenen id iki denemede de sürerse invalid_output (etiket yazılmaz)", async () => {
    const extra = createFakeLlm({ results: [good1, good2, unsure("c3"), unsure("zzz")] });
    await expect(labelAngles(extra.backend, items)).rejects.toMatchObject({ code: "invalid_output" });
    expect(extra.calls).toHaveLength(2);

    const dup = createFakeLlm({ results: [good1, good1] });
    await expect(labelAngles(dup.backend, [items[0]])).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("birebir bulunamayan alıntı: düzeltme turu; düzelirse doğrulanmış", async () => {
    const paraphrased = labeled("c1", "their mind keeps replaying old stories", "every single morning");
    const llm = createFakeLlm({ results: [paraphrased] }, { results: [good1] });
    const out = await labelAngles(llm.backend, [items[0]]);
    expect(out.labels[0].evidenceVerified).toBe(true);
    expect(out.meta?.attempts).toBe(2);
    expect(llm.calls[1].input).toContain("angle_evidence");
  });

  it("düzeltmeden sonra da bulunamayan alıntı: etiket DÖNER ama evidenceVerified=false (matrise girmez)", async () => {
    const invented = labeled("c1", "viewers feel deeply stuck in life", "every single morning");
    const llm = createFakeLlm({ results: [invented] });
    const out = await labelAngles(llm.backend, [items[0]]);
    expect(llm.calls).toHaveLength(2);
    expect(out.labels).toEqual([expect.objectContaining({ id: "c1", angle: "aci-korku", evidenceVerified: false })]);
  });

  it("alıntı BAŞKA içeriğin metninden ise doğrulanmaz (kendi korpusunda aranır)", async () => {
    const wrongOwner = labeled("c1", "Seven clients cut their stress in half", "every single morning");
    const llm = createFakeLlm({ results: [wrongOwner, good2] });
    const out = await labelAngles(llm.backend, [items[0], items[1]]);
    expect(out.labels.find((l) => l.id === "c1")?.evidenceVerified).toBe(false);
    expect(out.labels.find((l) => l.id === "c2")?.evidenceVerified).toBe(true);
  });

  it("alanı eksik 'labeled' iki denemede de sürerse invalid_output; 'unsure' alanları yok sayılır", async () => {
    const broken = { id: "c1", verdict: "labeled", angle: "aci-korku" };
    const llm = createFakeLlm({ results: [broken] });
    await expect(labelAngles(llm.backend, [items[0]])).rejects.toMatchObject({ code: "invalid_output" });
    expect(llm.calls).toHaveLength(2);

    const sure = createFakeLlm({ results: [{ ...unsure("c1"), angle: "kimlik" }] });
    const out = await labelAngles(sure.backend, [items[0]]);
    expect(out).toMatchObject({ labels: [], unsure: ["c1"] });
  });

  it("geçersiz eksen değeri şemadan geçmez (taksonomi dışı açı etiket olamaz)", async () => {
    const llm = createFakeLlm({ results: [labeled("c1", "x y", "z w", { angle: "ornekmarka" })] });
    await expect(labelAngles(llm.backend, [items[0]])).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("girdi doğrulaması: boş liste, 9 içerik, tekrar eden id", async () => {
    const llm = createFakeLlm({ results: [] });
    await expect(labelAngles(llm.backend, [])).rejects.toMatchObject({ code: "invalid_input" });
    const nine = Array.from({ length: LABEL_BATCH_MAX + 1 }, (_, i) => ({ id: `c${i}`, caption: "text" }));
    await expect(labelAngles(llm.backend, nine)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(labelAngles(llm.backend, [items[0], items[0]])).rejects.toMatchObject({ code: "invalid_input" });
    expect(llm.calls).toHaveLength(0);
  });
});
