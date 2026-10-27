/**
 * Çalışma alanı kaydı + veri ayrımı (entegrasyon, yerel Supabase). Test kendi çalışma alanlarını kurar ve SİLER; seed çalışma alanına
 * (`7a3f0000-…-0001`) yazılmaz. Yerel Supabase kapalıysa ya da anahtar yoksa ATLANIR (neden describe adında görünür).
 *
 *  - `createSupabaseWorkspace`: çalışma alanı + owner üyelik + kendi hesap + uyarı ayarı TEK işlemde; hata olursa hiçbiri kalmaz.
 *  - Sızıntı: iki dolu çalışma alanından (A, C) birinin içeriği/planı/brifingi/etiketi/fikri ötekinin okumalarında görünmez; boş
 *    çalışma alanı (B) hiçbirini görmez.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { deleteContractWorkspace, seedContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseWorkspace, listSupabaseWorkspaces } from "@/lib/workspace/registry-db";

const status = await resolveDbTestEnv();
const name = status.env ? "workspace kaydı" : `workspace kaydı (ATLANDI: ${status.skipReason})`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 180_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const repo = createSupabaseRepository({ db, approverUserId: userId });
  const tag = randomUUID().slice(0, 8);
  /** Silinecek her çalışma alanı (hata olsa da afterAll temizler). */
  const created: string[] = [];
  const fullA = randomUUID();
  const fullC = randomUUID();
  let emptyB: { id: string; slug?: string } = { id: "" };

  beforeAll(async () => {
    if (!env) return;
    const now = new Date();
    created.push(fullA, fullC);
    await seedContractWorkspace(db, fullA, userId, now);
    await seedContractWorkspace(db, fullC, userId, now);
    emptyB = await createSupabaseWorkspace({ name: `Sızıntı B ${tag}`, handle: `sizinti.b.${tag}` }, { db, userId });
    created.push(emptyB.id);
  }, 150_000);

  afterAll(async () => {
    if (!env) return;
    for (const id of created) await deleteContractWorkspace(db, id);
  }, 60_000);

  describe("createSupabaseWorkspace", () => {
    it("çalışma alanı + owner üyelik + kendi hesap + uyarı ayarı birlikte yazılır; tavanlar varsayılan, ölçüm tavanı onaysız", async () => {
      const result = await createSupabaseWorkspace(
        { name: `Tam alan ${tag}`, handle: `@Tam.Alan.${tag}`, nicheBrief: "Test niş", timezone: "Europe/Istanbul", audienceTimezone: "America/New_York", complianceRegion: "TR_US", contentLanguage: "tr" },
        { db, userId },
      );
      created.push(result.id);
      expect(result.slug).toBe(`tam-alan-${tag}`);

      const workspace = await db.from("workspaces").select("*").eq("id", result.id).single();
      expect(workspace.data).toMatchObject({
        name: `Tam alan ${tag}`,
        timezone: "Europe/Istanbul",
        audience_timezone: "America/New_York",
        compliance_region: "TR_US",
        content_language: "tr",
        niche_brief: "Test niş",
        apify_monthly_cap_usd: 10,
        measure_monthly_cap_usd: null,
        measure_cap_approved_at: null,
      });
      const members = await db.from("workspace_members").select("user_id, role").eq("workspace_id", result.id);
      expect(members.data).toEqual([{ user_id: userId, role: "owner" }]);
      const accounts = await db.from("social_accounts").select("platform, handle, connection, followers").eq("workspace_id", result.id);
      expect(accounts.data).toEqual([{ platform: "instagram", handle: `tam.alan.${tag}`, connection: "scrape_only", followers: null }]);
      const alerts = await db.from("alert_settings").select("workspace_id").eq("workspace_id", result.id);
      expect(alerts.data).toHaveLength(1);
      // Otomatik toplama başlatılmaz: hiçbir koşu/rakip yok.
      expect((await db.from("collection_runs").select("id").eq("workspace_id", result.id)).data).toEqual([]);
      expect((await db.from("competitors").select("id").eq("workspace_id", result.id)).data).toEqual([]);
    });

    it("aynı ad ikinci kez açılırsa slug sonek alır (-2); liste ikisini de kendi hesabıyla verir", async () => {
      const first = await createSupabaseWorkspace({ name: `Aynı ad ${tag}`, handle: `ayni.bir.${tag}` }, { db, userId });
      const second = await createSupabaseWorkspace({ name: `Aynı ad ${tag}`, handle: `ayni.iki.${tag}` }, { db, userId });
      created.push(first.id, second.id);
      expect(first.slug).toBe(`ayni-ad-${tag}`);
      expect(second.slug).toBe(`ayni-ad-${tag}-2`);

      const listed = await listSupabaseWorkspaces(db);
      expect(listed.find((item) => item.id === second.id)).toMatchObject({ name: `Aynı ad ${tag}`, slug: second.slug, accounts: [{ platform: "instagram", handle: `ayni.iki.${tag}` }] });
      expect(listed.find((item) => item.id === "7a3f0000-0000-4000-8000-000000000001")?.slug).toBe("ornek");
    });

    it("geçersiz girdi veritabanına gitmeden invalid_input ile reddedilir", async () => {
      const before = (await listSupabaseWorkspaces(db)).length;
      for (const input of [{ name: "", handle: "x" }, { name: "Geçerli", handle: "boşluklu ad" }, { name: "Geçerli", handle: "x", timezone: "Yok/Böyle" }, { name: "Geçerli", handle: "x", contentLanguage: "fr" }, null]) {
        await expect(createSupabaseWorkspace(input, { db, userId })).rejects.toMatchObject({ code: "invalid_input" });
      }
      expect((await listSupabaseWorkspaces(db)).length).toBe(before);
    });

    it("ATOMİKLİK: sahip kullanıcı yoksa (üyelik adımı düşer) çalışma alanı ve hesap da kalmaz", async () => {
      const ghost = `Hayalet ${tag}`;
      await expect(createSupabaseWorkspace({ name: ghost, handle: `hayalet.${tag}` }, { db, userId: randomUUID() })).rejects.toMatchObject({
        code: "invalid_state",
      });
      expect((await db.from("workspaces").select("id").eq("name", ghost)).data).toEqual([]);
      expect((await db.from("social_accounts").select("id").eq("handle", `hayalet.${tag}`)).data).toEqual([]);
    });

    it("ATOMİKLİK: kendi hesap adımı düşerse (DB kısıtı) çalışma alanı + üyelik geri alınır", async () => {
      const broken = `Bozuk ${tag}`;
      const { error } = await db.rpc("create_workspace", {
        p_user: userId,
        p_name: broken,
        p_slug: `bozuk-${tag}`,
        p_timezone: "",
        p_audience_timezone: "",
        p_niche_brief: "",
        p_compliance_region: "",
        p_platform: "instagram",
        p_handle: "BÜYÜK HARF!", // social_accounts.handle kısıtı: ^[a-z0-9._-]{1,50}$
      });
      expect(error?.code).toBe("23514");
      expect((await db.from("workspaces").select("id").eq("name", broken)).data).toEqual([]);
    });

    it.skipIf(!ANON_KEY)("istemci rolleri (anon) fonksiyonu çağıramaz", async () => {
      const anon = createClient<Database>(env?.url ?? "http://127.0.0.1", ANON_KEY ?? "yok", {
        auth: { persistSession: false },
      });
      const { error } = await anon.rpc("create_workspace", {
        p_user: userId,
        p_name: `Yetkisiz ${tag}`,
        p_slug: `yetkisiz-${tag}`,
        p_timezone: "",
        p_audience_timezone: "",
        p_niche_brief: "",
        p_compliance_region: "",
        p_platform: "instagram",
        p_handle: "yetkisiz",
      });
      expect(error).not.toBeNull();
      expect((await db.from("workspaces").select("id").eq("name", `Yetkisiz ${tag}`)).data).toEqual([]);
    });
  });

  describe("çalışma alanları arası veri ayrımı", () => {
    const readAll = async (wsId: string) => ({
      content: await repo.listContent(wsId, { limit: 200 }),
      ownContent: await repo.listContent(wsId, { ownerKind: "own", limit: 200 }),
      ideas: await repo.listIdeas(wsId),
      briefing: await repo.getLatestBriefing(wsId),
      matrix: await repo.getCreativeMatrix(wsId),
      plans: await repo.listWeeklyPlans(wsId),
      overview: await repo.getOverview(wsId),
    });
    const uuidsIn = (value: unknown): Set<string> => {
      const found = new Set(JSON.stringify(value).match(UUID_PATTERN) ?? []);
      found.delete(userId); // yerel kullanıcı her çalışma alanının sahibidir (ortak, sızıntı değil)
      return found;
    };

    it("dolu çalışma alanı gerçekten dolu (test boş değil): içerik, fikir, brifing, matris, plan", async () => {
      const a = await readAll(fullA);
      expect(a.content.items.length).toBeGreaterThan(0);
      expect(a.ideas.length).toBeGreaterThan(0);
      expect(a.briefing).not.toBeNull();
      expect(a.matrix.labeledCount).toBeGreaterThan(0);
      expect(a.plans.length).toBeGreaterThan(0);
    });

    it("boş çalışma alanı hiçbir şey görmez: içerik, fikir, brifing, etiket/matris, plan, genel bakış", async () => {
      const b = await readAll(emptyB.id);
      expect(b.content.items).toEqual([]);
      expect(b.ownContent.items).toEqual([]);
      expect(b.ideas).toEqual([]);
      expect(b.briefing).toBeNull();
      expect(b.matrix.labeledCount).toBe(0);
      expect(b.matrix.unlabeledCount).toBe(0);
      expect(b.matrix.opportunities).toEqual([]);
      expect(b.plans).toEqual([]);
      expect(b.overview.recentOutliers).toEqual([]);
      // Sonuçta B'ye ait olmayan tek kimlik bile yok (B'nin kendi hesap/çalışma alanı kimliği serbest).
      const own = await db.from("social_accounts").select("id").eq("workspace_id", emptyB.id);
      const allowed = new Set([emptyB.id, ...(own.data ?? []).map((row) => row.id)]);
      expect([...uuidsIn(b)].filter((id) => !allowed.has(id))).toEqual([]);
    });

    it("iki dolu çalışma alanının kimlik kümeleri ayrıktır (içerik, fikir, brifing, plan, matris, genel bakış)", async () => {
      const a = await readAll(fullA);
      const c = await readAll(fullC);
      for (const key of Object.keys(a) as Array<keyof typeof a>) {
        const inA = uuidsIn(a[key]);
        const inC = uuidsIn(c[key]);
        expect([...inA].filter((id) => inC.has(id)), `okuma: ${key}`).toEqual([]);
      }
      expect(a.briefing?.id).not.toBe(c.briefing?.id);
      expect(a.content.items.map((item) => item.id).filter((id) => c.content.items.some((other) => other.id === id))).toEqual([]);
    });

    it("bir çalışma alanının kimliğiyle ötekinin kaydı okunamaz: başka çalışma alanının içeriği/fikri 'bulunamadı' olur", async () => {
      const a = await readAll(fullA);
      const contentOfA = a.content.items[0];
      const ideaOfA = a.ideas[0];
      expect(await repo.getContent(emptyB.id, contentOfA.id)).toBeNull();
      expect(await repo.getContent(fullC, contentOfA.id)).toBeNull();
      await expect(repo.updateIdeaStatus(fullC, ideaOfA.id, "saved")).rejects.toMatchObject({ code: "not_found" });
    });
  });
});
