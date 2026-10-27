/**
 * Başlangıç akışı action'ları (yeni): elle rakip adayı (Apify parası AYIRMAZ: `addCompetitor` değil `addOnboardingRival`), yanlış açılan
 * hesabı kaldırma ("bu ben değilim") ve "başka hesap dene"de ölü çalışma alanının kaldırılması. Depo, kapı, kayıt ve çerez sahtedir.
 * Kaldırma KURALI deponun / DB'nin işidir (sözleşme + `onboarding-discard.db.test.ts`); burada action'ın kendi korumaları sınanır.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  getPanelContext: vi.fn(),
  getRepository: vi.fn(),
  createWorkspace: vi.fn(),
  isDefaultWorkspace: vi.fn(),
  writeWorkspaceCookie: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
  launchWorker: vi.fn(),
  repo: {
    getOnboardingState: vi.fn(),
    addOnboardingRival: vi.fn(),
    addCompetitor: vi.fn(),
    discardOnboardingWorkspace: vi.fn(),
    startOnboardingProbe: vi.fn(),
  },
}));

vi.mock("@/lib/onboarding/gate", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/onboarding/gate")>()), onboardingGate: mocks.gate }));
vi.mock("@/lib/data", () => ({ getPanelContext: mocks.getPanelContext, getRepository: mocks.getRepository }));
vi.mock("@/lib/workspace/registry", () => ({ createWorkspace: mocks.createWorkspace, isDefaultWorkspace: mocks.isDefaultWorkspace }));
vi.mock("@/lib/workspace/cookie", () => ({ writeWorkspaceCookie: mocks.writeWorkspaceCookie }));
vi.mock("@/lib/job-control/launch", () => ({ launchWorker: mocks.launchWorker }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { addOnboardingAccountAction, addOnboardingRivalAction, discardOnboardingAccountAction } from "@/app/actions/onboarding";
import { RepositoryError } from "@/lib/data/repository";

const WS = "11111111-1111-4111-8111-111111111111";
const NEW_WS = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-13T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockReturnValue({ open: true, mock: false });
  mocks.getPanelContext.mockResolvedValue({ repo: mocks.repo, wsId: WS, now: NOW });
  mocks.getRepository.mockReturnValue(mocks.repo);
  mocks.isDefaultWorkspace.mockReturnValue(false);
  mocks.createWorkspace.mockResolvedValue({ id: NEW_WS, name: "@yeni", accounts: [] });
  mocks.repo.getOnboardingState.mockResolvedValue({ step: "choose_rivals", next: "start_build", account: { platform: "instagram", handle: "kendi" } });
  mocks.repo.addOnboardingRival.mockResolvedValue({ id: "cp_1", handle: "bildigim.hesap" });
  mocks.repo.discardOnboardingWorkspace.mockResolvedValue(undefined);
  mocks.repo.startOnboardingProbe.mockResolvedValue({ id: "job_1" });
});

describe("addOnboardingRivalAction", () => {
  it("hesabı yalnız aday olarak yazar: addOnboardingRival çağrılır, addCompetitor (Apify rezervi) ASLA", async () => {
    const result = await addOnboardingRivalAction({ handle: " @Bildigim.Hesap " });
    expect(result).toEqual({ ok: true, rivalId: "cp_1", handle: "bildigim.hesap" });
    expect(mocks.repo.addOnboardingRival).toHaveBeenCalledExactlyOnceWith(WS, { handle: "bildigim.hesap" });
    expect(mocks.repo.addCompetitor).not.toHaveBeenCalled();
  });

  it("platform ve durum gövdeden alınmaz (katı girdi); geçersiz kullanıcı adı reddedilir", async () => {
    expect(await addOnboardingRivalAction({ handle: "x", platform: "tiktok" })).toMatchObject({ ok: false });
    expect(await addOnboardingRivalAction({ handle: "x", status: "tracked" })).toMatchObject({ ok: false });
    expect(await addOnboardingRivalAction({ handle: "   " })).toMatchObject({ ok: false });
    expect(await addOnboardingRivalAction(null)).toMatchObject({ ok: false });
    expect(mocks.repo.addOnboardingRival).not.toHaveBeenCalled();
  });

  it("ad, akıştaki hesabın platform kuralıyla ayrıştırılır (sunucuda da): TikTok'ta 24 karakteri aşan ad reddedilir", async () => {
    mocks.repo.getOnboardingState.mockResolvedValueOnce({ step: "choose_rivals", next: "start_build", account: { platform: "tiktok", handle: "kendi" } });
    expect(await addOnboardingRivalAction({ handle: "a".repeat(25) })).toMatchObject({ ok: false });
    expect(mocks.repo.addOnboardingRival).not.toHaveBeenCalled();
  });

  it("kapı kapalıyken depoya dokunulmaz", async () => {
    mocks.gate.mockReturnValue({ open: false, reason: "operator_off" });
    expect(await addOnboardingRivalAction({ handle: "x.y" })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.getPanelContext).not.toHaveBeenCalled();
  });

  it("akış seçim ekranında değilse / hesap zaten varsa Türkçe mesajla reddedilir", async () => {
    mocks.repo.addOnboardingRival.mockRejectedValueOnce(new RepositoryError("invalid_state", "x"));
    expect(await addOnboardingRivalAction({ handle: "x.y" })).toMatchObject({ ok: false, message: "Şu an listeye yeni hesap ekleyemiyorum." });
    mocks.repo.addOnboardingRival.mockRejectedValueOnce(new RepositoryError("already_exists", "x"));
    expect(await addOnboardingRivalAction({ handle: "x.y" })).toMatchObject({ ok: false, message: "@x.y zaten listede." });
  });
});

describe("discardOnboardingAccountAction (bu ben değilim)", () => {
  it("güvenli durumda çalışma alanı kaldırılır ve düzen yenilenir", async () => {
    expect(await discardOnboardingAccountAction()).toEqual({ ok: true, discarded: true });
    expect(mocks.repo.discardOnboardingWorkspace).toHaveBeenCalledExactlyOnceWith(WS);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("varsayılan çalışma alanı HİÇBİR koşulda kaldırılmaz: depoya bile sorulmaz", async () => {
    mocks.isDefaultWorkspace.mockReturnValue(true);
    expect(await discardOnboardingAccountAction()).toEqual({ ok: true, discarded: false });
    expect(mocks.repo.discardOnboardingWorkspace).not.toHaveBeenCalled();
  });

  it("depo 'kaldırılamaz' derse (onaylanmış, iş koşmuş, gerçek veri) hata değil discarded:false; hiçbir şey silinmedi", async () => {
    mocks.repo.discardOnboardingWorkspace.mockRejectedValueOnce(new RepositoryError("invalid_state", "Bu hesap artık kaldırılamaz"));
    expect(await discardOnboardingAccountAction()).toEqual({ ok: true, discarded: false });
  });

  it("örnek veride kural denetlenir ama çalışma alanı kalkmaz (discarded:false)", async () => {
    mocks.gate.mockReturnValue({ open: true, mock: true });
    expect(await discardOnboardingAccountAction()).toEqual({ ok: true, discarded: false });
    expect(mocks.repo.discardOnboardingWorkspace).toHaveBeenCalledExactlyOnceWith(WS);
  });

  it("beklenmeyen hata ekrana düşer (sessizce yutulmaz)", async () => {
    mocks.repo.discardOnboardingWorkspace.mockRejectedValueOnce(new Error("db kapalı"));
    expect(await discardOnboardingAccountAction()).toMatchObject({ ok: false });
  });

  it("kapı kapalıyken depoya dokunulmaz", async () => {
    mocks.gate.mockReturnValue({ open: false, reason: "hosted" });
    expect(await discardOnboardingAccountAction()).toMatchObject({ ok: false, code: "invalid_state" });
    expect(mocks.repo.discardOnboardingWorkspace).not.toHaveBeenCalled();
  });
});

describe("addOnboardingAccountAction: 'başka hesap dene'", () => {
  const input = { handle: "yeni.hesap", platform: "instagram" };

  it("önceki çalışma alanı akışta ölüyse (bulunamadı / gizli / hak bitti) yeni hesap açıldıktan SONRA kaldırılır", async () => {
    mocks.repo.getOnboardingState.mockResolvedValue({ step: "blocked", next: "add_account", reason: "account_not_found" });
    const order: string[] = [];
    mocks.createWorkspace.mockImplementation(async () => (order.push("create"), { id: NEW_WS, name: "@yeni", accounts: [] }));
    mocks.repo.discardOnboardingWorkspace.mockImplementation(async () => void order.push("discard"));
    expect(await addOnboardingAccountAction(input)).toMatchObject({ ok: true, workspaceId: NEW_WS });
    expect(order).toEqual(["create", "discard"]);
    expect(mocks.repo.discardOnboardingWorkspace).toHaveBeenCalledExactlyOnceWith(WS);
  });

  it("eski çalışma alanı kaldırılamasa da yeni hesap açılır (kaldırma sessizce atlanır)", async () => {
    mocks.repo.getOnboardingState.mockResolvedValue({ step: "blocked", next: "add_account" });
    mocks.repo.discardOnboardingWorkspace.mockRejectedValueOnce(new RepositoryError("invalid_state", "x"));
    expect(await addOnboardingAccountAction(input)).toMatchObject({ ok: true, workspaceId: NEW_WS });
  });

  it("platform kuralı sunucuda da uygulanır: 40 karakterlik Instagram adıyla hesap açılmaz", async () => {
    expect(await addOnboardingAccountAction({ handle: "a".repeat(40), platform: "instagram" })).toMatchObject({ ok: false });
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
  });

  it("yeni hesap açılamazsa eski çalışma alanına DOKUNULMAZ", async () => {
    mocks.repo.getOnboardingState.mockResolvedValue({ step: "blocked", next: "add_account" });
    mocks.createWorkspace.mockRejectedValueOnce(new RepositoryError("already_exists", "x"));
    expect(await addOnboardingAccountAction(input)).toMatchObject({ ok: false });
    expect(mocks.repo.discardOnboardingWorkspace).not.toHaveBeenCalled();
  });

  it("ölü olmayan (kurulu, seçim bekleyen) ya da varsayılan çalışma alanı kaldırılmaz", async () => {
    await addOnboardingAccountAction(input); // choose_rivals
    mocks.repo.getOnboardingState.mockResolvedValue({ step: "done", reason: "legacy" });
    await addOnboardingAccountAction(input);
    mocks.repo.getOnboardingState.mockResolvedValue({ step: "blocked", next: "add_account" });
    mocks.isDefaultWorkspace.mockReturnValue(true);
    await addOnboardingAccountAction(input);
    expect(mocks.repo.discardOnboardingWorkspace).not.toHaveBeenCalled();
  });
});
