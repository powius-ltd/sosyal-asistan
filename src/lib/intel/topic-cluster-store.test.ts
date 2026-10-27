import { describe, expect, it, vi } from "vitest";

import { saveTopicClusters, toClusterRows } from "@/lib/intel/topic-cluster-store";
import type { TopicCluster } from "@/lib/llm/cluster-topics";
import type { AdminClient } from "@/lib/supabase/admin";

const WS = "7a3f0000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-01T09:00:00.000Z");
const RUN = "11111111-1111-4111-8111-111111111111";
const ctx = { workspaceId: WS, promptVersion: "cluster-topics-v1", model: "claude-test", runId: RUN, now: NOW };
const cluster = (key: string, label: string, contentIds: string[]): TopicCluster => ({ key, label, contentIds });

/** `from(...).upsert(...)` ve `from(...).delete().eq().not()` zincirini kaydeden sahte istemci. */
function fakeClient(result: { error: { message: string } | null } = { error: null }, deletedCount: number | null = 0) {
  const calls = {
    upsert: [] as { table: string; rows: unknown; options: unknown }[],
    deleted: [] as { table: string; options: unknown; filters: unknown[][] }[],
  };
  const client = {
    from: (table: string) => ({
      upsert: (rows: unknown, options: unknown) => {
        calls.upsert.push({ table, rows, options });
        return Promise.resolve(result);
      },
      delete: (options: unknown) => {
        const filters: unknown[][] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          not: (column: string, operator: string, value: unknown) => {
            filters.push([column, `not.${operator}`, value]);
            calls.deleted.push({ table, options, filters });
            return Promise.resolve({ ...result, count: deletedCount });
          },
        };
        return chain;
      },
    }),
  };
  return { client: client as unknown as AdminClient, calls };
}

describe("toClusterRows", () => {
  it("içerik başına bir satır; koşu/model/sürüm/zaman DB sütunlarına eşlenir, etiket kırpılır", () => {
    const rows = toClusterRows([cluster("kader", "  Kader ve irade  ", ["c1", "c2"]), cluster("ritual", "Ritüel", ["c3"])], ctx);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      content_item_id: "c1",
      workspace_id: WS,
      cluster_key: "kader",
      cluster_label: "Kader ve irade",
      prompt_version: "cluster-topics-v1",
      model: "claude-test",
      run_id: RUN,
      clustered_at: NOW.toISOString(),
    });
    expect(rows.map((row) => row.cluster_key)).toEqual(["kader", "kader", "ritual"]);
  });

  it("koşu/model yoksa null; bir içerik iki kümedeyse ilk kümede kalır", () => {
    const rows = toClusterRows([cluster("a", "A", ["c1"]), cluster("b", "B", ["c1", "c2"])], { workspaceId: WS, promptVersion: "v1", now: NOW });
    expect(rows.map((row) => [row.content_item_id, row.cluster_key])).toEqual([["c1", "a"], ["c2", "b"]]);
    expect(rows[0]).toMatchObject({ model: null, run_id: null });
  });

  it("DB kontrollerine uymayan küme yazılmaz: anahtar biçimi (≤ 40, snake_case), boş etiket, boş sürüm; etiket 80 karaktere kırpılır", () => {
    expect(() => toClusterRows([cluster("Kader", "x", ["c1"])], ctx)).toThrow(/anahtar/);
    expect(() => toClusterRows([cluster("a".repeat(41), "x", ["c1"])], ctx)).toThrow(/anahtar/);
    expect(() => toClusterRows([cluster("kader", "   ", ["c1"])], ctx)).toThrow(/etiketi boş/);
    expect(() => toClusterRows([cluster("kader", "x", ["c1"])], { ...ctx, promptVersion: " " })).toThrow(/istem sürümü/);
    expect(toClusterRows([cluster("kader", "ü".repeat(120), ["c1"])], ctx)[0].cluster_label).toHaveLength(80);
  });
});

describe("saveTopicClusters", () => {
  it("içerik_kimliği üzerinden upsert eder; sonuç yazılan ve silinen sayıyı verir", async () => {
    const { client, calls } = fakeClient(undefined, 0);
    const out = await saveTopicClusters(client, [cluster("kader", "Kader", ["c1", "c2"])], ctx);
    expect(out).toEqual({ saved: 2, cleared: 0 });
    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0]).toMatchObject({ table: "content_topic_clusters", options: { onConflict: "content_item_id" } });
  });

  it("tablo tek koşuyu taşır: bu koşuda YAZILMAYAN her satır (kümesiz ya da hiç gönderilmemiş içerik) çalışma alanı süzgeciyle silinir", async () => {
    // Önceki koşu "kahve" anahtarıyla 70 içerik yazmıştı; bu koşu ilk 60'tan ikisini "kahve_tarifleri" diye kümeledi.
    const { client, calls } = fakeClient(undefined, 68);
    const out = await saveTopicClusters(client, [cluster("kahve_tarifleri", "Kahve tarifleri", ["c1", "c2"])], ctx);
    expect(out).toEqual({ saved: 2, cleared: 68 });
    expect(calls.deleted).toEqual([
      {
        table: "content_topic_clusters",
        options: { count: "exact" },
        filters: [["workspace_id", WS], ["content_item_id", "not.in", '("c1","c2")']],
      },
    ]);
  });

  it("silinen sayısını DB dönmezse cleared undefined (0 değil)", async () => {
    const { client } = fakeClient(undefined, null);
    expect(await saveTopicClusters(client, [cluster("kader", "Kader", ["c1"])], ctx)).toEqual({ saved: 1, cleared: undefined });
  });

  it("hiç küme yoksa DB'ye hiç istek atılmaz: başarısız kümeleme önceki koşunun satırlarını silmez", async () => {
    const from = vi.fn();
    expect(await saveTopicClusters({ from } as unknown as AdminClient, [], ctx)).toEqual({ saved: 0, cleared: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it("DB hatası açık Türkçe mesajla fırlar (sessiz yutulmaz)", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    await expect(saveTopicClusters(client, [cluster("kader", "Kader", ["c1"])], ctx)).rejects.toThrow("Konu kümeleri yazılamadı: boom");
  });
});
