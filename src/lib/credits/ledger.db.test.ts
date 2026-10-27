/**
 * Kredi RPC'leri · GERÇEK eşzamanlılık (entegrasyon, yerel Supabase). SQL testi (`supabase/tests/credits.sql`) tek transaction'da koştuğu için
 * çağrıları ARDIŞIK sınar; burada N çağrı AYNI ANDA gelir: eşzamanlı ayırmaların toplamı bakiyeyi aşamaz (eksi bakiye imkânsız), aynı
 * anahtarla eşzamanlı ayırma / verme / kesinleştirme TEK kayıt üretir (çift düşüm yok).
 * Test KENDİ kullanıcısını açar ve siler (`testing/credit-user.ts`): yerel kullanıcının gerçek bakiyesine yazılmaz, hiçbir çalışma alanına
 * dokunulmaz, hiçbir iş koşturulmaz. Yerel Supabase kapalıysa ATLANIR.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { grantCredits, listCreditEntries, readCreditBalance, readCreditLots, releaseCredits, reserveCredits, settleCredits } from "@/lib/credits/ledger";
import { createCreditTestUser, deleteCreditTestUser } from "@/lib/data/supabase/testing/credit-user";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "kredi RPC'leri" : `kredi RPC'leri (ATLANDI: ${status.skipReason})`;

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 120_000 }, () => {
  const env = status.env;
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const tag = randomUUID().slice(0, 8);
  const key = (label: string) => `rpc-${tag}-${label}`;
  let userId: string = randomUUID();
  const balance = () => readCreditBalance(db, userId, new Date());
  const ledgerSum = async () => (await listCreditEntries(db, userId, { limit: 200 })).reduce((total, entry) => total + entry.amount, 0);
  const outcomes = (results: PromiseSettledResult<unknown>[]) => ({
    ok: results.filter((result) => result.status === "fulfilled").length,
    codes: results.flatMap((result) => (result.status === "rejected" ? [(result.reason as { code?: string }).code ?? String(result.reason)] : [])),
  });

  beforeAll(async () => {
    if (env) userId = await createCreditTestUser(db, tag);
  }, 60_000);

  afterAll(async () => {
    if (env) await deleteCreditTestUser(db, userId);
  }, 60_000);

  it("hesabı olmayan kullanıcı: bakiye bilinen sıfır, hareket yok, ayırma insufficient_credits", async () => {
    expect(await balance()).toEqual({ available: 0, monthly: 0, purchased: 0, held: 0 });
    expect(await readCreditLots(db, userId)).toEqual([]);
    expect(await listCreditEntries(db, userId, {})).toEqual([]);
    await expect(reserveCredits(db, userId, { amount: 1, key: key("no-account") })).rejects.toMatchObject({ code: "insufficient_credits", available: 0, requested: 1 });
  });

  it("aynı anahtarla 6 eşzamanlı verme → TEK satır; bakiye bir kez artar", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => grantCredits(db, userId, { type: "purchase", amount: 100, key: key("grant") })));
    expect(new Set(results.map((entry) => entry.id)).size, "hepsi aynı satırı döndürdü").toBe(1);
    expect((await balance()).available).toBe(100);
  });

  it("8 eşzamanlı ayırma (her biri 30, bakiye 100) → en çok 3'ü geçer; kullanılabilir hiçbir an eksiye düşmez", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => reserveCredits(db, userId, { amount: 30, key: key(`hold-${index}`) })));
    const { ok, codes } = outcomes(results);
    expect(ok, "100 krediden 30'luk tam 3 ayırma çıkar").toBe(3);
    expect(codes).toEqual(Array.from({ length: 5 }, () => "insufficient_credits"));
    expect(await balance()).toMatchObject({ available: 10, held: 90 });
    for (const lot of await readCreditLots(db, userId)) expect(lot.free, "partinin serbest kalanı eksi olamaz").toBeGreaterThanOrEqual(0);
  });

  it("aynı anahtarla 6 eşzamanlı ayırma → TEK ayırma; 6 eşzamanlı kesinleştirme → TEK düşüm", async () => {
    const holds = await Promise.all(Array.from({ length: 6 }, () => reserveCredits(db, userId, { amount: 10, key: key("same") })));
    expect(new Set(holds.map((hold) => hold.id)).size).toBe(1);
    expect(await balance()).toMatchObject({ available: 0, held: 100 });

    const settled = await Promise.all(Array.from({ length: 6 }, () => settleCredits(db, { key: key("same"), actual: 7, units: { chat_question: 2 } })));
    expect(settled.map((hold) => [hold.status, hold.charged])).toEqual(Array.from({ length: 6 }, () => ["settled", 7]));
    const charges = (await listCreditEntries(db, userId, { types: ["charge"], limit: 200 })).filter((entry) => entry.holdId === holds[0].id);
    expect(charges.reduce((total, entry) => total + entry.amount, 0), "bir kez düşüldü").toBe(-7);
    expect(await balance()).toMatchObject({ available: 3, held: 90 });
  });

  it("kesinleştirme ile bırakma yarışı: ayırma ya düşülür ya bırakılır, ikisi birden olmaz; sonunda defter toplamı = bakiye", async () => {
    const open = (await Promise.allSettled(Array.from({ length: 8 }, (_, index) => reserveCredits(db, userId, { amount: 30, key: key(`hold-${index}`) })))).flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(open.filter((hold) => hold.status === "open"), "önceki testin 3 açık ayırması (aynı anahtarla yeniden okunur)").toHaveLength(3);
    for (const hold of open) {
      const raced = await Promise.allSettled([settleCredits(db, { key: hold.key, actual: 20 }), releaseCredits(db, hold.key)]);
      const final = await releaseCredits(db, hold.key); // kapanmış ayırma aynen döner
      const charged = (await listCreditEntries(db, userId, { types: ["charge"], limit: 200 })).filter((entry) => entry.holdId === hold.id).reduce((total, entry) => total + entry.amount, 0);
      if (final.status === "settled") expect([final.charged, charged]).toEqual([20, -20]);
      else {
        expect([final.status, final.charged, charged]).toEqual(["released", undefined, 0]);
        // Bırakma kazandıysa kesinleştirme reddedilmiştir (sessizce düşmez).
        expect(outcomes(raced).codes).toEqual(["invalid_state"]);
      }
    }
    const end = await balance();
    expect(end.held).toBe(0);
    expect(end.available).toBeGreaterThanOrEqual(0);
    expect(await ledgerSum(), "açık ayırma yokken defter toplamı = bakiye").toBe(end.available);
  });
});
