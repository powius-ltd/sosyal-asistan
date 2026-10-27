/**
 * Başlangıç işi bitiş bildirimi: hangi bitişte hangi bildirim (ve hangisinde hiçbiri) yazılır, aynı iş için bir kez, yazım hatası işi
 * düşürmez. Kanca gerçek `runJob` yolundan çağrılır (SAHTE bağımlılıklar; veritabanı yok).
 */
import { describe, expect, it, vi } from "vitest";

import type { PanelJob } from "@/lib/domain/panel-job";
import { createFinishNotifier, onboardingFinishDraft, type JobFinishedHook } from "@/lib/job-runner/finish-notice";
import type { JobFinal } from "@/lib/job-runner/job-session";
import { collected, discovered, runOnboarding, verified } from "@/lib/job-runner/run-onboarding-test-support";
import { claimedJob, WS_ID } from "@/lib/job-runner/test-support";
import type { AdminClient } from "@/lib/supabase/admin";

const job = (phase: "probe" | "build" | undefined): PanelJob => claimedJob({ kind: "onboarding", params: phase === undefined ? {} : { phase } });
const final = (status: JobFinal["status"], outcome?: NonNullable<JobFinal["result"]>["outcome"]): JobFinal => ({ status, ...(outcome === undefined ? {} : { result: { outcome } }) });

describe("bitiş taslağı", () => {
  const cases: { name: string; phase: "probe" | "build"; final: JobFinal; title: string | undefined }[] = [
    { name: "bakış tamam", phase: "probe", final: final("succeeded"), title: "Hesabına baktım, sıra sende" },
    { name: "bakış az videoyla tamam", phase: "probe", final: final("succeeded", "few_videos"), title: "Hesabına baktım, sıra sende" },
    { name: "bakış gizli hesapta durdu", phase: "probe", final: final("blocked", "account_private"), title: "Hesabına bakamadım" },
    { name: "bakış hata", phase: "probe", final: final("failed", "step_failed"), title: "Hesabına bakamadım" },
    { name: "ilk tur tamam", phase: "build", final: final("succeeded"), title: "İlk planın hazır" },
    { name: "ilk tur kısmi, plan hazır", phase: "build", final: final("partial", "step_failed"), title: "İlk planın hazır" },
    { name: "ilk tur kısmi, plan çıkmadı", phase: "build", final: final("partial", "plan_not_ready"), title: "Videolarına baktım, plan için biraz daha veri lazım" },
    { name: "ilk tur hiçbir şey üretmedi", phase: "build", final: final("failed", "step_failed"), title: "İlk incelemeyi bitiremedim" },
    { name: "ilk tur süre tavanı", phase: "build", final: final("failed", "timeout"), title: "İlk incelemeyi bitiremedim" },
    { name: "ilk tur yazı aracı yok", phase: "build", final: final("blocked", "llm_unavailable"), title: "İlk incelemeyi bitiremedim" },
    { name: "kullanıcı durdurdu", phase: "build", final: final("cancelled"), title: undefined },
  ];
  for (const entry of cases) {
    it(entry.name, () => {
      const draft = onboardingFinishDraft(job(entry.phase), entry.final);
      expect(draft?.title).toBe(entry.title);
      if (draft !== undefined) expect(draft).toMatchObject({ kind: "onboarding", dedupeKey: `onboarding:${job(entry.phase).id}` });
    });
  }

  it("gizli / bulunamayan hesapta bakışın gövdesi nedeni söyler", () => {
    expect(onboardingFinishDraft(job("probe"), final("blocked", "account_private"))?.body).toContain("gizli");
    expect(onboardingFinishDraft(job("probe"), final("blocked", "account_not_found"))?.body).toContain("bulamadım");
  });

  it("başlangıç işi olmayan iş (aşamasız) için bildirim yok", () => {
    expect(onboardingFinishDraft(claimedJob({ kind: "collect" }), final("succeeded"))).toBeUndefined();
    expect(onboardingFinishDraft(job(undefined), final("succeeded"))).toBeUndefined();
  });

  it("metin düz dildir: iç terim, tutar ve sağlayıcı adı geçmez", () => {
    for (const entry of cases) {
      const draft = onboardingFinishDraft(job(entry.phase), entry.final);
      if (draft === undefined) continue;
      expect(`${draft.title} ${draft.body}`).not.toMatch(/probe|build|apify|usd|aday|lift|medyan|hook/i);
    }
  });
});

describe("bildirimci (gerçek istemci sözleşmesi)", () => {
  function client(error?: { code: string; message: string }) {
    const insert = vi.fn(async () => ({ error: error ?? null }));
    const from = vi.fn(() => ({ insert }));
    return { db: { from } as unknown as AdminClient, insert, from };
  }

  it("çalışma alanına tek satır yazar: tür onboarding, anahtar iş kimliği", async () => {
    const { db, insert, from } = client();
    await createFinishNotifier(db)(job("build"), final("succeeded"));
    expect(from).toHaveBeenCalledWith("notifications");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WS_ID, kind: "onboarding", title: "İlk planın hazır", dedupe_key: `onboarding:${job("build").id}` }));
  });

  it("aynı iş ikinci kez yazılırsa (23505) sessizce geçer", async () => {
    const lines: string[] = [];
    const { db } = client({ code: "23505", message: "duplicate" });
    await expect(createFinishNotifier(db, (line) => lines.push(line))(job("build"), final("succeeded"))).resolves.toBeUndefined();
    expect(lines.join(" ")).toContain("zaten");
  });

  it("yazım hatası FIRLATMAZ (iş kapanmıştır), günlüğe uyarı yazar", async () => {
    const lines: string[] = [];
    const { db } = client({ code: "XX000", message: "db kapalı" });
    await expect(createFinishNotifier(db, (line) => lines.push(line))(job("probe"), final("succeeded"))).resolves.toBeUndefined();
    expect(lines.join(" ")).toContain("Uyarı");
  });

  it("bildirim gerekmeyen bitişte hiç yazım yapılmaz", async () => {
    const { db, insert } = client();
    await createFinishNotifier(db)(job("build"), final("cancelled"));
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("işçi yolu: iş kapandıktan sonra çağrılır", () => {
  it("bakış tamamlanınca kanca bir kez, kapanmış işle çağrılır", async () => {
    const onFinished = vi.fn<JobFinishedHook>(async () => undefined);
    const { closing } = await runOnboarding("probe", {}, { onFinished, deps: { verifyAccount: async () => verified(), collect: async () => collected(25), discover: async () => discovered() } });
    expect(closing?.status).toBe("succeeded");
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0][1]).toMatchObject({ status: "succeeded" });
  });

  it("kanca fırlatsa bile iş sonucu değişmez", async () => {
    const onFinished = vi.fn<JobFinishedHook>(async () => {
      throw new Error("bildirim tablosu kapalı");
    });
    const { closing, log, result } = await runOnboarding("probe", {}, { onFinished });
    expect(closing?.status).toBe("succeeded");
    expect(result).toMatchObject({ status: "succeeded", lost: false });
    expect(log.join("\n")).toContain("bitiş kancası hata verdi");
  });

  it("onaysız (blocked) kapanışta da kanca çağrılır ve bildirim 'bakamadım' der", async () => {
    const onFinished = vi.fn<JobFinishedHook>(async () => undefined);
    const { closing } = await runOnboarding("probe", { approval: undefined }, { onFinished });
    expect(closing?.status).toBe("blocked");
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onboardingFinishDraft(job("probe"), onFinished.mock.calls[0][1])?.title).toBe("Hesabına bakamadım");
  });
});
