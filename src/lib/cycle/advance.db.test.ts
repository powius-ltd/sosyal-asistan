/**
 * Halka zinciri · GERÇEK veritabanı (yerel Supabase): `advanceCycle` iş açar / açmaz, bildirimi bir kez yazar, günlük tavanı uygular.
 * Test KENDİ çalışma alanlarını kurar ve siler; işler yalnız koşuya özgü KUYRUKLARA yazılır (canlı `panel` kuyruğuna hiçbir şey yazılmaz,
 * hiçbir iş koşturulmaz). Para harcayan iş açılmadığı da burada sınanır. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { advanceCycle } from "@/lib/cycle/advance";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { JOB_KIND_SPEC, type JobKind } from "@/lib/domain/panel-job";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "halka zinciri" : `halka zinciri (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const created: string[] = [];
  const NOW = new Date();
  const queue = `halka_${tag}`;
  const procEnv = { LOCAL_USER_ID: userId, LOCAL_WORKSPACE_ID: randomUUID() };
  const agoIso = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  /** Creator hesap (rakipsiz plan geçerli), tek kendi içerik, toplama `syncedDaysAgo` gün önce. İncelemesi YOK → analiz sırada. */
  async function setup(label: string, syncedDaysAgo: number): Promise<string> {
    const ws = await createSupabaseWorkspace({ name: `Halka ${label} ${tag}`, handle: `halka_${label}_${tag}`.slice(0, 30), platform: "instagram", accountType: "creator", timezone: "Europe/Istanbul", complianceRegion: "TR" }, { db, userId });
    created.push(ws.id);
    const account = await db.from("social_accounts").select("id").eq("workspace_id", ws.id).single();
    if (account.error) throw new Error(account.error.message);
    const synced = await db.from("social_accounts").update({ last_synced_at: agoIso(syncedDaysAgo) }).eq("id", account.data.id);
    if (synced.error) throw new Error(synced.error.message);
    const item = await db.from("content_items").insert({ workspace_id: ws.id, platform: "instagram", social_account_id: account.data.id, external_id: `halka-${tag}-${label}`, format: "short_video", published_at: agoIso(3) });
    if (item.error) throw new Error(item.error.message);
    return ws.id;
  }

  const jobsOf = async (wsId: string) => {
    const rows = await db.from("panel_jobs").select("kind, status, queue, approval_basis").eq("workspace_id", wsId);
    if (rows.error) throw new Error(rows.error.message);
    return rows.data;
  };
  const noticesOf = async (wsId: string) => {
    const rows = await db.from("notifications").select("kind, title, dedupe_key").eq("workspace_id", wsId);
    if (rows.error) throw new Error(rows.error.message);
    return rows.data;
  };
  const advance = (wsId: string, dryRun = false) => advanceCycle({ client: db, workspaceId: wsId, queue, now: NOW, env: procEnv, approverUserId: userId, dryRun });
  const finishedJob = (wsId: string, kind: JobKind, jobStatus: "succeeded" | "failed", minutesAgo: number, source?: "cycle") =>
    db.from("panel_jobs").insert({
      workspace_id: wsId, queue, kind, status: jobStatus, requested_by: userId, worker_id: "halka-test", ...(source === undefined ? {} : { params: { source } }),
      created_at: new Date(NOW.getTime() - (minutesAgo + 1) * 60_000).toISOString(), started_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
      heartbeat_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(), finished_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
      ...(jobStatus === "failed" ? { error: "test hatası", result: { outcome: "error" } } : {}),
    });

  afterAll(async () => {
    if (!env || created.length === 0) return;
    const removed = await db.from("workspaces").delete().in("id", created);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
  }, 60_000);

  it("sıradaki $0 adımı (analiz) KENDİ kuyruğuna yazar; ikinci çağrı iş sürerken ikinci iş açmaz", async () => {
    const wsId = await setup("a", 1);
    const dry = await advance(wsId, true);
    expect(dry).toMatchObject({ action: "would_request", request: { kind: "analyze" } });
    expect(await jobsOf(wsId)).toHaveLength(0);

    const first = await advance(wsId);
    expect(first).toMatchObject({ action: "requested", request: { kind: "analyze" } });
    const second = await advance(wsId);
    expect(second).toMatchObject({ action: "stopped", stop: { reason: "active_job" } });
    const jobs = await jobsOf(wsId);
    expect(jobs).toEqual([{ kind: "analyze", status: "queued", queue, approval_basis: null }]);
    expect(await noticesOf(wsId)).toHaveLength(0);
  });

  it("para harcayan adım (bayat toplama) HİÇ iş açmaz; tek bildirim yazar, tekrar çağrı ikinci bildirim yazmaz", async () => {
    const wsId = await setup("b", 30);
    const results = [await advance(wsId), await advance(wsId), await advance(wsId)];
    expect(results[0]).toMatchObject({ action: "stopped", stop: { reason: "needs_approval", step: "collect" }, notified: true });
    expect(results[1]).toMatchObject({ action: "stopped", notified: false });
    expect(results[2]).toMatchObject({ action: "stopped", notified: false });
    expect(await jobsOf(wsId)).toHaveLength(0);
    const notices = await noticesOf(wsId);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "system" });
    // Bildirim müşteri metnidir: tutar ya da iç terim yok.
    expect(notices[0].title).not.toMatch(/\$|USD|Apify/i);
  });

  it("para harcayan tür hiçbir olgu kombinasyonunda açılmaz (DB'ye yazılan her zincir işi $0 türdür)", async () => {
    for (const wsId of created) for (const job of await jobsOf(wsId)) if (job.queue === queue) expect(JOB_KIND_SPEC[job.kind as JobKind].spend).toBe("never");
  });

  it("başarısız son iş → zincir durur, tek bildirim yazar, yeni iş açmaz; başarılı iş sonrası kaldığı yerden sürer", async () => {
    const wsId = await setup("c", 1);
    const inserted = await finishedJob(wsId, "analyze", "failed", 5);
    if (inserted.error) throw new Error(inserted.error.message);
    const first = await advance(wsId);
    expect(first).toMatchObject({ action: "stopped", stop: { reason: "job_failed" }, notified: true });
    expect(await advance(wsId)).toMatchObject({ action: "stopped", notified: false });
    expect(await noticesOf(wsId)).toHaveLength(1);
    expect(await jobsOf(wsId)).toHaveLength(1);

    const ok = await finishedJob(wsId, "analyze", "succeeded", 1);
    if (ok.error) throw new Error(ok.error.message);
    // Başarılı iş en son iş: zincir artık durmaz (inceleme olguda hâlâ bekliyor → yeniden analiz sırada).
    expect(await advance(wsId)).toMatchObject({ action: "requested", request: { kind: "analyze" } });
  });

  it("günlük tavan: bugün tavan kadar zincir işi açılmışsa yenisini açmaz", async () => {
    const wsId = await setup("d", 1);
    for (let i = 0; i < CYCLE_RULES.chainDailyMax; i += 1) {
      const row = await finishedJob(wsId, "analyze", "succeeded", 10 + i, "cycle");
      if (row.error) throw new Error(row.error.message);
    }
    expect(await advance(wsId)).toMatchObject({ action: "stopped", stop: { reason: "daily_cap" }, notified: false });
    expect(await jobsOf(wsId)).toHaveLength(CYCLE_RULES.chainDailyMax);
  });

  it("günlük tavan yalnız zincirin açtığı işleri sayar: elle açılmış (işaretsiz) işler sayılmaz; zincirin işi params.source=cycle taşır", async () => {
    const wsId = await setup("e", 1);
    for (let i = 0; i < CYCLE_RULES.chainDailyMax; i += 1) {
      const row = await finishedJob(wsId, "analyze", "succeeded", 10 + i);
      if (row.error) throw new Error(row.error.message);
    }
    const result = await advance(wsId);
    expect(result.action === "stopped" && result.stop.reason === "daily_cap").toBe(false);
    expect(result.action).toBe("requested");
    if (result.action === "requested") {
      const row = await db.from("panel_jobs").select("params").eq("id", result.jobId).single();
      expect(row.data?.params).toMatchObject({ source: "cycle" });
    }
  });

  it("canlı 'panel' kuyruğuna hiçbir şey yazılmadı", async () => {
    const rows = await db.from("panel_jobs").select("id").in("workspace_id", created).eq("queue", "panel");
    expect(rows.data ?? []).toHaveLength(0);
  });
});
