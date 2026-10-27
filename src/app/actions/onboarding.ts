"use server";

/**
 * Başlangıç akışı action'ları (plan `docs/BASLANGIC-AKISI-PLAN.md` §2). Action doğrudan POST edilebilir, bu yüzden HER çağrıda:
 *  - kapı: `onboardingGate()` (tek yer; üyelik gelince yalnız o değişir); kapalıysa `invalid_state`, depoya / işçiye dokunulmaz;
 *  - girdi zod ile, KATI (`onboarding-input.ts`: depo ile AYNI şema); harcama tavanı, onay, çalışma alanı ve kuyruk girdiden GELMEZ;
 *  - çalışma alanı gövdeden okunmaz: `getPanelContext()` çözer (hesap eklemede yeni açılan çalışma alanı);
 *  - "Devam et" ve "Başlat" harcama onayıdır: sabit tavanı sunucu yazar (`ONBOARDING_PHASE_SPEC`), işi ayrık işçi koşturur.
 * Akıştaki yanlış açılan hesap geride kalmaz: "bu ben değilim" ve "başka hesap dene" onaylanmamış, iş koşmamış çalışma alanını kaldırır
 * (kural DB'de, `discardOnboardingWorkspace`; gerçek veri taşıyan ve varsayılan çalışma alanı ASLA).
 * İşçi başlatılamazsa iş sırada kalır (satır geri alınmaz); durum ucu "işçi gerekli" der ve `kickWorkerAction` yeniden dener.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { HANDLE_ERROR_MESSAGE, parseHandle } from "@/components/competitors/handle";
import { actionFail, actionOk, toActionError, validationFail, type ActionFailure, type ActionResult } from "@/lib/actions/result";
import { getPanelContext, getRepository } from "@/lib/data";
import { confirmOnboardingAccountSchema, startOnboardingBuildSchema } from "@/lib/data/onboarding-input";
import { ONBOARDING_ERROR } from "@/lib/data/views/onboarding";
import { PLATFORMS } from "@/lib/domain/platform";
import { ONBOARDING_RIVALS_PLAIN } from "@/lib/plain-language-onboarding";
import { launchWorker } from "@/lib/job-control/launch";
import { REQUEST_JOB_MESSAGES } from "@/lib/job-control/messages";
import { ONBOARDING_GATE_MESSAGE, onboardingGate, type OnboardingGate } from "@/lib/onboarding/gate";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { ROUTES } from "@/lib/routes";
import { writeWorkspaceCookie } from "@/lib/workspace/cookie";
import { createWorkspace, isDefaultWorkspace } from "@/lib/workspace/registry";

type OpenGate = Extract<OnboardingGate, { open: true }>;

/** Kapı açıksa kapıyı, kapalıysa reddi döndürür. */
function gate(): OpenGate | ActionFailure {
  const result = onboardingGate();
  return result.open ? result : actionFail(ONBOARDING_GATE_MESSAGE[result.reason], "invalid_state");
}

/** Gerçek veride işçiyi dürter (örnek veride işçi yoktur). Başlatılamazsa iş sırada kalır. */
function startWorker(open: OpenGate, now: Date): void {
  if (open.mock) return;
  try {
    launchWorker({ now });
  } catch (error) {
    console.error("[baslangic] işçi başlatılamadı", error);
  }
}

/** Akışın durumu panel düzeninde de okunur (Bugün kartı, durum şeridi, hesap seçici): tüm düzen yenilenir. */
function refreshPanel(): void {
  revalidatePath(ROUTES.overview, "layout");
}

/** Geçerli çalışma alanı, akışın "başka hesap ekle"den başka çıkışı olmayan ölü bir adımındaysa kimliği (varsayılan çalışma alanı asla). */
async function deadWorkspaceId(): Promise<string | undefined> {
  try {
    const { repo, wsId } = await getPanelContext();
    if (isDefaultWorkspace(wsId)) return undefined;
    const state = await repo.getOnboardingState(wsId);
    return state.step === "blocked" && state.next === "add_account" ? wsId : undefined;
  } catch {
    return undefined;
  }
}

/** Eski çalışma alanını kaldırmayı dener; kaldırılamazsa (gerçek veri, onay, etkin iş) olduğu gibi kalır. Yeni hesabın açılışını asla bozmaz. */
async function discardQuietly(workspaceId: string): Promise<void> {
  try {
    await getRepository().discardOnboardingWorkspace(workspaceId);
  } catch (error) {
    console.info("[baslangic] eski çalışma alanı kaldırılmadı", toActionError(error).message);
  }
}

