/**
 * Supabase deposu · yanlış açılan hesabı kaldırma (`discardOnboardingWorkspace`; migration 0022 `discard_unconfirmed_workspace`). Gerçek
 * veritabanıyla: güvenli durumda çalışma alanı bağlı kayıtlarıyla gider; onaylanmış, ilk turu açılmış, etkin işi olan ya da gerçek veri
 * taşıyan çalışma alanı ASLA silinmez. Her test KENDİ çalışma alanını kurar ve (kaldı ise) siler; seed çalışma alanına dokunmaz. Yerel Supabase
 * kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { deleteContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";

const status = await resolveDbTestEnv();
const queue = `discard_${randomUUID().slice(0, 8)}`;
const label = status.env ? "supabase · yanlış açılan hesabı kaldırma" : `supabase · yanlış açılan hesabı kaldırma (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(label, { timeout: 120_000 }, () => {
  const env = status.env;
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const repo = createSupabaseRepository({ db, approverUserId: env?.userId ?? randomUUID(), jobQueue: queue });
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) await deleteContractWorkspace(db, id);
  });

  async function newWorkspace(): Promise<string> {
    const suffix = randomUUID().slice(0, 8);
    const ws = await createSupabaseWorkspace({ name: `Kaldır ${suffix}`, handle: `kaldir.${suffix}` }, { db, userId: env?.userId });
    created.push(ws.id);
    return ws.id;
  }

  /** Hesaba bakışı açar, işçi gibi alır ve verilen durumla bitirir. */
  async function probeFinished(wsId: string, final: "succeeded" | "failed" = "succeeded"): Promise<string> {
    const job = await repo.startOnboardingProbe(wsId);
    const claimed = await db.rpc("claim_panel_job", { p_queue: queue, p_worker_id: "discard-worker" });
    expect(claimed.data?.[0]?.id).toBe(job.id);
    const closed = await db.from("panel_jobs").update({ status: final, finished_at: new Date().toISOString() }).eq("id", job.id).eq("worker_id", "discard-worker").eq("status", "running").select("id");
    expect(closed.data).toHaveLength(1);
    return job.id;
  }

  const exists = async (wsId: string) => (await db.from("workspaces").select("id").eq("id", wsId).maybeSingle()).data !== null;

  it("bakışı bitmiş, onaysız çalışma alanı bağlı kayıtlarıyla kaldırılır", async () => {
    const wsId = await newWorkspace();
    await probeFinished(wsId);
    await db.from("competitors").insert({ workspace_id: wsId, platform: "instagram", handle: `aday_${randomUUID().slice(0, 6)}`, status: "candidate", source: "related" });
    await repo.discardOnboardingWorkspace(wsId);
    expect(await exists(wsId)).toBe(false);
    expect((await db.from("competitors").select("id").eq("workspace_id", wsId)).data).toEqual([]);
    expect((await db.from("panel_jobs").select("id").eq("workspace_id", wsId)).data).toEqual([]);
  });

  it("hiç iş koşmamış (yalnız eklenmiş) hesap da kaldırılır", async () => {
    const wsId = await newWorkspace();
    await repo.discardOnboardingWorkspace(wsId);
    expect(await exists(wsId)).toBe(false);
  });

  it("hata ile biten bakıştan sonra da ('başka hesap dene') kaldırılır", async () => {
    const wsId = await newWorkspace();
    await probeFinished(wsId, "failed");
    await repo.discardOnboardingWorkspace(wsId);
    expect(await exists(wsId)).toBe(false);
  });

  it("bakış SÜRERKEN kaldırılamaz (etkin iş)", async () => {
    const wsId = await newWorkspace();
    const job = await repo.startOnboardingProbe(wsId);
    try {
      await expect(repo.discardOnboardingWorkspace(wsId)).rejects.toMatchObject({ code: "invalid_state" });
      expect(await exists(wsId)).toBe(true);
    } finally {
      // Sıradaki iş ortak test kuyruğunda kalırsa sonraki testin `claim_panel_job`'u (en eski iş) onu alır.
      await repo.cancelJob(wsId, job.id);
    }
  });

  it("onaylanmış hesap kaldırılamaz", async () => {
    const wsId = await newWorkspace();
    await probeFinished(wsId);
    await repo.confirmOnboardingAccount(wsId, { accountType: "creator" });
    await expect(repo.discardOnboardingWorkspace(wsId)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await exists(wsId)).toBe(true);
  });

  it("ilk turu açılmış hesap (başarısız bitse bile) kaldırılamaz", async () => {
    const wsId = await newWorkspace();
    await probeFinished(wsId);
    await repo.confirmOnboardingAccount(wsId, { accountType: "creator" });
    const build = await repo.startOnboardingBuild(wsId, { rivalIds: [] });
    await repo.cancelJob(wsId, build.id);
    await db.from("workspaces").update({ account_confirmed_at: null }).eq("id", wsId); // onayı da kaldır: tek başına ilk tur satırı engellemeli
    await expect(repo.discardOnboardingWorkspace(wsId)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await exists(wsId)).toBe(true);
  });

  it("izlenen rakibi olan (gerçek veri) hesap kaldırılamaz", async () => {
    const wsId = await newWorkspace();
    await db.from("competitors").insert({ workspace_id: wsId, platform: "instagram", handle: `izlenen_${randomUUID().slice(0, 6)}`, status: "tracked", source: "manual" });
    await expect(repo.discardOnboardingWorkspace(wsId)).rejects.toMatchObject({ code: "invalid_state" });
    expect(await exists(wsId)).toBe(true);
  });

  it("bilinmeyen / biçimsiz kimlik not_found", async () => {
    await expect(repo.discardOnboardingWorkspace(randomUUID())).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.discardOnboardingWorkspace("uuid-degil")).rejects.toMatchObject({ code: "not_found" });
  });
});
