import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { approvePublishJob, cancelPublishJob, createPublishJob, submitPublishJob } from "@/app/actions/publish";
import { formatInTimeZone } from "date-fns-tz";

import { getPanelContext } from "@/lib/data";
import type { PublishStatus } from "@/lib/domain/publish";
import { DAY_MS } from "@/lib/time";

/** Mock veri zenginleşse de bozulmasın: kimlik değil durum/bağlantıya göre kayıt seçilir. */
async function context() {
  const { repo, wsId } = await getPanelContext();
  const [jobs, accounts, workspace] = await Promise.all([
    repo.listPublishJobs(wsId),
    repo.listOwnAccounts(wsId),
    repo.getWorkspace(wsId),
  ]);
  return { jobs, accounts, workspace };
}

async function jobWith(status: PublishStatus) {
  const job = (await context()).jobs.find((j) => j.status === status);
  if (!job) throw new Error(`Testte kullanılacak ${status} durumunda iş yok (mock veri).`);
  return job;
}

async function statusOf(id: string) {
  return (await context()).jobs.find((j) => j.id === id)?.status;
}

async function connectedAccount() {
  const account = (await context()).accounts.find((a) => a.connection === "connected");
  if (!account) throw new Error("Testte kullanılacak bağlı hesap yok (mock veri).");
  return account;
}

const base = {
  caption: "Test yayını #kahve",
  scheduledAt: "",
  paidPartnership: false,
  aiGenerated: false,
  status: "draft" as const,
};

