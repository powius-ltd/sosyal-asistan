import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { clusterProblems, clusterTopics, MIN_ITEMS_TO_CLUSTER, PROMPT_VERSION, toClusterKey } from "@/lib/llm/cluster-topics";
import { TAXONOMY_KEY_PATTERN } from "@/lib/llm/taxonomy";

const items = [
  { id: "c1", topic: "Sabah duası" },
  { id: "c2", topic: "Niyet koyma", hookText: "Set your intention before you scroll" },
  { id: "c3", topic: "Sinir sistemi", caption: "Your nervous system knows" },
  { id: "c4", topic: "Sabah rutini" },
  { id: "c5", topic: "Şifa" },
];
const cluster = (key: string, label: string, contentIds: string[]) => ({ key, label, contentIds });

describe("toClusterKey", () => {
  it("Türkçe katlar, taksonomi anahtar biçimine getirir", () => {
    expect(toClusterKey("Sabah Rutini & Niyet!")).toBe("sabah_rutini_niyet");
    expect(toClusterKey("ŞİFA ve İYİLEŞME")).toBe("sifa_ve_iyilesme");
    expect(toClusterKey("3 adım")).toBe("k_3_adim");
    expect(toClusterKey("???")).toBe("cluster");
    for (const text of ["x", "Çok Uzun Bir Küme Adı Çok Uzun Bir Küme Adı Çok Uzun", "42", "_a_"]) expect(TAXONOMY_KEY_PATTERN.test(toClusterKey(text))).toBe(true);
    expect(toClusterKey("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("clusterProblems", () => {
  const ids = new Set(["a", "b", "c"]);
  it("geçerli çıktı → sorun yok", () => expect(clusterProblems({ clusters: [cluster("k1", "Bir", ["a"]), cluster("k2", "İki", ["b", "c"])] }, ids)).toEqual([]));
  it("girdide olmayan id, birden fazla kümedeki id ve yinelenen anahtarı bildirir", () => {
    const problems = clusterProblems({ clusters: [cluster("k1", "Bir", ["a", "zzz"]), cluster("K1", "İki", ["a", "b"])] }, ids);
    expect(problems.join("\n")).toContain('"zzz" girdide yok');
    expect(problems.join("\n")).toContain('"a" birden fazla kümede');
    expect(problems.join("\n")).toContain("anahtarları tekil");
  });
});

describe("clusterTopics", () => {
  it("geçerli çıktı: büyükten küçüğe kümeler, kümelenmeyen id'ler ayrı; meta kind llm_topic_cluster", async () => {
    const llm = createFakeLlm({ clusters: [cluster("ritual", "Ritüeller", ["c1", "c4"]), cluster("healing", "Şifa", ["c3", "c5", "c2"])] });
    const out = await clusterTopics(llm.backend, { items });

    expect(out.clusters.map((c) => [c.key, c.contentIds])).toEqual([["healing", ["c3", "c5", "c2"]], ["ritual", ["c1", "c4"]]]);
    expect(out.unclustered).toEqual([]);
    expect(out.problems).toEqual([]);
    expect(out.promptVersion).toBe(PROMPT_VERSION);
    expect(out.meta).toMatchObject({ kind: "llm_topic_cluster", attempts: 1 });
  });

  it("id'ler girdinin alt kümesi ve her id ≤ 1 kümede: ihlal düzeltme turuyla giderilirse onarım gerekmez", async () => {
    const llm = createFakeLlm(
      { clusters: [cluster("a", "A", ["c1", "uydurma"]), cluster("b", "B", ["c1", "c2"])] },
      { clusters: [cluster("a", "A", ["c1", "c4"]), cluster("b", "B", ["c2", "c3"])] },
    );
    const out = await clusterTopics(llm.backend, { items });
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].input).toContain('"uydurma" girdide yok');
    expect(out.problems).toEqual([]);
    expect(out.unclustered).toEqual(["c5"]);
  });

  it("düzeltmeden sonra da ihlal sürerse KODLA onarılır: bilinmeyen id atılır, yinelenen ilk kümede kalır, sonuç sözleşmeyi sağlar", async () => {
    const llm = createFakeLlm({ clusters: [cluster("a", "A", ["c1", "uydurma", "c2"]), cluster("a", "B", ["c2", "c3"]), cluster("c", "Boş", ["yok"])] });
    const out = await clusterTopics(llm.backend, { items });

    const all = out.clusters.flatMap((c) => c.contentIds);
    expect(new Set(all).size).toBe(all.length); // her id en çok 1 kümede
    expect(all.every((id) => items.some((i) => i.id === id))).toBe(true); // alt küme
    expect(out.clusters.map((c) => c.key)).toEqual(["a", "a_2"]); // anahtar tekilleşti; boş küme düştü
    expect(out.clusters[0].contentIds).toEqual(["c1", "c2"]);
    expect(out.clusters[1].contentIds).toEqual(["c3"]);
    expect(out.unclustered).toEqual(["c4", "c5"]);
    expect(out.problems.length).toBeGreaterThan(0);
    expect(out.meta?.attempts).toBe(2);
  });

  it("bozuk anahtar kodla düzeltilir (modele güvenilmez)", async () => {
    const llm = createFakeLlm({ clusters: [cluster("Sabah Rutini!", "Sabah", ["c1", "c4"]), cluster("healing", "Şifa", ["c3", "c5"])] });
    const out = await clusterTopics(llm.backend, { items });
    expect(out.clusters.map((c) => c.key).sort()).toEqual(["healing", "sabah_rutini"]);
  });

  it(`çok az içerik (< ${MIN_ITEMS_TO_CLUSTER}) ya da metinsiz içerikler: model çağrılmaz`, async () => {
    const llm = createFakeLlm({ clusters: [] });
    const out = await clusterTopics(llm.backend, { items: [items[0], items[1], { id: "c9" }] });
    expect(llm.calls).toHaveLength(0);
    expect(out).toMatchObject({ clusters: [], unclustered: ["c1", "c2", "c9"] });
    expect(out.meta).toBeUndefined();
  });

  it("metinsiz içerik modele gönderilmez ama unclustered'da görünür", async () => {
    const llm = createFakeLlm({ clusters: [cluster("a", "A", ["c1", "c2", "c3"])] });
    const out = await clusterTopics(llm.backend, { items: [...items.slice(0, 3), { id: "bos" }] });
    expect(llm.calls[0].input).not.toContain('"bos"');
    expect(out.unclustered).toEqual(["bos"]);
  });

  it("yinelenen/boş girdi id'si invalid_input", async () => {
    const llm = createFakeLlm({ clusters: [] });
    await expect(clusterTopics(llm.backend, { items: [items[0], items[0]] })).rejects.toMatchObject({ code: "invalid_input" });
    expect(llm.calls).toHaveLength(0);
  });
});