const addAccountSchema = z.strictObject(
  {
    handle: z.string({ error: HANDLE_ERROR_MESSAGE.empty }).trim().min(1, HANDLE_ERROR_MESSAGE.empty).max(300, HANDLE_ERROR_MESSAGE.invalid),
    platform: z.enum(PLATFORMS, { error: "Geçersiz platform." }),
  },
  { error: (issue) => (issue.code === "unrecognized_keys" ? "Geçersiz bir alan gönderildi." : undefined) },
);

export type AddOnboardingAccountResult = ActionResult<{
  /** Hesabın çalışma alanı (yeni açılan; örnek veride mevcut olan). */
  workspaceId: string;
  /** Hesaba bakış sıraya yazıldı mı. false = hesap eklendi ama bakış başlatılamadı (ekran "Hesabıma bak" ile yeniden dener). */
  probeStarted: boolean;
}>;

/**
 * Hesap ekle: kullanıcı adı (ya da profil bağlantısı) + platform → çalışma alanı açılır, ona geçilir ve hesaba bakış sıraya yazılır.
 * Modülü olmayan platform ("yakında") reddedilir; aynı hesap ikinci kez → `already_exists`. Örnek veride çalışma alanı açılmaz: bakış
 * mevcut örnek hesapta başlar.
 */
export async function addOnboardingAccountAction(input: unknown): Promise<AddOnboardingAccountResult> {
  const open = gate();
  if (!("open" in open)) return open;
  const parsed = addAccountSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  if (!hasPlatformModule(parsed.data.platform)) return actionFail(ONBOARDING_ERROR.noModule, "invalid_state");
  // Kural platformun kendisinden (uzunluk, karakter): form da aynı ayrıştırıcıyı çağırır, ama action doğrudan da çağrılabilir.
  const handle = parseHandle(parsed.data.handle, parsed.data.platform);
  if (!handle.ok) return actionFail(HANDLE_ERROR_MESSAGE[handle.reason]);

  let workspaceId: string;
  // "Başka hesap dene": önceki çalışma alanı akışta ölü bir yerdeyse (bulunamadı, gizli, videosuz, hak bitti) yeni hesap açılınca kaldırılır.
  let abandoned: string | undefined;
  try {
    if (open.mock) {
      workspaceId = (await getPanelContext()).wsId;
    } else {
      abandoned = await deadWorkspaceId();
      const created = await createWorkspace({ name: `@${handle.handle}`, handle: handle.handle, platform: parsed.data.platform });
      workspaceId = created.id;
      await writeWorkspaceCookie(workspaceId);
    }
  } catch (error) {
    return toActionError(error, { already_exists: ONBOARDING_ERROR.accountExists });
  }

  if (abandoned !== undefined) await discardQuietly(abandoned);

  let probeStarted = true;
  try {
    await getRepository().startOnboardingProbe(workspaceId);
    startWorker(open, (await getPanelContext()).now);
  } catch (error) {
    // Hesap eklendi; bakış başlatılamadı (ör. harcama kapalı, etkin iş). Ekran durumu okuyup yeniden denetir.
    console.error("[baslangic] hesaba bakış başlatılamadı", error);
    probeStarted = false;
  }
  refreshPanel();
  return actionOk({ workspaceId, probeStarted });
}

export type OnboardingJobResult = ActionResult<{ jobId: string }>;

/** "Hesabıma bak": geçerli çalışma alanında hesaba bakışı (yeniden) başlatır. */
export async function startOnboardingProbeAction(): Promise<OnboardingJobResult> {
  const open = gate();
  if (!("open" in open)) return open;
  try {
    const { repo, wsId, now } = await getPanelContext();
    const job = await repo.startOnboardingProbe(wsId);
    startWorker(open, now);
    refreshPanel();
    return actionOk({ jobId: job.id });
  } catch (error) {
    return toActionError(error, REQUEST_JOB_MESSAGES);
  }
}

/** "Evet, bu benim": hesap türünü, verildiyse konuyu ve onay anını yazar. Girdi `ConfirmOnboardingAccountInput`. */
export async function confirmOnboardingAccountAction(input: unknown): Promise<ActionResult> {
  const open = gate();
  if (!("open" in open)) return open;
  const parsed = confirmOnboardingAccountSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId } = await getPanelContext();
    await repo.confirmOnboardingAccount(wsId, parsed.data);
    refreshPanel();
    return actionOk({});
  } catch (error) {
    return toActionError(error);
  }
}

