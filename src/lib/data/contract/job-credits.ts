/**
 * Sözleşme parçası: panel işi ↔ kredi (Dilim 3). İKİ MOD: zorlama KAPALI depo (`create()`; varsayılan) hiçbir işi krediye bağlamaz;
 * zorlama AÇIK depo (`createEnforced()`) iş isteğinde kredi ayırır. DAVRANIŞ (açık): ayırma iş satırıyla birliktedir (yetmezse
 * `insufficient_credits` ve iş de yazılmaz); onay kaydı `credits` dayanağı + tavan taşır; onaylanan daha düşük tavan geçerlidir, güvenli üst
 * sınırı aşamaz; sıradaki işin iptali ayırmayı düşmeden bırakır; çalışan işin iptali ayırmaya dokunmaz (işçi kapatır); kredi harcamayan tür
 * ve önizleme ayırmaz; kredi onayı USD onayının yerine GEÇMEZ.
 *
 * GÜVENLİK: süit yalnız $0 işler açar (notlar, inceleme, plan: test kuyruğunda, hiç koşturulmaz) ve ONAYLI (USD) HARCAMA İŞİ HİÇ OLUŞTURMAZ.
 * Depo TEST kullanıcısının hesabıyla kuruludur. Beklentiler FARKLA yazılır; her test açtığı işi ve ayırmayı kapatır.
 */
import { expect, it } from "vitest";

import { expectCode, type ContractContext } from "@/lib/data/contract/support";
import type { PanelRepository } from "@/lib/data/repository";
import { jobCreditCeiling, jobCreditKey } from "@/lib/domain/job-credits";
import { isActiveJob } from "@/lib/domain/panel-job";

