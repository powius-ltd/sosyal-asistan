import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { updateComplianceRegion } from "@/app/actions/compliance-settings";
import { createPublishJob } from "@/app/actions/publish";
import { getPanelContext } from "@/lib/data";
import { RepositoryError } from "@/lib/data/repository";

async function workspace() {
  const { repo, wsId } = await getPanelContext();
  const ws = await repo.getWorkspace(wsId);
  if (!ws) throw new Error("Testte kullanılacak workspace yok (mock veri).");
  return ws;
}

beforeEach(async () => {
  const { repo, wsId } = await getPanelContext();
  await repo.updateWorkspace(wsId, { complianceRegion: "TR" });
  revalidatePath.mockClear();
});

describe("updateComplianceRegion (mock depo)", () => {
  it("geçerli bölgeyi kaydeder; yalnız bölge değişir; Ayarlar ve Yayın yenilenir", async () => {
    const before = await workspace();
    for (const region of ["US", "TR_US", "TR"] as const) {
      revalidatePath.mockClear();
      expect(await updateComplianceRegion({ complianceRegion: region })).toEqual({ ok: true });
      const after = await workspace();
      expect(after.complianceRegion).toBe(region);
      expect(after.apifyMonthlyCapUsd).toBe(before.apifyMonthlyCapUsd);
      expect(after.llmMonthlyCapUsd).toBe(before.llmMonthlyCapUsd);
      expect(after.nicheBrief).toBe(before.nicheBrief);
      expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
      expect(revalidatePath).toHaveBeenCalledWith("/yayin");
    }
  });

  it("geçersiz girdi depoya gitmeden Türkçe mesajla reddedilir; bölge değişmez", async () => {
    const cases: [unknown, RegExp][] = [
      [{ complianceRegion: "EU" }, /TR, US ya da TR_US/],
      [{ complianceRegion: "" }, /TR, US ya da TR_US/],
      [{ complianceRegion: 5 }, /TR, US ya da TR_US/],
      [{ complianceRegion: null }, /TR, US ya da TR_US/],
      [{}, /Uyum bölgesi seç/], // seçim zorunlu
    ];
    for (const [input, message] of cases) {
      const result = await updateComplianceRegion(input);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message).toMatch(message);
    }
    expect((await updateComplianceRegion(null)).ok).toBe(false);
    expect((await updateComplianceRegion("US")).ok).toBe(false);
    expect((await workspace()).complianceRegion).toBe("TR");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("bölge dışındaki alanlar (tavan, niş) bu action ile değiştirilemez", async () => {
    const before = await workspace();
    expect(await updateComplianceRegion({ complianceRegion: "US", apifyMonthlyCapUsd: 1, llmMonthlyCapUsd: 999, nicheBrief: "ele geçirildi" })).toEqual({ ok: true });
    const after = await workspace();
    expect(after.complianceRegion).toBe("US");
    expect(after.apifyMonthlyCapUsd).toBe(before.apifyMonthlyCapUsd);
    expect(after.llmMonthlyCapUsd).toBe(before.llmMonthlyCapUsd);
    expect(after.nicheBrief).toBe(before.nicheBrief);
  });

  it("bölge denetimi belirler: 'Reklam' ibareli ücretli iş TR'de onaya gider, ABD'de #ad yoksa engellenir", async () => {
    const { repo, wsId } = await getPanelContext();
    const account = (await repo.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("Testte kullanılacak bağlı hesap yok (mock veri).");
    const job = { socialAccountId: account.id, scheduledAt: "", paidPartnership: true, aiGenerated: false, advertiserName: "Kahve Evi", status: "awaiting_approval" as const };

    await updateComplianceRegion({ complianceRegion: "US" });
    const blocked = await createPublishJob({ ...job, caption: "Reklam · Kahve Evi ile" });
    expect(blocked).toMatchObject({ ok: false, code: "invalid_state" });
    expect(blocked.ok === false && blocked.message).toMatch(/^Uyum denetimi başarısız:.*#ad/);

    await updateComplianceRegion({ complianceRegion: "TR" });
    expect(await createPublishJob({ ...job, caption: "Reklam · Kahve Evi ile" })).toEqual({ ok: true });
  });

  it("depo hatasını Türkçe mesaja çevirir ve sayfaları yenilemez; beklenmeyen hatada ayrıntı sızdırmaz", async () => {
    const { repo } = await getPanelContext();
    const spy = vi.spyOn(repo, "updateWorkspace");

    spy.mockRejectedValueOnce(new RepositoryError("not_found", "ws yok"));
    expect(await updateComplianceRegion({ complianceRegion: "US" })).toMatchObject({ ok: false, code: "not_found" });

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    spy.mockRejectedValueOnce(new Error("db parolası: hunter2"));
    const result = await updateComplianceRegion({ complianceRegion: "US" });
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("hunter2");

    errorLog.mockRestore();
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
