// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { disableBrowserNotice, enableBrowserNotice } from "@/components/jobs/browser-notice";
import { JobFinishEffects } from "@/components/jobs/job-finish-effects";
import { RUNNING_JOB, viewOf } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";

const ONBOARDING: PanelJob = { ...RUNNING_JOB, id: "job_onb", kind: "onboarding", params: { phase: "build" }, steps: [] };
const view = (overrides: Partial<PanelJob> = {}): JobStatusView => viewOf({ ...ONBOARDING, ...overrides });
const finishedView = (overrides: Partial<PanelJob> = {}) => view({ status: "succeeded", finishedAt: "2026-10-05T12:20:00.000Z", ...overrides });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static created: { title: string; options?: NotificationOptions }[] = [];
  onclick: (() => void) | null = null;
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.created.push({ title, options });
  }
  close() {}
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  FakeNotification.permission = "default";
  FakeNotification.created = [];
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", FakeNotification);
  window.localStorage.clear();
  document.title = "Başlangıç · Demirkazık";
  setVisibility("visible");
  jobStatusStore.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  jobStatusStore.reset();
});

describe("JobFinishEffects: sekme görünürken", () => {
  it("biten ilk tur için baloncuk çıkar (başlık + gövde + eylem) ve bir kez", () => {
    const { rerender } = render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    const [title, options] = mocks.toast.mock.calls[0];
    expect(title).toBe("İlk planın hazır");
    expect(options.description).toContain("planı");
    options.action.onClick();
    expect(mocks.push).toHaveBeenCalledWith("/baslangic");
    rerender(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it("hesaba bakış bitince 'sıra sende' der", () => {
    render(<JobFinishEffects active={undefined} finished={finishedView({ params: { phase: "probe" } })} />);
    expect(mocks.toast.mock.calls[0][0]).toBe("Hesabına baktım, sıra sende");
  });

  it("plan çıkmadıysa dürüst başlık", () => {
    render(<JobFinishEffects active={undefined} finished={finishedView({ status: "partial", result: { outcome: "plan_not_ready" } })} />);
    expect(mocks.toast.mock.calls[0][0]).toBe("Videolarına baktım, plan için biraz daha veri lazım");
  });

  it("kullanıcının durdurduğu, önizleme ve başlangıç dışı işte hiçbir şey çıkmaz", () => {
    for (const finished of [finishedView({ status: "cancelled" }), finishedView({ dryRun: true }), viewOf({ ...ONBOARDING, kind: "routine", params: {}, status: "succeeded" })]) {
      render(<JobFinishEffects active={undefined} finished={finished} />);
    }
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(document.title).toBe("Başlangıç · Demirkazık");
  });

  it("sekme başlığı değişmez", () => {
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(document.title).toBe("Başlangıç · Demirkazık");
  });
});

describe("JobFinishEffects: sekme arka plandayken", () => {
  it("başlığa işaret koyar, baloncuk çıkarmaz; sekme görünür olunca eski başlık döner", () => {
    setVisibility("hidden");
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(document.title).toBe("● İlk planın hazır · Başlangıç · Demirkazık");
    expect(mocks.toast).not.toHaveBeenCalled();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.title).toBe("Başlangıç · Demirkazık");
  });

  it("işaret sayfa yenilemesine dayanır (D1-12): Next başlığı yeniden yazarsa işaret yeniden konur, görünür olunca yeni başlık döner", async () => {
    setVisibility("hidden");
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(document.title).toBe("● İlk planın hazır · Başlangıç · Demirkazık");
    document.title = "Bugün · Demirkazık"; // `router.refresh()` sonrası Next başlığı kendi değeriyle yazar
    await waitFor(() => expect(document.title).toBe("● İlk planın hazır · Bugün · Demirkazık"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.title).toBe("Bugün · Demirkazık");
  });

  it("arka arkaya iki bitiş (bakış, sonra ilk tur) tek işaret bırakır; görünür olunca başlık ilk haline döner", async () => {
    setVisibility("hidden");
    const { rerender } = render(<JobFinishEffects active={undefined} finished={finishedView({ id: "job_probe", params: { phase: "probe" } })} />);
    expect(document.title).toBe("● Hesabına baktım, sıra sende · Başlangıç · Demirkazık");
    rerender(<JobFinishEffects active={undefined} finished={finishedView({ id: "job_build" })} />);
    await Promise.resolve();
    expect(document.title).toBe("● İlk planın hazır · Başlangıç · Demirkazık");
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.title).toBe("Başlangıç · Demirkazık");
  });

  it("odak gelince de eski başlığa döner", () => {
    setVisibility("hidden");
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    window.dispatchEvent(new Event("focus"));
    expect(document.title).toBe("Başlangıç · Demirkazık");
  });

  it("izin ve tercih yokken tarayıcı bildirimi gösterilmez", () => {
    setVisibility("hidden");
    FakeNotification.permission = "granted"; // izin başka yerden verilmiş olsa bile tercih yoksa bildirim yok
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(FakeNotification.created).toEqual([]);
  });

  it("kullanıcı 'bitince haber ver'e bastıysa tarayıcı bildirimi gösterilir", async () => {
    FakeNotification.permission = "granted";
    expect(await enableBrowserNotice()).toBe("on");
    setVisibility("hidden");
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(FakeNotification.created).toHaveLength(1);
    expect(FakeNotification.created[0]).toMatchObject({ title: "İlk planın hazır", options: { tag: "onboarding-job_onb" } });
  });

  it("tercih kapatılırsa bildirim yok", async () => {
    FakeNotification.permission = "granted";
    await enableBrowserNotice();
    expect(disableBrowserNotice()).toBe("off");
    setVisibility("hidden");
    render(<JobFinishEffects active={undefined} finished={finishedView()} />);
    expect(FakeNotification.created).toEqual([]);
  });
});

describe("JobFinishEffects: arka plan yoklaması", () => {
  it("başlangıç işi sürerken depoya arka plan yoklamasını açar, iş bitince kapatır", () => {
    const spy = vi.spyOn(jobStatusStore, "setBackgroundPolling");
    const { rerender, unmount } = render(<JobFinishEffects active={view()} finished={undefined} />);
    expect(spy).toHaveBeenLastCalledWith(true);
    rerender(<JobFinishEffects active={undefined} finished={undefined} />);
    expect(spy).toHaveBeenLastCalledWith(false);
    unmount();
    spy.mockRestore();
  });

  it("başka türdeki işte açmaz", () => {
    const spy = vi.spyOn(jobStatusStore, "setBackgroundPolling");
    render(<JobFinishEffects active={viewOf(RUNNING_JOB)} finished={undefined} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
