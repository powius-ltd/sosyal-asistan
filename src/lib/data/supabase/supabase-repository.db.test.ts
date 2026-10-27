/**
 * Supabase deposu · sözleşme süiti (entegrasyon). `runRepositoryContract` AYNI testleri mock ile paylaşır; burada yerel
 * Supabase'e karşı, `beforeAll`'da kurulan (sabit olmayan UUID'li) TEST workspace'inde koşar ve `afterAll`'da silinir.
 * Yerel Supabase kapalıysa ya da `SUPABASE_SERVICE_ROLE_KEY` yoksa ATLANIR (neden describe adında görünür).
 * Seed workspace'ine (`7a3f0000-…-0001`) yazılmaz. Kredi testleri de yerel kullanıcının hesabına YAZMAZ: süit için geçici bir kullanıcı
 * açılır (`testing/credit-user.ts`), depo onun hesabıyla kurulur ve sonunda hesap + kullanıcı silinir.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runRepositoryContract } from "@/lib/data/repository.contract";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { createSupabaseWorkspace } from "@/lib/workspace/registry-db";
import { grantCredits, settleCredits } from "@/lib/credits/ledger";
import { deleteContractWorkspace, seedContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { createCreditTestUser, deleteCreditTestUser } from "@/lib/data/supabase/testing/credit-user";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import { SEED_PLAN_BRIEF } from "@/lib/data/supabase/testing/seed-plan";
import { createClient } from "@supabase/supabase-js";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const wsId = randomUUID();
/** Panel işlerinin test kuyruğu: koşuya özgü (canlı işçi yalnız `panel` kuyruğunu alır; paralel test süreçleri birbirinin işini almaz). */
const jobQueue = `contract_${wsId.slice(0, 8)}`;
const name = status.env ? "supabase" : `supabase (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 180_000 }, () => {
  const env = status.env;
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Konu eleği sonucu depo üzerinden yazılamaz: niş dışı içerik kimliklerini seed bilir (sözleşme süiti lazy okur).
  let offNicheContentIds: string[] = [];
  /** Kredi hesabının sahibi: süite özgü geçici kullanıcı (gerçek bakiyeye yazılmaz). */
  let creditUserId: string = randomUUID();
  beforeAll(async () => {
    if (!env) return;
    ({ offNicheContentIds } = await seedContractWorkspace(db, wsId, env.userId, new Date()));
    creditUserId = await createCreditTestUser(db, wsId.slice(0, 8));
  }, 120_000);

  /** Başlangıç akışının taze çalışma alanı (ilk istekte açılır: yalnız kendi hesap; süit sonunda silinir). */
  let freshWsId: string | undefined;

  afterAll(async () => {
    if (!env) return;
    if (freshWsId !== undefined) await deleteContractWorkspace(db, freshWsId);
    await deleteContractWorkspace(db, wsId);
    await deleteCreditTestUser(db, creditUserId);
  }, 60_000);

  // Otomatik eşleşme önerisi sunucu işidir (toplama sonrası): sözleşme için service role ile doğrudan satır yazılır.
  const suggestIdeaLink = async (_repo: unknown, input: { ideaId: string; contentItemId: string }): Promise<string> => {
    const content = await db.from("content_items").select("shortcode").eq("id", input.contentItemId).eq("workspace_id", wsId).single();
    if (content.error || !content.data.shortcode) throw new Error(`öneri için içerik/shortcode okunamadı: ${content.error?.message ?? "shortcode yok"}`);
    const row = await db
      .from("idea_content_links")
      .insert({
        workspace_id: wsId,
        idea_id: input.ideaId,
        content_item_id: input.contentItemId,
        shortcode: content.data.shortcode,
        status: "suggested",
        origin: "auto_match",
        score: 0.7,
        reasons: ["Test önerisi"],
      })
      .select("id")
      .single();
    if (row.error) throw new Error(`öneri yazılamadı: ${row.error.message}`);
    return row.data.id;
  };

  // Panel işleri: işi almak / bitirmek işçinin işidir. Sözleşme için service role ile `claim_panel_job` + çitli yazım (işçinin kendi yolu).
  const JOB_WORKER_ID = "contract-worker";
  const jobWorker = {
    claim: async (): Promise<string | undefined> => {
      const claimed = await db.rpc("claim_panel_job", { p_queue: jobQueue, p_worker_id: JOB_WORKER_ID });
      if (claimed.error) throw new Error(`iş alınamadı: ${claimed.error.message}`);
      return claimed.data[0]?.id;
    },
    finish: async (_repo: unknown, jobId: string): Promise<void> => {
      const finished = await db
        .from("panel_jobs")
        .update({ status: "succeeded", finished_at: new Date().toISOString(), result: { exitCode: 0 } })
        .eq("id", jobId)
        .eq("worker_id", JOB_WORKER_ID)
        .eq("status", "running")
        .select("id");
      if (finished.error || finished.data.length !== 1) throw new Error(`iş bitirilemedi: ${finished.error?.message ?? "çitli yazım 0 satır etkiledi"}`);
    },
  };

  // Kredi vermek / kesinleştirmek sunucu ve işçi işidir: sözleşme için `lib/credits/ledger.ts` doğrudan çağrılır (test kullanıcısıyla).
  const creditOps = {
    grant: (_repo: unknown, input: Parameters<typeof grantCredits>[2]) => grantCredits(db, creditUserId, input),
    settle: (_repo: unknown, input: Parameters<typeof settleCredits>[1]) => settleCredits(db, input),
  };

  const repoOptions = () => ({ db, approverUserId: env?.userId ?? randomUUID(), creditOwnerUserId: creditUserId, jobQueue });
  runRepositoryContract("supabase", () => createSupabaseRepository(repoOptions()), {
    wsId,
    // Kredi zorlaması AÇIK depo: aynı test çalışma alanı, aynı test kuyruğu, aynı test kullanıcısının hesabı.
    createEnforced: () => createSupabaseRepository({ ...repoOptions(), creditsEnforced: true }),
    // Başlangıç akışı: `create_workspace` ile açılan boş çalışma alanı (kendi hesap + sahip üyelik); işler yine test kuyruğuna yazılır.
    freshWorkspace: async () => {
      freshWsId ??= (await createSupabaseWorkspace({ name: `Başlangıç ${wsId.slice(0, 8)}`, handle: `baslangic.${wsId.slice(0, 8)}` }, { db, userId: env?.userId })).id;
      return { repo: createSupabaseRepository(repoOptions()), wsId: freshWsId };
    },
    offNicheContentIds: () => offNicheContentIds,
    suggestIdeaLink,
    jobQueue,
    jobWorker,
    creditOps,
    // Saplama (`not_implemented`) özellikler: uygulayan paket kendi girdisini SİLER (ayrı satırlar: paralel birleştirmede çakışmasın).
    pending: [],
  });

  // 0025: `save_weekly_plan` brifi (`weekly_plans.brief`) ve fikrin slotunu (`weekly_plan_items.brief_slot`) yazar; okuma yolu geri verir.
  it("haftalık plan: brif ve fikrin slotu RPC'den okuma yoluna aynen gelir", async () => {
    const repo = createSupabaseRepository(repoOptions());
    const [summary] = await repo.listWeeklyPlans(wsId);
    const plan = await repo.getWeeklyPlan(wsId, summary.weekStart);
    expect(plan?.brief).toEqual(SEED_PLAN_BRIEF);
    expect(plan?.items.map((item) => item.briefSlot)).toEqual(["S1", "S2"]);
    expect(plan?.alternatives.map((item) => item.briefSlot), "aday fikrin slotu yok").toEqual([undefined]);
  });
});
