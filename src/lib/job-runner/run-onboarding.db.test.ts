/**
 * Başlangıç işi · GERÇEK veritabanı (yerel Supabase, migration 0021) + SAHTE adımlar (`fakeDeps`: toplama, keşif, yazı aracı çağrılmaz).
 * Kanıt: akışın kendi eylemleriyle (`startOnboardingProbe` / `confirmOnboardingAccount` / `startOnboardingBuild`) açılan iş satırını işçi
 * alır, sabit tavanlı onayı satırdan okur, `result.probe`'u şemaya uygun yazar ve ekran modeli (`getOnboardingState`) işin sonucundan doğru
 * adıma türer. Test KENDİ çalışma alanlarını kurar ve siler; kuyruğu koşuya özgüdür (canlı işçi yalnız `panel`'i alır). Yerel Supabase
 * kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RepositoryError } from "@/lib/data/repository";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { ONBOARDING_PHASE_SPEC } from "@/lib/domain/onboarding-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { createJobStore } from "@/lib/job-runner/job-store";
import { buildRunners, collected, discovered, verified } from "@/lib/job-runner/run-onboarding-test-support";
import { fakeDeps, fakeRoutine, type FakeRoutine } from "@/lib/job-runner/test-support";
import { runWorker } from "@/lib/job-runner/worker";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";

const status = await resolveDbTestEnv();
const name = status.env ? "başlangıç işi (işçi + akış)" : `başlangıç işi (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const tag = randomUUID().slice(0, 8);
  const queue = `baslangic_${tag}`;
  const repo = createSupabaseRepository({ db, approverUserId: userId, jobQueue: queue });
  const store = createJobStore(db);
  const created: string[] = [];

  const workspace = async (label: string): Promise<string> => {
    const ws = await createSupabaseWorkspace({ name: `Başlangıç testi ${label} ${tag}`, handle: `baslangic.${label}.${tag}` }, { db, userId });
    created.push(ws.id);
    return ws.id;
  };
  const drain = (deps: Partial<JobRunnerDeps>) => runWorker({ mode: "drain", queue, store, deps: fakeDeps({ verifyAccount: async () => verified(), collect: async () => collected(25), discover: async () => discovered(), ...deps }), heartbeatMs: 60_000 });

  beforeAll(() => {
    if (env) process.env.APIFY_TOKEN ??= "baslangic-testi-sahte-anahtar"; // adımlar sahte: anahtar hiçbir yere gitmez
  });

  afterAll(async () => {
    if (!env) return;
    const removed = await db.from("workspaces").delete().in("id", created);
    if (removed.error) throw new Error(`test çalışma alanları silinemedi: ${removed.error.message}`);
  }, 60_000);

  it("hesaba bakış → hesap onayı → ilk tur: satır sabit tavanla açılır, işçi çıktıyı yazar, akış doğru adıma türer; ikinci ilk tur açılamaz", async () => {
    const wsId = await workspace("tam");
    const probe = await repo.startOnboardingProbe(wsId);
    expect(probe).toMatchObject({ kind: "onboarding", status: "queued", params: { phase: "probe" }, approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.probe.maxUsd } });
    expect((await repo.getOnboardingState(wsId)).step).toBe("probing");

    expect(await drain({})).toEqual({ code: 0, jobs: 1, reason: "drained" });
    const probed = await repo.getJob(wsId, probe.id);
    expect(probed).toMatchObject({ status: "succeeded", result: { probe: { profile: { handle: "test.hesap", followers: 1500 }, videoCount: 25, candidates: { total: 12, similarSize: 5 }, suggestedAccountType: "business" } } });
    expect(probed?.steps.map((step) => `${step.id}:${step.status}`)).toEqual(["verify:ok", "collect:ok", "discover:ok", "draft_niche:ok"]);
    expect(probed?.approval, "onay iş açılırken yazıldı, işçi değiştirmedi").toEqual(probe.approval);

    const review = await repo.getOnboardingState(wsId);
    expect(review).toMatchObject({ step: "review_account", next: "confirm_account", probe: { videoCount: 25, nicheDraft: "Örnek konu taslağı." } });
    expect((await repo.confirmOnboardingAccount(wsId, { accountType: "business", nicheBrief: "Örnek konu." })).step).toBe("choose_rivals");

    const build = await repo.startOnboardingBuild(wsId, {});
    expect(build).toMatchObject({ params: { phase: "build" }, approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.build.maxUsd } });
    const routine: FakeRoutine = fakeRoutine({}, buildRunners(() => routine));
    expect(await drain({ routineDeps: routine.factory })).toEqual({ code: 0, jobs: 1, reason: "drained" });
    const built = await repo.getJob(wsId, build.id);
    expect(built?.status).toBe("succeeded");
    expect(built?.steps.map((step) => step.id)).toEqual([...ONBOARDING_PHASE_SPEC.build.steps]);
    // Sahte plan adımı DB'ye plan yazmaz: akış "plan çıkmadı" ile kapanır (plan olsaydı `plan_ready`).
    expect(await repo.getOnboardingState(wsId)).toMatchObject({ step: "done", reason: "plan_not_ready" });
    await expect(repo.startOnboardingBuild(wsId, {})).rejects.toBeInstanceOf(RepositoryError);
  });

  it("gizli hesap: iş blocked + account_private kapanır, çıktı yazılmaz, akış durur ve yeniden bakış önerir", async () => {
    const wsId = await workspace("gizli");
    const probe = await repo.startOnboardingProbe(wsId);
    const deps = { verifyAccount: async () => verified({ outcome: "private" as const, profile: undefined, reason: "hesap gizli" }) };
    expect(await drain(deps)).toMatchObject({ code: 0, jobs: 1 });
    const done = await repo.getJob(wsId, probe.id);
    expect(done).toMatchObject({ status: "blocked", result: { outcome: "account_private" } });
    expect(done?.result?.probe).toBeUndefined();
    expect(await repo.getOnboardingState(wsId)).toMatchObject({ step: "blocked", reason: "account_private", next: "start_probe" });
  });
});