export function jobCreditsContract(ctx: ContractContext): void {
  const { wsId, create, createEnforced, creditOps, jobWorker } = ctx;
  const run = Math.random().toString(36).slice(2, 10);
  const key = (name: string) => `jc-${run}-${name}`;

  /** Testin açtığı işi ve (kaldıysa) ayırmasını kapatır. */
  async function cleanup(r: PanelRepository, jobId: string | undefined): Promise<void> {
    if (jobId === undefined) return;
    const job = await r.getJob(wsId, jobId);
    if (job !== null && isActiveJob(job)) {
      if (job.status === "running") await jobWorker.finish(r, jobId);
      else await r.cancelJob(wsId, jobId);
    }
    await r.releaseCredits(wsId, jobCreditKey(jobId)).catch(() => undefined);
  }
  const holdStatus = async (r: PanelRepository, jobId: string) => (await r.releaseCredits(wsId, jobCreditKey(jobId))).status;

  it("iş ↔ kredi · zorlama KAPALI: iş krediye bağlanmaz (onay yok, ayırma yok); verilen kredi sınırı yok sayılır", async () => {
    const r = create();
    const before = await r.getCreditBalance(wsId);
    let jobId: string | undefined;
    try {
      const job = await r.requestJob(wsId, { kind: "briefing", maxCredits: 4 });
      jobId = job.id;
      expect(job.approval, "zorlama kapalı: kredi onayı yazılmaz").toBeUndefined();
      expect(await r.getCreditBalance(wsId), "bakiye ve ayrılan değişmez").toEqual(before);
      await expectCode(r.releaseCredits(wsId, jobCreditKey(job.id)), "not_found");
    } finally {
      await cleanup(r, jobId);
    }
  });

  it("iş ↔ kredi · zorlama AÇIK: istek krediyi ayırır (dayanak credits + tavan); sıradaki işin iptali düşmeden bırakır", async () => {
    const r = createEnforced();
    await creditOps.grant(r, { type: "purchase", amount: 100, key: key("grant-flow") });
    const before = await r.getCreditBalance(wsId);
    let jobId: string | undefined;
    try {
      const job = await r.requestJob(wsId, { kind: "briefing" });
      jobId = job.id;
      expect(job.status).toBe("queued");
      expect(job.approval).toMatchObject({ basis: "credits", maxCredits: jobCreditCeiling("briefing") });
      expect(job.approval?.maxUsd, "kredi onayı USD yetkisi taşımaz").toBeUndefined();
      expect(job.approval?.approvedBy.trim()).toBeTruthy();
      const held = await r.getCreditBalance(wsId);
      expect([held.available, held.held], "tavan kadar kredi ayrıldı").toEqual([before.available - 4, before.held + 4]);

      expect((await r.cancelJob(wsId, job.id)).status).toBe("cancelled");
      expect(await r.getCreditBalance(wsId), "iptal ayırmayı düşmeden bıraktı").toEqual(before);
      expect(await holdStatus(r, job.id)).toBe("released");
      expect((await r.listCreditEntries(wsId, { types: ["charge"], limit: 200 })).some((entry) => entry.panelJobId === job.id), "düşüm satırı yok").toBe(false);
    } finally {
      await cleanup(r, jobId);
    }
  });

  it("iş ↔ kredi · onaylanan daha düşük tavan geçerlidir; güvenli üst sınırı aşan onay sınıra iner", async () => {
    const r = createEnforced();
    await creditOps.grant(r, { type: "purchase", amount: 250, key: key("grant-cap") });
    const before = await r.getCreditBalance(wsId);
    for (const [maxCredits, expected] of [
      [30, 30],
      [5000, jobCreditCeiling("analyze")],
    ] as const) {
      let jobId: string | undefined;
      try {
        const job = await r.requestJob(wsId, { kind: "analyze", maxCredits });
        jobId = job.id;
        expect(job.approval?.maxCredits, `istenen ${maxCredits}`).toBe(expected);
        expect((await r.getCreditBalance(wsId)).held).toBe(before.held + expected);
      } finally {
        await cleanup(r, jobId);
      }
      expect(await r.getCreditBalance(wsId), "her iş kapanınca bakiye başa döner").toEqual(before);
    }
  });

  it("iş ↔ kredi · yetersizde insufficient_credits: iş satırı da YAZILMAZ, bakiye değişmez", async () => {
    const r = createEnforced();
    await creditOps.grant(r, { type: "purchase", amount: 10, key: key("grant-short") });
    const start = await r.getCreditBalance(wsId);
    // Kullanılabilir krediyi 3'e indir: notlar işi 4 kredi ister.
    await r.reserveCredits(wsId, { amount: start.available - 3, key: key("squeeze") });
    try {
      const before = await r.getCreditBalance(wsId);
      expect(before.available).toBe(3);
      const jobsBefore = (await r.listJobs(wsId, { limit: 200 })).length;
      await expect(r.requestJob(wsId, { kind: "briefing" })).rejects.toMatchObject({ name: "RepositoryError", code: "insufficient_credits", requested: 4, available: 3 });
      expect(await r.listJobs(wsId, { active: true }), "kuyrukta kredisiz iş kalmadı").toEqual([]);
      expect((await r.listJobs(wsId, { limit: 200 })).length, "hiçbir iş satırı yazılmadı").toBe(jobsBefore);
      expect(await r.getCreditBalance(wsId)).toEqual(before);
    } finally {
      await r.releaseCredits(wsId, key("squeeze"));
    }
    expect(await r.getCreditBalance(wsId)).toEqual(start);
  });

  it("iş ↔ kredi · kredi harcamayan tür ve önizleme ayırmaz; kredi sınırı onlarda geçersiz girdi; kredi onayı USD onayının yerine geçmez", async () => {
    const r = createEnforced();
    const before = await r.getCreditBalance(wsId);
    for (const input of [{ kind: "label" }, { kind: "routine", dryRun: true }, { kind: "collect", dryRun: true }] as const) {
      let jobId: string | undefined;
      try {
        const job = await r.requestJob(wsId, input);
        jobId = job.id;
        expect(job.approval, JSON.stringify(input)).toBeUndefined();
        expect(await r.getCreditBalance(wsId), JSON.stringify(input)).toEqual(before);
      } finally {
        await cleanup(r, jobId);
      }
    }
    await expectCode(r.requestJob(wsId, { kind: "label", maxCredits: 10 }), "invalid_input");
    await expectCode(r.requestJob(wsId, { kind: "routine", dryRun: true, maxCredits: 10 }), "invalid_input");
    for (const maxCredits of [0, -1, 1.5]) await expectCode(r.requestJob(wsId, { kind: "plan", maxCredits }), "invalid_input");
    // Toplama gerçek koşuda USD onayı ister: kredi sınırı tek başına yetmez (satır yazılmaz, kredi ayrılmaz).
    await expectCode(r.requestJob(wsId, { kind: "collect", maxCredits: 40 }), "invalid_input");
    await expectCode(r.requestJob(wsId, { kind: "measure", maxCredits: 4 }), "invalid_input");
    expect(await r.listJobs(wsId, { active: true })).toEqual([]);
    expect(await r.getCreditBalance(wsId)).toEqual(before);
  });

  it("iş ↔ kredi · çalışan işin iptali ayırmaya dokunmaz (işçi kapatır); işçi kesinleştirince yalnız yapılan düşer", async () => {
    const r = createEnforced();
    await creditOps.grant(r, { type: "purchase", amount: 60, key: key("grant-running") });
    const before = await r.getCreditBalance(wsId);
    let jobId: string | undefined;
    try {
      const job = await r.requestJob(wsId, { kind: "analyze", maxCredits: 50 });
      jobId = job.id;
      expect(await jobWorker.claim(r)).toBe(job.id);
      const cancelled = await r.cancelJob(wsId, job.id);
      expect([cancelled.status, cancelled.cancelRequestedAt !== undefined]).toEqual(["running", true]);
      expect((await r.getCreditBalance(wsId)).held, "çalışan işin ayırması açık kalır").toBe(before.held + 50);

      // İşçi: 2 video tamamlandı (20 kredi), iş kapandı.
      const settled = await creditOps.settle(r, { key: jobCreditKey(job.id), actual: 20, units: { video_review: 2 } });
      expect(settled).toMatchObject({ status: "settled", amount: 50, charged: 20 });
      await jobWorker.finish(r, job.id);
      const after = await r.getCreditBalance(wsId);
      expect([after.available, after.held], "yapılan düştü, kalan 30 serbest").toEqual([before.available - 20, before.held]);
    } finally {
      await cleanup(r, jobId);
    }
  });
}
