import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { replacePublishJob } from "@/app/actions/publish-replace";
import { getPanelContext } from "@/lib/data";
import type { PublishStatus } from "@/lib/domain/publish";

async function snapshot() {
  const { repo, wsId } = await getPanelContext();
  const [jobs, accounts] = await Promise.all([repo.listPublishJobs(wsId), repo.listOwnAccounts(wsId)]);
  return { jobs, accounts };
}

async function jobWith(status: PublishStatus) {
  const job = (await snapshot()).jobs.find((j) => j.status === status);
  if (!job) throw new Error(`Testte kullanılacak ${status} durumunda iş yok (mock veri).`);
  return job;
}

async function connectedAccount() {
  const account = (await snapshot()).accounts.find((a) => a.connection === "connected");
  if (!account) throw new Error("Testte kullanılacak bağlı hesap yok (mock veri).");
  return account;
}

const base = { scheduledAt: "", paidPartnership: false, aiGenerated: false, status: "draft" as const };

describe("replacePublishJob (Kopyala ve düzelt / Yeniden dene)", () => {
  beforeEach(() => revalidatePath.mockClear());

  it("başarısız iş: önce yeni iş oluşur, sonra eskisi iptal edilir (tek action)", async () => {
    const old = await jobWith("failed");
    const account = await connectedAccount();
    const before = (await snapshot()).jobs.length;

    const result = await replacePublishJob({ replacesJobId: old.id, job: { ...base, socialAccountId: account.id, caption: "Yeniden deneme #kahve" } });
    expect(result).toEqual({ ok: true, oldCancelled: true });

    const { jobs } = await snapshot();
    expect(jobs).toHaveLength(before + 1);
    expect(jobs.find((j) => j.id === old.id)?.status).toBe("cancelled");
    const created = jobs.find((j) => j.caption === "Yeniden deneme #kahve");
    expect(created).toMatchObject({ status: "draft", socialAccountId: account.id });
    expect(created?.ideaId).toBe(old.ideaId); // kaynak fikir korunur
    expect(revalidatePath).toHaveBeenCalledWith("/yayin");
  });

  it("onay bekleyen iş de aynı yoldan değişir; yeni iş onay bekliyor açılabilir", async () => {
    const old = await jobWith("awaiting_approval");
    const account = await connectedAccount();
    const result = await replacePublishJob({
      replacesJobId: old.id,
      job: { ...base, socialAccountId: account.id, caption: "Düzeltilmiş açıklama #kahve", status: "awaiting_approval" },
    });
    expect(result).toEqual({ ok: true, oldCancelled: true });
    const { jobs } = await snapshot();
    expect(jobs.find((j) => j.id === old.id)?.status).toBe("cancelled");
    expect(jobs.find((j) => j.caption === "Düzeltilmiş açıklama #kahve")?.status).toBe("awaiting_approval");
  });

  it("yeni iş oluşmazsa eskisine dokunulmaz (uyum engeli, geçersiz hesap, geçmiş zaman, boş açıklama)", async () => {
    const old = await jobWith("expired");
    const account = await connectedAccount();
    const before = (await snapshot()).jobs.length;
    const attempt = (job: object) => replacePublishJob({ replacesJobId: old.id, job: { ...base, socialAccountId: account.id, caption: "x #kahve", ...job } });

    // Ücretli iş birliği, ibare yok, doğrudan onay bekliyor: uyum engeli.
    const compliance = await attempt({ paidPartnership: true, status: "awaiting_approval" });
    expect(compliance).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await attempt({ socialAccountId: "yok_hesap" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await attempt({ scheduledAt: "2020-01-01T10:00" })).toMatchObject({ ok: false, message: "Planlanan zaman geçmişte olamaz." });
    expect(await attempt({ caption: "  ", status: "awaiting_approval" })).toMatchObject({ ok: false, message: "Onaya göndermek için açıklama yaz." });

    const { jobs } = await snapshot();
    expect(jobs).toHaveLength(before);
    expect(jobs.find((j) => j.id === old.id)?.status).toBe("expired");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("düzeltilemeyen durumdaki ya da olmayan iş reddedilir; hiçbir şey oluşmaz", async () => {
    const published = await jobWith("published");
    const account = await connectedAccount();
    const before = (await snapshot()).jobs.length;
    const job = { ...base, socialAccountId: account.id, caption: "Reddedilmeli #kahve" };

    expect(await replacePublishJob({ replacesJobId: published.id, job })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await replacePublishJob({ replacesJobId: "yok_is", job })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await replacePublishJob({ replacesJobId: "", job })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await replacePublishJob({ job })).toMatchObject({ ok: false, code: "invalid_input" });
    expect((await snapshot()).jobs).toHaveLength(before);
  });

  it("stüdyo siparişine bağlı taslak düzeltilip yeniden gönderilince orderId / mediaPath sunucuda korunur (Ö8a)", async () => {
    const { repo, wsId } = await getPanelContext();
    const account = await connectedAccount();
    const mediaPath = "siparis:ornek-studyo/2026-10-19/s9/final.mp4";
    const draft = await repo.createPublishJob(wsId, { socialAccountId: account.id, caption: "Taslak #kahve", status: "draft", orderId: "s9-test", mediaPath, aiGenerated: false });
    const result = await replacePublishJob({ replacesJobId: draft.id, job: { ...base, socialAccountId: account.id, caption: "Düzeltilmiş #kahve", aiGenerated: true } });
    expect(result).toMatchObject({ ok: true });
    const { jobs } = await snapshot();
    expect(jobs.find((j) => j.id === draft.id)?.status).toBe("cancelled");
    const fixed = jobs.find((j) => j.caption === "Düzeltilmiş #kahve");
    expect(fixed).toMatchObject({ orderId: "s9-test", mediaPath, status: "draft" });
    // İstemci girdisinden sipariş bağı alınmaz: şemada olmayan alan yok sayılır / eski satırdan gelir.
    const forged = await replacePublishJob({ replacesJobId: fixed?.id, job: { ...base, socialAccountId: account.id, caption: "Üçüncü #kahve", orderId: "baska", mediaPath: "siparis:../x" } });
    expect(forged).toMatchObject({ ok: true });
    const third = (await snapshot()).jobs.find((j) => j.caption === "Üçüncü #kahve");
    expect(third).toMatchObject({ orderId: "s9-test", mediaPath });
  });
});
