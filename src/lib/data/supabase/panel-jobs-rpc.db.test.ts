/**
 * Panel işi RPC'leri · GERÇEK eşzamanlılık (entegrasyon, yerel Supabase). SQL testi (`supabase/tests/panel_jobs.sql`) tek transaction'da
 * koştuğu için iki claim'i ARDIŞIK sınar; burada N işçi AYNI ANDA ister ve tam biri iş alır, aynı çalışma alanına aynı anda gelen N
 * istekten tam biri satır yazar. Test KENDİ çalışma alanlarını kurar ve siler, KENDİ kuyruk adını kullanır (canlı işçi yalnız `panel`
 * kuyruğunu alır); iş türü `analyze`'dır ($0, onaysız) ve hiçbir iş koşturulmaz. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseRequestJobInput } from "@/lib/data/job-input";
import { requestPanelJobArgs } from "@/lib/data/job-schema";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "panel işi RPC'leri" : `panel işi RPC'leri (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const queue = `rpc_${tag}`;
  const workspaces = [randomUUID(), randomUUID(), randomUUID()];
  const analyze = parseRequestJobInput({ kind: "analyze" });
  const request = (wsId: string) => db.rpc("request_panel_job", requestPanelJobArgs(wsId, queue, analyze, userId));
  const claim = (worker: string) => db.rpc("claim_panel_job", { p_queue: queue, p_worker_id: worker });
  const statuses = async () => {
    const rows = await db.from("panel_jobs").select("status").eq("queue", queue);
    if (rows.error) throw new Error(rows.error.message);
    return rows.data.map((row) => row.status).sort();
  };

  beforeAll(async () => {
    if (!env) return;
    const created = await db.from("workspaces").insert(workspaces.map((id, index) => ({ id, name: `İş RPC testi ${index + 1}`, slug: `is-rpc-${tag}-${index + 1}` })));
    if (created.error) throw new Error(`test çalışma alanları kurulamadı: ${created.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (!env) return;
    const removed = await db.from("workspaces").delete().in("id", workspaces);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
  }, 60_000);

  it("aynı çalışma alanına 6 eşzamanlı istek → TEK satır yazılır, diğerleri panel_job_active (23505)", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => request(workspaces[0])));
    const written = results.filter((result) => result.error === null);
    const rejected = results.filter((result) => result.error !== null);
    expect(written).toHaveLength(1);
    expect(written[0]?.data).toMatchObject({ status: "queued", queue, kind: "analyze", approval_basis: null, approved_max_usd: null, requested_by: userId });
    expect(rejected.map((result) => [result.error?.code, result.error?.message])).toEqual(Array.from({ length: 5 }, () => ["23505", "panel_job_active"]));
    expect(await statuses()).toEqual(["queued"]);
  });

  it("8 eşzamanlı claim → TEK kazanan; kuyrukta çalışan iş varken kimse ikinci işi alamaz; iş bitince sıradaki alınır", async () => {
    for (const wsId of workspaces.slice(1)) expect((await request(wsId)).error, "diğer çalışma alanları da sıraya iş yazar").toBeNull();
    expect(await statuses()).toEqual(["queued", "queued", "queued"]);

    const first = await Promise.all(Array.from({ length: 8 }, (_, index) => claim(`w${index + 1}`)));
    expect(first.map((result) => result.error)).toEqual(Array.from({ length: 8 }, () => null));
    const winners = first.flatMap((result) => result.data ?? []);
    expect(winners, "tam bir işçi iş aldı").toHaveLength(1);
    expect(winners[0]).toMatchObject({ status: "running", workspace_id: workspaces[0], queue });
    expect(await statuses()).toEqual(["queued", "queued", "running"]);

    // Çit: işi almayan işçinin yazımı 0 satır etkiler; işi alan işçi bitirir.
    const winner = winners[0];
    const loser = winner.worker_id === "w1" ? "w2" : "w1";
    const fenced = (worker: string) =>
      db.from("panel_jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", winner.id).eq("worker_id", worker).eq("status", "running").select("id");
    expect((await fenced(loser)).data, "çit: başka işçi 0 satır").toEqual([]);
    expect((await fenced(winner.worker_id ?? "")).data).toEqual([{ id: winner.id }]);

    const second = await Promise.all(Array.from({ length: 8 }, (_, index) => claim(`w${index + 1}`)));
    expect(second.flatMap((result) => result.data ?? []), "iş bitince yine tam bir işçi sıradakini alır").toHaveLength(1);
    expect(await statuses()).toEqual(["queued", "running", "succeeded"]);
  });
});
