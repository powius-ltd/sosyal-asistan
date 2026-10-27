/**
 * Sözleşme parçası: kredi defteri (`getCreditBalance`, `listCreditEntries`, `reserveCredits`, `releaseCredits` + sunucu / işçi rolü
 * `creditOps.grant` / `creditOps.settle`). DAVRANIŞ: ver → ayır → kesinleştir → bakiye (fark serbest kalır); yetersizde `insufficient_credits`
 * ve hiçbir şey yazılmaz; her yazma idempotent (çift verme / çift düşüm yok); bırakma; iki kova sırası (önce aylık); süresi dolmuş kredi
 * harcanamaz; iş başına tek açık ayırma; geçersiz girdi.
 *
 * GÜVENLİK: depo TEST kullanıcısının hesabıyla kurulur (gerçek hesabın bakiyesine yazılmaz). Hesap testler arasında paylaşılabilir (Supabase)
 * ya da her testte taze olabilir (mock): bu yüzden her beklenti FARKLA yazılır (önceki bakiyeye göre) ve her test açtığı ayırmayı kapatır.
 * Tarihler sabittir (uzak geçmiş / uzak gelecek): mock saati ile gerçek saat ayrışsa da "süresi doldu / dolmadı" iki depoda aynıdır.
 */
import { expect, it } from "vitest";

import { expectCode, type ContractContext } from "@/lib/data/contract/support";
import type { PanelRepository } from "@/lib/data/repository";
import { CREDIT_PRICE_VERSION } from "@/lib/domain/credit-pricing";
import { CREDIT_BUCKETS, CREDIT_ENTRY_TYPES, type CreditBalance, type CreditEntry } from "@/lib/domain/credits";

const FAR_FUTURE = "2090-01-01T00:00:00.000Z";
const LONG_AGO = "2020-01-01T00:00:00.000Z";

function expectBalanceShape(balance: CreditBalance) {
  for (const value of [balance.available, balance.monthly, balance.purchased, balance.held]) {
    expect(Number.isInteger(value) && value >= 0, `bakiye alanı negatif olmayan tam sayı: ${value}`).toBe(true);
  }
  expect(balance.available, "kullanılabilir = aylık + ek").toBe(balance.monthly + balance.purchased);
  if (balance.nextExpiry !== undefined) {
    expect(Date.parse(balance.nextExpiry.at)).not.toBeNaN();
    expect(CREDIT_BUCKETS).toContain(balance.nextExpiry.bucket);
    expect(balance.nextExpiry.amount).toBeGreaterThan(0);
    expect(balance.nextExpiry.amount).toBeLessThanOrEqual(balance[balance.nextExpiry.bucket]);
  }
}

function expectEntryShape(entry: CreditEntry) {
  const label = `${entry.id} (${entry.type})`;
  expect(CREDIT_ENTRY_TYPES, label).toContain(entry.type);
  expect(CREDIT_BUCKETS, label).toContain(entry.bucket);
  expect(Number.isInteger(entry.amount) && entry.amount !== 0, `${label}: işaretli tam sayı`).toBe(true);
  expect(Date.parse(entry.createdAt), label).not.toBeNaN();
  // Parti açan satır artıdır ve partisizdir; partiye işleyen satır partisini gösterir ve son kullanma taşımaz.
  if (entry.lotId === undefined) expect(entry.amount, `${label}: parti açan satır artı`).toBeGreaterThan(0);
  else expect(entry.expiresAt, `${label}: son kullanma partidedir`).toBeUndefined();
  if (entry.type === "charge") {
    expect(entry.amount, `${label}: düşüm eksi`).toBeLessThan(0);
    expect(entry.lotId, `${label}: düşümün partisi`).toBeDefined();
    expect(entry.holdId, `${label}: düşümün ayırması`).toBeDefined();
  }
}

const chargesOf = async (r: PanelRepository, wsId: string, holdId: string) =>
  (await r.listCreditEntries(wsId, { types: ["charge"], limit: 200 })).filter((entry) => entry.holdId === holdId);
const sum = (entries: CreditEntry[], bucket?: CreditEntry["bucket"]) =>
  entries.filter((entry) => bucket === undefined || entry.bucket === bucket).reduce((total, entry) => total + entry.amount, 0);