describe("yayın server action'ları (mock depo)", () => {
  beforeEach(() => revalidatePath.mockClear());

  it("approvePublishJob: yalnız awaiting_approval onaylanır; taslak invalid_state → Türkçe mesaj", async () => {
    const draft = await jobWith("draft");
    const denied = await approvePublishJob(draft.id);
    expect(denied).toMatchObject({ ok: false });
    expect(denied.ok === false && denied.message).toMatch(/durumunda yapılamıyor/);
    expect(await statusOf(draft.id)).toBe("draft");
    expect(revalidatePath).not.toHaveBeenCalled();

    // Seed'deki onay bekleyen iş uyum denetiminden geçmez (YZ işaretli, beyan yok): insan onayı bunu atlayamaz.
    const failing = await jobWith("awaiting_approval");
    const blocked = await approvePublishJob(failing.id);
    expect(blocked).toMatchObject({ ok: false, code: "invalid_state" });
    expect(blocked.ok === false && blocked.message).toMatch(/^Uyum denetimi başarısız:/);
    expect(await statusOf(failing.id)).toBe("awaiting_approval");
    expect(revalidatePath).not.toHaveBeenCalled();

    // Uyumlu iş onaylanır.
    const account = await connectedAccount();
    expect(await createPublishJob({ ...base, socialAccountId: account.id, caption: "Onay testi #kahve", status: "awaiting_approval" })).toEqual({ ok: true });
    const compliant = (await context()).jobs.find((j) => j.caption === "Onay testi #kahve");
    if (!compliant) throw new Error("Testte oluşturulan iş bulunamadı.");
    expect(await approvePublishJob(compliant.id)).toEqual({ ok: true });
    expect(await statusOf(compliant.id)).toBe("approved");
    expect(revalidatePath).toHaveBeenCalledWith("/yayin");
  });

  it("uyum denetimi: ücretli iş birliğinde ibare yoksa onaya gönderme ve doğrudan onay bekliyor açma engellenir (Türkçe mesaj)", async () => {
    const account = await connectedAccount();
    const paid = { ...base, socialAccountId: account.id, paidPartnership: true };
    const direct = await createPublishJob({ ...paid, caption: "Harika ürün #kahve", status: "awaiting_approval" });
    expect(direct).toMatchObject({ ok: false, code: "invalid_state" });
    expect(direct.ok === false && direct.message).toMatch(/“Reklam” ya da “Tanıtım” ibaresi/);
    expect((await context()).jobs.some((j) => j.caption === "Harika ürün #kahve")).toBe(false);

    // Taslak açılabilir; onaya gönderilemez ve taslak kalır.
    expect(await createPublishJob({ ...paid, caption: "Harika ürün #kahve" })).toEqual({ ok: true });
    const draft = (await context()).jobs.find((j) => j.caption === "Harika ürün #kahve");
    if (!draft) throw new Error("Testte oluşturulan taslak bulunamadı.");
    const blocked = await submitPublishJob(draft.id);
    expect(blocked).toMatchObject({ ok: false, code: "invalid_state" });
    expect(blocked.ok === false && blocked.message).toMatch(/^Uyum denetimi başarısız:/);
    expect(await statusOf(draft.id)).toBe("draft");

    // İbare ilk satırda: geçer (reklam veren yok → yalnız uyarı, engel değil).
    expect(await createPublishJob({ ...paid, caption: "Reklam · harika ürün #kahve", status: "awaiting_approval" })).toEqual({ ok: true });
  });

  it("createPublishJob: reklam veren ve Trial Reels kaydedilir; reklam veren ücretli iş birliği olmadan, kapalı Trial hiç yazılmaz", async () => {
    const account = await connectedAccount();
    const paid = { ...base, socialAccountId: account.id, paidPartnership: true, caption: "Reklam · Kahve Evi ile #kahve" };
    expect(await createPublishJob({ ...paid, advertiserName: "  Kahve Evi ", trial: { enabled: true, graduation: "performance" } })).toEqual({ ok: true });
    expect(await createPublishJob({ ...base, socialAccountId: account.id, caption: "Reklamsız #kahve", advertiserName: "Kahve Evi", trial: { enabled: false, graduation: "manual" } })).toEqual({ ok: true });

    const jobs = (await context()).jobs;
    const withTrial = jobs.find((j) => j.caption === paid.caption);
    expect(withTrial).toMatchObject({ paidPartnership: true, advertiserName: "Kahve Evi", trial: { enabled: true, graduation: "performance" } });
    const plain = jobs.find((j) => j.caption === "Reklamsız #kahve");
    expect(plain?.advertiserName).toBeUndefined();
    expect(plain?.trial).toBeUndefined();

    // Bozuk Trial/reklam veren depoya gitmeden reddedilir.
    const invalid = { ...base, socialAccountId: account.id, caption: "Bozuk trial #kahve" };
    expect(await createPublishJob({ ...invalid, trial: { enabled: true, graduation: "auto" } })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await createPublishJob({ ...invalid, advertiserName: "a".repeat(101) })).toMatchObject({ ok: false, code: "invalid_input" });
    expect((await context()).jobs.some((j) => j.caption === "Bozuk trial #kahve")).toBe(false);
  });

  it("createPublishJob: reklam veren adı tek başına ibare yerine geçmez; ibare + ad uyumlu", async () => {
    const account = await connectedAccount();
    const paid = { ...base, socialAccountId: account.id, paidPartnership: true, advertiserName: "Kahve Evi", status: "awaiting_approval" as const };
    expect(await createPublishJob({ ...paid, caption: "Kahve Evi ile harika tarif #kahve" })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await createPublishJob({ ...paid, caption: "Reklam · Kahve Evi ile harika tarif #kahve" })).toEqual({ ok: true });
  });

  it("approvePublishJob: bilinmeyen ve boş kimlik hata döner (fırlatmaz)", async () => {
    expect(await approvePublishJob("yok_123")).toMatchObject({ ok: false });
    expect(await approvePublishJob("  ")).toMatchObject({ ok: false });
  });

  it("cancelPublishJob: yayınlanmış iş iptal edilemez; taslak iptal edilir", async () => {
    const published = await jobWith("published");
    expect(await cancelPublishJob(published.id)).toMatchObject({ ok: false });
    expect(await statusOf(published.id)).toBe("published");

    const draft = await jobWith("draft");
    expect(await cancelPublishJob(draft.id)).toEqual({ ok: true });
    expect(await statusOf(draft.id)).toBe("cancelled");
  });

  it("createPublishJob: geçerli girdi iş oluşturur; form saati workspace saat diliminden UTC'ye çevrilir", async () => {
    const account = await connectedAccount();
    const { workspace } = await context();
    // Bu test İstanbul (UTC+3, DST yok) varsayar; başka tz'li mock gelirse burası bilinçli olarak kırılır.
    expect(workspace?.timezone).toBe("Europe/Istanbul");

    // Saat, aksiyonun kullandığı tek saatten (`getPanelContext().now`) türetilir; test kendi saatini okumaz.
    const { now } = await getPanelContext();
    const day = new Date(now.getTime() + 3 * DAY_MS).toISOString().slice(0, 10);
    const result = await createPublishJob({
      ...base,
      socialAccountId: account.id,
      scheduledAt: `${day}T14:30`,
      status: "awaiting_approval",
    });
    expect(result).toEqual({ ok: true });

    const created = (await context()).jobs.find((j) => j.caption === base.caption);
    expect(created?.status).toBe("awaiting_approval");
    expect(created?.scheduledFor).toBe(`${day}T11:30:00.000Z`);
    expect(revalidatePath).toHaveBeenCalledWith("/yayin");
  });

  it("createPublishJob: bağlı olmayan hesap, geçmiş zaman, bozuk girdi ve başka durum reddedilir", async () => {
    const account = await connectedAccount();
    const notConnected = (await context()).accounts.find((a) => a.connection !== "connected");
    if (notConnected) {
      const result = await createPublishJob({ ...base, socialAccountId: notConnected.id });
      expect(result).toEqual({
        ok: false,
        code: "invalid_state",
        message: "Bu hesap resmi API ile bağlı değil; yayın işi oluşturulamaz.",
      });
    }

    const valid = { ...base, socialAccountId: account.id };
    expect(await createPublishJob({ ...valid, socialAccountId: "yok" })).toMatchObject({ ok: false });
    // Geçmiş = aksiyonun bağlamındaki `now`a göre (mock: sabit MOCK_NOW): 2 saat öncesi reddedilir.
    const { now } = await getPanelContext();
    const twoHoursAgo = formatInTimeZone(new Date(now.getTime() - 2 * 3_600_000), "Europe/Istanbul", "yyyy-MM-dd'T'HH:mm");
    expect(await createPublishJob({ ...valid, scheduledAt: twoHoursAgo })).toMatchObject({ ok: false, message: "Planlanan zaman geçmişte olamaz." });
    expect(await createPublishJob({ ...valid, scheduledAt: "2020-01-01T10:00" })).toEqual({
      ok: false,
      code: "invalid_input",
      message: "Planlanan zaman geçmişte olamaz.",
    });
    expect(await createPublishJob({ ...valid, status: "approved" })).toMatchObject({ ok: false });
    expect(await createPublishJob({ ...valid, caption: "a".repeat(2201) })).toMatchObject({ ok: false });
    expect(await createPublishJob(null)).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("submitPublishJob: taslak onaya gönderilir (onaylanmış olmaz); onaya gönderilmiş/başka durum ve boş açıklama reddedilir", async () => {
    const account = await connectedAccount();
    expect(await createPublishJob({ ...base, socialAccountId: account.id, caption: "Onaya gidecek taslak" })).toEqual({ ok: true });
    expect(await createPublishJob({ ...base, socialAccountId: account.id, caption: "" })).toEqual({ ok: true });
    const jobs = (await context()).jobs;
    const draft = jobs.find((j) => j.caption === "Onaya gidecek taslak");
    const blank = jobs.find((j) => j.status === "draft" && !j.caption);
    if (!draft || !blank) throw new Error("Testte oluşturulan taslaklar bulunamadı.");

    revalidatePath.mockClear();
    expect(await submitPublishJob(draft.id)).toEqual({ ok: true });
    const submitted = (await context()).jobs.find((j) => j.id === draft.id);
    expect(submitted).toMatchObject({ status: "awaiting_approval" });
    expect(submitted?.approvedAt).toBeUndefined();
    expect(submitted?.approvedBy).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/yayin");

    // İkinci kez: artık taslak değil.
    const again = await submitPublishJob(draft.id);
    expect(again).toMatchObject({ ok: false, code: "invalid_state" });
    expect(again.ok === false && again.message).toMatch(/Yalnız taslak/);
    // Açıklaması boş taslak: depo reddeder, durum değişmez.
    revalidatePath.mockClear();
    const empty = await submitPublishJob(blank.id);
    expect(empty).toEqual({ ok: false, code: "invalid_input", message: "Onaya göndermek için açıklama yaz." });
    expect(await statusOf(blank.id)).toBe("draft");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await submitPublishJob("  ")).toMatchObject({ ok: false });
    expect(await submitPublishJob("yok_123")).toMatchObject({ ok: false, code: "not_found" });
  });

  it("approvePublishJob: onaylayan kaydedilir (approvedBy)", async () => {
    const awaiting = await jobWith("awaiting_approval");
    expect(await approvePublishJob(awaiting.id)).toEqual({ ok: true });
    const approved = (await context()).jobs.find((j) => j.id === awaiting.id);
    expect(approved?.approvedBy).toBe("mock-user");
    expect(approved?.approvedAt).toBeDefined();
  });
});