/** "Başlat": seçilen rakipleri izlemeye alır ve ilk turu başlatır (harcama onayı; hesap başına bir kez). Girdi `StartOnboardingBuildInput`. */
export async function startOnboardingBuildAction(input: unknown): Promise<OnboardingJobResult> {
  const open = gate();
  if (!("open" in open)) return open;
  const parsed = startOnboardingBuildSchema.safeParse(input ?? {});
  if (!parsed.success) return validationFail(parsed.error);
  try {
    const { repo, wsId, now } = await getPanelContext();
    const job = await repo.startOnboardingBuild(wsId, parsed.data);
    startWorker(open, now);
    refreshPanel();
    return actionOk({ jobId: job.id });
  } catch (error) {
    return toActionError(error, { ...REQUEST_JOB_MESSAGES, already_exists: ONBOARDING_ERROR.buildExists });
  }
}

const addRivalSchema = z.strictObject(
  { handle: z.string({ error: HANDLE_ERROR_MESSAGE.empty }).trim().min(1, HANDLE_ERROR_MESSAGE.empty).max(300, HANDLE_ERROR_MESSAGE.invalid) },
  { error: (issue) => (issue.code === "unrecognized_keys" ? "Geçersiz bir alan gönderildi." : undefined) },
);

export type AddOnboardingRivalResult = ActionResult<{ rivalId: string; handle: string }>;

/**
 * Benzer hesap ekranındaki "bildiğin bir hesabı ekle": hesabı YALNIZ aday olarak yazar ve Apify parası AYIRMAZ (`addOnboardingRival`;
 * profil sayıları ilk turda gelir). İzlemeye alma yalnız "Başlat" ile. Platform gövdeden okunmaz: akıştaki kendi hesabın platformudur.
 */
export async function addOnboardingRivalAction(input: unknown): Promise<AddOnboardingRivalResult> {
  const open = gate();
  if (!("open" in open)) return open;
  const parsed = addRivalSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  let shownHandle = parsed.data.handle.trim();
  try {
    const { repo, wsId } = await getPanelContext();
    // Rakip, akıştaki kendi hesapla aynı platformdandır: ad o platformun kuralıyla ayrıştırılır (platform gövdeden okunmaz).
    const platform = (await repo.getOnboardingState(wsId)).account?.platform;
    const handle = parseHandle(parsed.data.handle, platform);
    if (!handle.ok) return actionFail(HANDLE_ERROR_MESSAGE[handle.reason]);
    shownHandle = handle.handle;
    const rival = await repo.addOnboardingRival(wsId, { handle: handle.handle });
    revalidatePath(ROUTES.onboarding);
    return actionOk({ rivalId: rival.id, handle: rival.handle });
  } catch (error) {
    return toActionError(error, {
      already_exists: ONBOARDING_RIVALS_PLAIN.addExists(shownHandle),
      invalid_state: ONBOARDING_RIVALS_PLAIN.addBlocked,
      invalid_input: HANDLE_ERROR_MESSAGE.invalid,
    });
  }
}

export type DiscardOnboardingAccountResult = ActionResult<{
  /** Çalışma alanı gerçekten kaldırıldı mı. false = kaldırılamayacak durumdaydı (onaylanmış, iş koşmuş, varsayılan) ya da örnek veri: yerinde kaldı. */
  discarded: boolean;
}>;

/**
 * "Bu ben değilim": yanlış açılan çalışma alanını kaldırır, kullanıcı başka hesap ekleme formuna döner. Kaldırılamıyorsa (gerçek veri
 * taşıyor, varsayılan çalışma alanı, onaylanmış) HATA DEĞİL `discarded: false` döner ve hiçbir şey silinmez; ekran yine ekleme formunu açar.
 * Çalışma alanı gövdeden okunmaz; silinen çalışma alanı geçerli olandı: `sp_ws` çerezi artık kayıtta olmayan kimliği varsayılana düşürür.
 */
export async function discardOnboardingAccountAction(): Promise<DiscardOnboardingAccountResult> {
  const open = gate();
  if (!("open" in open)) return open;
  try {
    const { repo, wsId } = await getPanelContext();
    if (isDefaultWorkspace(wsId)) return actionOk({ discarded: false });
    await repo.discardOnboardingWorkspace(wsId);
    refreshPanel();
    return actionOk({ discarded: !open.mock });
  } catch (error) {
    const failure = toActionError(error);
    return failure.code === "invalid_state" ? actionOk({ discarded: false }) : failure;
  }
}
