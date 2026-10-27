/**
 * Hesap türü · DB testi (yerel Supabase; kapalıysa ATLANIR): `create_workspace` (11 parametre) türü yazar ve verilmezse işletme olur; `set` yolu
 * (`updateSupabaseWorkspaceSettings`) yalnız tür/dili günceller, başka alana ve veriye dokunmaz; geçersiz girdi/bilinmeyen çalışma alanı reddedilir.
 * Test kendi çalışma alanlarını kurar ve siler; gerçek çalışma alanlarına yazılmaz.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { deleteContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseWorkspace, updateSupabaseWorkspaceSettings } from "@/lib/workspace/registry-db";

const status = await resolveDbTestEnv();
const name = status.env ? "hesap türü" : `hesap türü (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const userId = env?.userId ?? randomUUID();
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const created: string[] = [];

  afterAll(async () => {
    if (!env) return;
    for (const id of created) await deleteContractWorkspace(db, id);
  }, 60_000);

  const typeOf = async (id: string) => (await db.from("workspaces").select("account_type, content_language, name").eq("id", id).single()).data;

  it("oluşturma: tür verilmezse işletme; creator ve mixed yazılır; geçersiz tür invalid_input ve kayıt bırakmaz", async () => {
    const plain = await createSupabaseWorkspace({ name: `Tür varsayılan ${tag}`, handle: `tur.varsayilan.${tag}` }, { db, userId });
    const creator = await createSupabaseWorkspace({ name: `Tür üretici ${tag}`, handle: `tur.uretici.${tag}`, accountType: "creator" }, { db, userId });
    const mixed = await createSupabaseWorkspace({ name: `Tür karma ${tag}`, handle: `tur.karma.${tag}`, accountType: "mixed", contentLanguage: "tr" }, { db, userId });
    created.push(plain.id, creator.id, mixed.id);
    expect(await typeOf(plain.id)).toMatchObject({ account_type: "business" });
    expect(await typeOf(creator.id)).toMatchObject({ account_type: "creator" });
    expect(await typeOf(mixed.id)).toMatchObject({ account_type: "mixed", content_language: "tr" });

    await expect(createSupabaseWorkspace({ name: `Tür bozuk ${tag}`, handle: `tur.bozuk.${tag}`, accountType: "agency" }, { db, userId })).rejects.toMatchObject({ code: "invalid_input" });
    expect((await db.from("workspaces").select("id").eq("name", `Tür bozuk ${tag}`)).data).toEqual([]);
  });

  it("set: yalnız tür ve/veya dil güncellenir; diğer alanlar aynı kalır; boş girdi, bilinmeyen alan ve geçersiz değer reddedilir", async () => {
    const ws = await createSupabaseWorkspace({ name: `Tür set ${tag}`, handle: `tur.set.${tag}`, nicheBrief: "Test niş" }, { db, userId });
    created.push(ws.id);

    const first = await updateSupabaseWorkspaceSettings(ws.id, { accountType: "creator" }, { db });
    expect(first).toMatchObject({ id: ws.id, accountType: "creator", contentLanguage: undefined });
    const second = await updateSupabaseWorkspaceSettings(ws.id, { accountType: "mixed", contentLanguage: "en" }, { db });
    expect(second).toMatchObject({ accountType: "mixed", contentLanguage: "en" });
    const third = await updateSupabaseWorkspaceSettings(ws.id, { contentLanguage: "tr" }, { db });
    expect(third, "yalnız dil verilince tür korunur").toMatchObject({ accountType: "mixed", contentLanguage: "tr" });

    const row = await db.from("workspaces").select("name, niche_brief, compliance_region").eq("id", ws.id).single();
    expect(row.data).toMatchObject({ name: `Tür set ${tag}`, niche_brief: "Test niş", compliance_region: "TR" });

    for (const bad of [{}, { accountType: "agency" }, { contentLanguage: "de" }, { accountType: "creator", name: "x" }, null]) {
      await expect(updateSupabaseWorkspaceSettings(ws.id, bad, { db }), JSON.stringify(bad)).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(await typeOf(ws.id), "reddedilen girdi uygulanmaz").toMatchObject({ account_type: "mixed", content_language: "tr" });
    await expect(updateSupabaseWorkspaceSettings(randomUUID(), { accountType: "creator" }, { db })).rejects.toMatchObject({ code: "not_found" });
  });
});
