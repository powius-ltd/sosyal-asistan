/**
 * Yönetici ajan turu · GERÇEK veritabanı (yerel Supabase): model sahte, çalışma alanı ve kuyruk testin KENDİSİNİN (canlı `panel` kuyruğuna
 * hiçbir şey yazılmaz, hiçbir iş koşturulmaz, Apify/Zernio çağrısı yok). Sınanan: onaylı tavanda ücretli iş `monthly_cap` + `source=agent`
 * ile açılır; onaysız tavanda hiç açılmaz ve tek bildirim yazılır; model düşünce zincir kararı uygulanır; kuru koşu hiçbir şey yazmaz.
 * Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { runDirectorTurn } from "@/lib/agents/director/turn";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "yönetici ajan turu" : `yönetici ajan turu (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const created: string[] = [];
  const NOW = new Date();
  const queue = `ajan_${tag}`;
  const procEnv = { LOCAL_USER_ID: userId, LOCAL_WORKSPACE_ID: randomUUID() };
  const agoIso = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  /** Creator hesap, tek kendi içerik, toplama 30 gün önce (toplama sırada ve ücretli). `capApproved=false` ajan tavanını onaysız yapar. */
  async function setup(label: string, capApproved: boolean): Promise<string> {
    const ws = await createSupabaseWorkspace({ name: `Ajan ${label} ${tag}`, handle: `ajan_${label}_${tag}`.slice(0, 30), platform: "instagram", accountType: "creator", timezone: "Europe/Istanbul", complianceRegion: "TR" }, { db, userId });
    created.push(ws.id);
    const account = await db.from("social_accounts").select("id").eq("workspace_id", ws.id).single();
    if (account.error) throw new Error(account.error.message);
    const synced = await db.from("social_accounts").update({ last_synced_at: agoIso(30) }).eq("id", account.data.id);
    if (synced.error) throw new Error(synced.error.message);
    const item = await db.from("content_items").insert({ workspace_id: ws.id, platform: "instagram", social_account_id: account.data.id, external_id: `ajan-${tag}-${label}`, format: "short_video", published_at: agoIso(3) });
    if (item.error) throw new Error(item.error.message);
    if (!capApproved) {
      const off = await db.from("workspaces").update({ agent_monthly_cap_usd: null, agent_cap_approved_at: null, agent_cap_approved_by: null }).eq("id", ws.id);
      if (off.error) throw new Error(off.error.message);
    }
    return ws.id;
  }

  const jobsOf = async (wsId: string) => {
    const rows = await db.from("panel_jobs").select("kind, status, queue, approval_basis, params").eq("workspace_id", wsId);
    if (rows.error) throw new Error(rows.error.message);
    return rows.data;
  };
  const noticesOf = async (wsId: string) => {
    const rows = await db.from("notifications").select("kind, dedupe_key").eq("workspace_id", wsId);
    if (rows.error) throw new Error(rows.error.message);
    return rows.data;
  };
  const turn = (wsId: string, llm: ReturnType<typeof createFakeLlm>, dryRun = false) =>
    runDirectorTurn({ client: db, workspaceId: wsId, queue, now: NOW, env: procEnv, trigger: "job_finished", dryRun, llm: llm.backend, approverUserId: userId });

  afterAll(async () => {
    if (!env || created.length === 0) return;
    const removed = await db.from("workspaces").delete().in("id", created);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
  }, 60_000);

  it("onaylı tavanda toplama aylık tavan dayanağı ve ajan işaretiyle KENDİ kuyruğuna açılır", async () => {
    const wsId = await setup("a", true);
    const result = await turn(wsId, createFakeLlm({ action: "open_job", kind: "collect" }));
    expect(result).toMatchObject({ outcome: "requested", decision: { source: "llm", kind: "collect" } });
    const jobs = await jobsOf(wsId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: "collect", queue, approval_basis: "monthly_cap" });
    expect(jobs[0]?.params).toMatchObject({ source: "agent" });
    // Aynı tur ikinci kez: etkin iş var → ikinci iş açılmaz.
    const again = await turn(wsId, createFakeLlm({ action: "open_job", kind: "collect" }));
    expect(again.outcome).not.toBe("requested");
    expect(await jobsOf(wsId)).toHaveLength(1);
  });

  it("tavan onaysızken model toplama önerse de iş açılmaz; zincir kararı ask_approval olur ve tek bildirim yazılır", async () => {
    const wsId = await setup("b", false);
    const first = await turn(wsId, createFakeLlm({ action: "open_job", kind: "collect" }));
    expect(first).toMatchObject({ outcome: "notified", notified: true, decision: { action: "ask_approval", source: "fallback" } });
    const second = await turn(wsId, createFakeLlm({ action: "open_job", kind: "collect" }));
    expect(second).toMatchObject({ outcome: "notified", notified: false });
    expect(await jobsOf(wsId)).toHaveLength(0);
    const notices = await noticesOf(wsId);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.dedupe_key).toMatch(/^agent:ask_approval:/);
  });

  it("model düşünce (bozuk çıktı) yedek zincir kararı uygulanır; kuru koşu hiçbir şey yazmaz", async () => {
    const wsId = await setup("c", false);
    const dry = await turn(wsId, createFakeLlm("x", "y", "z"), true);
    expect(dry.decision?.source).toBe("fallback");
    expect(await jobsOf(wsId)).toHaveLength(0);
    expect(await noticesOf(wsId)).toHaveLength(0);
    const real = await turn(wsId, createFakeLlm("x", "y", "z"));
    expect(real).toMatchObject({ decision: { source: "fallback", action: "ask_approval" } });
  });

  it("yasak öneriler (yayın onayı, tavan yükseltme) hiçbir şey açmaz", async () => {
    const wsId = await setup("d", true);
    for (const out of [{ action: "approve_publish" }, { action: "set_cap" }]) {
      const result = await turn(wsId, createFakeLlm(out, out, out));
      expect(result.decision?.source).toBe("fallback");
    }
    const jobs = await jobsOf(wsId);
    expect(jobs.every((job) => job.kind !== "publish" && job.approval_basis !== "one_time")).toBe(true);
    const cap = await db.from("workspaces").select("agent_monthly_cap_usd").eq("id", wsId).single();
    expect(Number(cap.data?.agent_monthly_cap_usd)).toBe(3);
  });
});