export function creditsContract(ctx: ContractContext): void {
  const { wsId, foreign, creditOps } = ctx;
  /** Koşuya özgü anahtar öneki: paylaşılan hesapta önceki koşunun anahtarlarıyla çakışmaz. */
  const run = Math.random().toString(36).slice(2, 10);
  const key = (name: string) => `ct-${run}-${name}`;

  it("kredi: bakiye şekli tutarlı; hareketler yeniden eskiye; bilinmeyen workspace → not_found / boş", async () => {
    const r = ctx.create();
    expectBalanceShape(await r.getCreditBalance(wsId));
    const entries = await r.listCreditEntries(wsId, { limit: 200 });
    for (const entry of entries) expectEntryShape(entry);
    const times = entries.map((entry) => Date.parse(entry.createdAt));
    expect(times, "yeniden eskiye").toEqual([...times].sort((a, b) => b - a));
    expect((await r.listCreditEntries(wsId, { limit: 1 })).length).toBeLessThanOrEqual(1);
    expect(await r.listCreditEntries(wsId, { types: [] })).toEqual([]);

    await expectCode(r.getCreditBalance(foreign), "not_found");
    await expectCode(r.reserveCredits(foreign, { amount: 1, key: key("foreign") }), "not_found");
    await expectCode(r.releaseCredits(foreign, key("foreign")), "not_found");
  });

  it("kredi: ver → ayır → kesinleştir → bakiye; fark serbest kalır; düşüm satırı işi, birimi, fiyat sürümünü taşır; iş başına tek açık ayırma", async () => {
    const r = ctx.create();
    const [job] = await r.listJobs(wsId, { active: false, limit: 1 });
    expect(job, "seed: bitmiş iş").toBeDefined();
    const before = await r.getCreditBalance(wsId);

    const granted = await creditOps.grant(r, { type: "purchase", amount: 100, key: key("flow-grant"), workspaceId: wsId, note: "Sözleşme testi" });
    expect(granted).toMatchObject({ type: "purchase", amount: 100, bucket: "purchased", workspaceId: wsId, note: "Sözleşme testi" });
    expect(granted.lotId, "verme parti açar").toBeUndefined();
    expect(Date.parse(granted.expiresAt ?? ""), "ek kredi süreli (verilmezse 12 ay)").toBeGreaterThan(Date.parse(granted.createdAt));
    const afterGrant = await r.getCreditBalance(wsId);
    expect([afterGrant.available, afterGrant.purchased, afterGrant.monthly, afterGrant.held]).toEqual([before.available + 100, before.purchased + 100, before.monthly, before.held]);

    const hold = await r.reserveCredits(wsId, { amount: 60, key: key("flow"), panelJobId: job.id });
    expect(hold).toMatchObject({ key: key("flow"), amount: 60, status: "open", workspaceId: wsId, panelJobId: job.id });
    expect([hold.charged, hold.closedAt], "açık ayırma kesinleşmemiştir (0 değil)").toEqual([undefined, undefined]);
    await expectCode(r.reserveCredits(wsId, { amount: 5, key: key("flow-second"), panelJobId: job.id }), "already_exists");
    const afterHold = await r.getCreditBalance(wsId);
    expect([afterHold.available, afterHold.held], "ayrılan kullanılabilirden düşer").toEqual([before.available + 40, before.held + 60]);
    expectBalanceShape(afterHold);
    expect(await chargesOf(r, wsId, hold.id), "ayırma deftere satır yazmaz").toEqual([]);

    const units = { video_review: 4, briefing: 1 };
    const settled = await creditOps.settle(r, { key: key("flow"), actual: 45, units, priceVersion: CREDIT_PRICE_VERSION });
    expect(settled).toMatchObject({ id: hold.id, status: "settled", amount: 60, charged: 45, units, priceVersion: CREDIT_PRICE_VERSION });
    expect(Date.parse(settled.closedAt ?? "")).not.toBeNaN();
    const afterSettle = await r.getCreditBalance(wsId);
    expect([afterSettle.available, afterSettle.held], "gerçekleşen düşer, fark (15) serbest kalır").toEqual([before.available + 55, before.held]);

    const charges = await chargesOf(r, wsId, hold.id);
    expect(sum(charges), "düşüm satırlarının toplamı = gerçekleşen").toBe(-45);
    for (const charge of charges) {
      expectEntryShape(charge);
      expect(charge).toMatchObject({ type: "charge", workspaceId: wsId, panelJobId: job.id, units, priceVersion: CREDIT_PRICE_VERSION });
    }
    const mine = await r.listCreditEntries(wsId, { onlyWorkspace: true, limit: 200 });
    expect(mine.every((entry) => entry.workspaceId === wsId), "onlyWorkspace yalnız bu çalışma alanının satırları").toBe(true);
    expect(mine.map((entry) => entry.id)).toEqual(expect.arrayContaining([granted.id, ...charges.map((charge) => charge.id)]));
    // Hesapta satır VARKEN: bilinmeyen çalışma alanının kimliğiyle hareketler okunamaz (boş defterde boşuna geçmesin diye burada).
    expect(await r.listCreditEntries(foreign, { limit: 200 })).toEqual([]);
    // Bağlı iş doğrulanır: biçimsiz kimlik invalid_input, olmayan iş not_found; hiçbir ayırma oluşmaz.
    await expectCode(r.reserveCredits(wsId, { amount: 1, key: key("bad-job"), panelJobId: "boyle-bir-is-yok" }), "invalid_input");
    await expectCode(r.reserveCredits(wsId, { amount: 1, key: key("no-job"), panelJobId: "00000000-0000-4000-8000-00000000dead" }), "not_found");
    expect((await r.getCreditBalance(wsId)).held, "reddedilen ayırma kredi tutmaz").toBe(before.held);
  });

  it("kredi: yetersizde insufficient_credits (istenen + harcanabilir bildirilir); bakiye değişmez, ayırma oluşmaz", async () => {
    const r = ctx.create();
    const before = await r.getCreditBalance(wsId);
    await expect(r.reserveCredits(wsId, { amount: before.available + 1, key: key("short") })).rejects.toMatchObject({
      name: "RepositoryError",
      code: "insufficient_credits",
      requested: before.available + 1,
      available: before.available,
    });
    expect(await r.getCreditBalance(wsId)).toEqual(before);
    await expectCode(r.releaseCredits(wsId, key("short")), "not_found");
  });

  it("kredi: idempotency: aynı anahtarla ikinci verme / ayırma / kesinleştirme ilk sonucu döndürür, ikinci kez yazmaz; farklı tutar invalid_input", async () => {
    const r = ctx.create();
    const before = await r.getCreditBalance(wsId);
    const grant = { type: "purchase", amount: 80, key: key("idem-grant") } as const;
    const first = await creditOps.grant(r, grant);
    expect((await creditOps.grant(r, grant)).id, "ikinci verme aynı satır").toBe(first.id);
    await expectCode(creditOps.grant(r, { ...grant, amount: 81 }), "invalid_input");
    expect((await r.getCreditBalance(wsId)).available, "bir kez verildi").toBe(before.available + 80);

    const hold = await r.reserveCredits(wsId, { amount: 50, key: key("idem") });
    expect((await r.reserveCredits(wsId, { amount: 50, key: key("idem") })).id, "ikinci ayırma aynı ayırma").toBe(hold.id);
    await expectCode(r.reserveCredits(wsId, { amount: 51, key: key("idem") }), "invalid_input");
    expect((await r.getCreditBalance(wsId)).held, "bir kez ayrıldı").toBe(before.held + 50);

    await creditOps.settle(r, { key: key("idem"), actual: 20 });
    const again = await creditOps.settle(r, { key: key("idem"), actual: 50 });
    expect([again.id, again.status, again.charged], "ikinci kesinleştirme ilk sonucu döndürür").toEqual([hold.id, "settled", 20]);
    expect(sum(await chargesOf(r, wsId, hold.id)), "bir kez düşüldü").toBe(-20);
    // Kesinleşmiş ayırmayı bırakmak düşümü geri almaz; kapanmış anahtarla yeniden ayırma "ayrıldı" DÖNMEZ (iş kredisiz koşmasın).
    expect((await r.releaseCredits(wsId, key("idem"))).status).toBe("settled");
    await expectCode(r.reserveCredits(wsId, { amount: 50, key: key("idem") }), "invalid_state");
    const after = await r.getCreditBalance(wsId);
    expect([after.available, after.held]).toEqual([before.available + 60, before.held]);
  });

  it("kredi: bırakma: ayrılan düşülmeden geri açılır; tekrar bırakma aynı sonucu verir; bırakılmış ayırma kesinleştirilemez", async () => {
    const r = ctx.create();
    await creditOps.grant(r, { type: "purchase", amount: 30, key: key("release-grant") });
    const before = await r.getCreditBalance(wsId);
    const hold = await r.reserveCredits(wsId, { amount: 30, key: key("release") });
    expect((await r.getCreditBalance(wsId)).available).toBe(before.available - 30);

    const released = await r.releaseCredits(wsId, key("release"));
    expect([released.id, released.status, released.charged], "bırakılan ayırma düşülmemiştir").toEqual([hold.id, "released", undefined]);
    expect(Date.parse(released.closedAt ?? "")).not.toBeNaN();
    expect((await r.releaseCredits(wsId, key("release"))).status).toBe("released");
    await expectCode(r.reserveCredits(wsId, { amount: 30, key: key("release") }), "invalid_state");
    await expectCode(creditOps.settle(r, { key: key("release"), actual: 10 }), "invalid_state");
    expect(await r.getCreditBalance(wsId), "bakiye ayırmadan önceki haline döndü").toEqual(before);
    expect(await chargesOf(r, wsId, hold.id)).toEqual([]);
  });

  it("kredi: iki kova: ÖNCE aylık harcanır; kesinleşen tutar kovalara bölünür, artan ek kredide kalır", async () => {
    const r = ctx.create();
    const monthlyGrant = await creditOps.grant(r, { type: "grant_monthly", amount: 30, key: key("bucket-monthly"), expiresAt: FAR_FUTURE });
    expect(monthlyGrant).toMatchObject({ type: "grant_monthly", bucket: "monthly", expiresAt: FAR_FUTURE });
    await creditOps.grant(r, { type: "purchase", amount: 50, key: key("bucket-purchased"), expiresAt: FAR_FUTURE });
    const start = await r.getCreditBalance(wsId);
    expect(start.monthly, "aylık kovada kredi var").toBeGreaterThanOrEqual(30);
    expect(start.purchased).toBeGreaterThanOrEqual(50);
    expect(start.nextExpiry, "süreli kredi varken ilk dolacak bildirilir").toBeDefined();

    // Aylığın tamamı + ek krediden 20 ayrılır.
    const hold = await r.reserveCredits(wsId, { amount: start.monthly + 20, key: key("bucket") });
    const held = await r.getCreditBalance(wsId);
    expect([held.monthly, held.purchased], "ayırma önce aylık kovayı tüketir").toEqual([0, start.purchased - 20]);

    // Gerçekleşen: aylığın tamamı + 5. Ek krediden ayrılan 20'nin 15'i geri açılır.
    await creditOps.settle(r, { key: key("bucket"), actual: start.monthly + 5 });
    const end = await r.getCreditBalance(wsId);
    expect([end.monthly, end.purchased, end.held]).toEqual([0, start.purchased - 5, start.held]);
    const charges = await chargesOf(r, wsId, hold.id);
    expect([sum(charges, "monthly"), sum(charges, "purchased")], "düşüm kovalara bölündü").toEqual([-start.monthly, -5]);
  });

  it("kredi: süresi dolmuş kredi defterde durur ama bakiyeye girmez ve ayrılamaz", async () => {
    const r = ctx.create();
    const before = await r.getCreditBalance(wsId);
    const dead = await creditOps.grant(r, { type: "grant_monthly", amount: 40, key: key("expired"), expiresAt: LONG_AGO });
    expect(dead).toMatchObject({ amount: 40, bucket: "monthly", expiresAt: LONG_AGO });
    expect(await r.getCreditBalance(wsId), "süresi dolmuş kredi bakiyeyi değiştirmez").toEqual(before);
    await expectCode(r.reserveCredits(wsId, { amount: before.available + 1, key: key("expired-hold") }), "insufficient_credits");
    expect((await r.listCreditEntries(wsId, { types: ["grant_monthly"], limit: 200 })).map((entry) => entry.id), "satır defterde durur").toContain(dead.id);
  });

  it("kredi: geçersiz girdi invalid_input (satır bırakmaz); gerçekleşen ayrılanı aşamaz; olmayan ayırma not_found", async () => {
    const r = ctx.create();
    await creditOps.grant(r, { type: "purchase", amount: 10, key: key("invalid-grant") });
    const before = await r.getCreditBalance(wsId);
    const bad: unknown[] = [
      { amount: 0, key: key("bad") },
      { amount: -5, key: key("bad") },
      { amount: 1.5, key: key("bad") },
      { amount: 1, key: "boşluklu anahtar" },
      { amount: 1, key: "" },
      { amount: 1 },
      { amount: 1, key: key("bad"), ownerUserId: "00000000-0000-4000-8000-000000000000" },
    ];
    for (const input of bad) await expectCode(r.reserveCredits(wsId, input as never), "invalid_input");
    await expectCode(r.releaseCredits(wsId, "boşluklu anahtar"), "invalid_input");
    await expectCode(creditOps.grant(r, { type: "grant_monthly", amount: 5, key: key("bad-grant") }), "invalid_input");
    await expectCode(creditOps.grant(r, { type: "purchase", amount: 5, key: key("bad-grant"), bucket: "monthly" }), "invalid_input");
    await expectCode(creditOps.grant(r, { type: "charge", amount: 5, key: key("bad-grant") } as never), "invalid_input");
    await expectCode(creditOps.settle(r, { key: key("yok"), actual: 1 }), "not_found");
    await expectCode(r.releaseCredits(wsId, key("yok")), "not_found");

    await r.reserveCredits(wsId, { amount: 10, key: key("exceed") });
    await expectCode(creditOps.settle(r, { key: key("exceed"), actual: 11 }), "invalid_input");
    await expectCode(creditOps.settle(r, { key: key("exceed"), actual: -1 }), "invalid_input");
    await expectCode(creditOps.settle(r, { key: key("exceed"), actual: 1, units: { bilinmeyen: 1 } as never }), "invalid_input");
    expect((await r.releaseCredits(wsId, key("exceed"))).status, "reddedilen kesinleştirme ayırmayı kapatmaz").toBe("released");
    expect(await r.getCreditBalance(wsId), "geçersiz girdiler hiçbir şey yazmadı").toEqual(before);
  });
}
