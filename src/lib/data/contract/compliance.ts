/**
 * Sözleşme parçası: yayın uyumu (kural motoru `lib/compliance` depoda da çalışır), Trial Reels / reklam veren alanları ve
 * workspace uyum bölgesi. "İnsan onayı `fail`'i atlayamaz": onaya gönderme ve onay uyum `fail`'inde `invalid_state` verir.
 *
 * Temizlik: her test kendi oluşturduğu işleri iptal eder (`cancelJobs`) ve uyum bölgesini özgün değere geri yazar.
 * Seed'e bağımlılık yok: onay engeli, bölgeyi sonradan değiştirerek (bir iş TR'de uyumlu, US'de değil) sınanır.
 */
import { expect, it } from "vitest";

import { COMPLIANCE_REGIONS, type ComplianceRegion } from "@/lib/domain/compliance";
import { ADVERTISER_NAME_MAX } from "@/lib/domain/publish";
import { MAX_PAGE_LIMIT, type CreatePublishJobInput } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { cancelJobs, expectCode, expectJobsCancelled, type ContractContext } from "@/lib/data/contract/support";

const COMPLIANCE_MESSAGE = /^Uyum denetimi başarısız:/;

export function complianceContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  async function connectedAccountId(r: PanelRepository): Promise<string> {
    const account = (await r.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("seed: bağlı hesap yok");
    return account.id;
  }

  /** Test bölgeyi değiştirir; her durumda özgün bölgeye döner. */
  async function withRegion<T>(r: PanelRepository, region: ComplianceRegion, run: () => Promise<T>): Promise<T> {
    const before = (await r.getWorkspace(wsId))?.complianceRegion;
    if (before === undefined) throw new Error("seed: workspace complianceRegion dolu olmalı");
    try {
      await r.updateWorkspace(wsId, { complianceRegion: region });
      return await run();
    } finally {
      await r.updateWorkspace(wsId, { complianceRegion: before });
    }
  }

  function tracker(r: PanelRepository) {
    const created: string[] = [];
    return {
      created,
      async make(input: CreatePublishJobInput) {
        const job = await r.createPublishJob(wsId, input);
        created.push(job.id);
        return job;
      },
    };
  }

  const countJobs = async (r: PanelRepository) => (await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT })).length;

  it("workspace uyum bölgesi: geçerli değer, güncelleme yalnız o alanı değiştirir ve geri yazılır; geçersiz değer invalid_input", async () => {
    const r = create();
    const before = await r.getWorkspace(wsId);
    expect(COMPLIANCE_REGIONS).toContain(before?.complianceRegion);
    if (!before) throw new Error("seed: workspace yok");
    try {
      for (const region of COMPLIANCE_REGIONS) {
        const updated = await r.updateWorkspace(wsId, { complianceRegion: region });
        expect(updated).toMatchObject({ complianceRegion: region, nicheBrief: before.nicheBrief, apifyMonthlyCapUsd: before.apifyMonthlyCapUsd });
        expect((await r.getWorkspace(wsId))?.complianceRegion).toBe(region);
      }
      const current = (await r.getWorkspace(wsId))?.complianceRegion;
      expect((await r.updateWorkspace(wsId, { nicheBrief: before.nicheBrief ?? "" })).complianceRegion, "verilmeyen alan değişmez").toBe(current);
      for (const bad of ["EU", "tr", "", null, 1, ["TR"]]) {
        await expectCode(r.updateWorkspace(wsId, { complianceRegion: bad as ComplianceRegion }), "invalid_input");
      }
      expect((await r.getWorkspace(wsId))?.complianceRegion, "reddedilen değer uygulanmaz").toBe(current);
    } finally {
      await r.updateWorkspace(wsId, { complianceRegion: before.complianceRegion });
    }
    expect((await r.getWorkspace(wsId))?.complianceRegion).toBe(before.complianceRegion);
  });

  it("reklam veren adı ve Trial Reels: varsayılan yok; kırpılır; geçersiz girdi invalid_input", async () => {
    const r = create();
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    try {
      const plain = await make({ socialAccountId: accountId, caption: "Sade" });
      expect([plain.advertiserName, plain.trial], "verilmezse alan yok").toEqual([undefined, undefined]);

      const detailed = await make({
        socialAccountId: accountId,
        caption: "Ayrıntılı",
        advertiserName: "  Kahveci Ltd  ",
        trial: { enabled: true, graduation: "performance" },
      });
      expect(detailed.advertiserName).toBe("Kahveci Ltd");
      expect(detailed.trial).toEqual({ enabled: true, graduation: "performance" });
      expect((await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT })).find((j) => j.id === detailed.id)).toMatchObject({
        advertiserName: "Kahveci Ltd",
        trial: { enabled: true, graduation: "performance" },
      });
      expect((await make({ socialAccountId: accountId, advertiserName: "   " })).advertiserName, "boş ad = yok").toBeUndefined();
      expect((await make({ socialAccountId: accountId, trial: { enabled: false, graduation: "manual" } })).trial).toEqual({ enabled: false, graduation: "manual" });
      expect((await make({ socialAccountId: accountId, advertiserName: "x".repeat(ADVERTISER_NAME_MAX) })).advertiserName).toHaveLength(ADVERTISER_NAME_MAX);

      const before = await countJobs(r);
      const bad: Partial<CreatePublishJobInput>[] = [
        { advertiserName: "x".repeat(ADVERTISER_NAME_MAX + 1) },
        { advertiserName: 42 as unknown as string },
        { trial: { enabled: true, graduation: "auto" as unknown as "manual" } },
        { trial: { enabled: "evet" as unknown as boolean, graduation: "manual" } },
        { trial: { enabled: true } as unknown as CreatePublishJobInput["trial"] },
        { trial: { enabled: true, graduation: "manual", extra: 1 } as unknown as CreatePublishJobInput["trial"] },
      ];
      for (const extra of bad) await expectCode(r.createPublishJob(wsId, { socialAccountId: accountId, caption: "Geçersiz", ...extra }), "invalid_input");
      expect(await countJobs(r), "reddedilen iş oluşmaz").toBe(before);
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });

  it("uyum fail'i onaya gönderme ve doğrudan onay bekliyor açmayı engeller (invalid_state + Türkçe mesaj); taslak açılabilir, warn engellemez", async () => {
    const r = create();
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    try {
      await withRegion(r, "TR", async () => {
        // Ücretli iş birliği + ibare yok → fail.
        const noLabel = { socialAccountId: accountId, caption: "Harika ürün #kahve", paidPartnership: true };
        const draft = await make(noLabel); // taslak serbest
        await expect(r.submitPublishJob(wsId, draft.id)).rejects.toMatchObject({ name: "RepositoryError", code: "invalid_state", message: expect.stringMatching(COMPLIANCE_MESSAGE) });
        expect((await r.listPublishJobs(wsId, { status: "draft" })).some((j) => j.id === draft.id), "engellenen iş taslakta kalır").toBe(true);
        const before = await countJobs(r);
        await expect(r.createPublishJob(wsId, { ...noLabel, status: "awaiting_approval" })).rejects.toMatchObject({ code: "invalid_state", message: expect.stringContaining("Reklam") });
        expect(await countJobs(r), "engellenen iş oluşmaz").toBe(before);

        // YZ işaretli + beyan yok → fail; beyan varsa geçer.
        const ai = { socialAccountId: accountId, aiGenerated: true };
        await expectCode(r.createPublishJob(wsId, { ...ai, caption: "Güzel video", status: "awaiting_approval" }), "invalid_state");
        const aiOk = await make({ ...ai, caption: "Yapay zekâ ile üretildi. Güzel video", status: "awaiting_approval" });
        expect(aiOk.status).toBe("awaiting_approval");

        // İbare var, reklam veren yok → yalnız warn: engel yok, onaya gider ve onaylanır.
        const warnOnly = await make({ socialAccountId: accountId, caption: "Reklam · harika ürün #kahve", paidPartnership: true });
        expect((await r.submitPublishJob(wsId, warnOnly.id)).status).toBe("awaiting_approval");
        expect((await r.approvePublishJob(wsId, warnOnly.id)).status).toBe("approved");

        // Ad ve ibare tam → ok.
        const full = await make({ socialAccountId: accountId, caption: "Tanıtım: Kahveci Ltd ile", paidPartnership: true, advertiserName: "Kahveci Ltd", status: "awaiting_approval" });
        expect(full.status).toBe("awaiting_approval");
      });
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });

  it("insan onayı fail'i atlayamaz: onay anında uyum yeniden denetlenir (bölge sonradan değişmiş olabilir); iş onay bekliyor kalır", async () => {
    const r = create();
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    try {
      // TR'de uyumlu (ibare "Reklam"), US'de değil (#ad/Ad/Sponsored yok).
      const job = await withRegion(r, "TR", () =>
        make({ socialAccountId: accountId, caption: "Reklam · yeni ürün Kahveci Ltd", paidPartnership: true, advertiserName: "Kahveci Ltd", status: "awaiting_approval" }),
      );
      expect(job.status).toBe("awaiting_approval");

      await withRegion(r, "US", async () => {
        await expect(r.approvePublishJob(wsId, job.id)).rejects.toMatchObject({ name: "RepositoryError", code: "invalid_state", message: expect.stringMatching(COMPLIANCE_MESSAGE) });
        const stuck = (await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT })).find((j) => j.id === job.id);
        expect(stuck?.status).toBe("awaiting_approval");
        expect([stuck?.approvedAt, stuck?.approvedBy], "engellenen onay kaydı bırakmaz").toEqual([undefined, undefined]);
      });
      await withRegion(r, "TR_US", async () => {
        await expectCode(r.approvePublishJob(wsId, job.id), "invalid_state");
      });

      // Bölge TR'ye dönünce (ya da ibare yeterliyse) onaylanabilir.
      await withRegion(r, "TR", async () => {
        const approved = await r.approvePublishJob(wsId, job.id);
        expect(approved.status).toBe("approved");
        expect(approved.approvedBy?.trim()).toBeTruthy();
      });

      // ABD'de #ad ilk 100 karakterdeyse geçer.
      const us = await withRegion(r, "US", () => make({ socialAccountId: accountId, caption: "#ad New drop", paidPartnership: true, status: "awaiting_approval" }));
      await withRegion(r, "US", async () => expect((await r.approvePublishJob(wsId, us.id)).status).toBe("approved"));
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });
}
