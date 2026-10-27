// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), snapshot: { settled: {}, workerNeeded: false } as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: vi.fn() }) }));
vi.mock("@/components/jobs/use-jobs-status", () => ({ useJobsStatus: () => mocks.snapshot }));
vi.mock("@/components/jobs/job-status-store", () => ({ jobStatusStore: { follow: vi.fn() } }));
vi.mock("@/app/actions/onboarding", () => ({
  addOnboardingAccountAction: vi.fn(),
  startOnboardingProbeAction: vi.fn(),
  confirmOnboardingAccountAction: vi.fn(),
  startOnboardingBuildAction: vi.fn(),
  addOnboardingRivalAction: vi.fn(),
  discardOnboardingAccountAction: vi.fn(),
}));

import type { JobsSeed } from "@/components/jobs/job-run-types";
import { AddStep, ReviewStep } from "@/components/onboarding/account-steps";
import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import { DoneStep } from "@/components/onboarding/done-step";
import { BlockedStep, ProgressStep, RivalsStep } from "@/components/onboarding/flow-steps";
import { OnboardingFrame } from "@/components/onboarding/onboarding-frame";
import type { PlatformOption } from "@/components/onboarding/platform-options";
import { ONBOARDING_REFRESH_MS, ProgressPanel } from "@/components/onboarding/progress-panel";
import type { ContentItem } from "@/lib/domain/content";
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";

const PLATFORMS: PlatformOption[] = [
  { value: "instagram", label: "Instagram", available: true },
  { value: "tiktok", label: "TikTok", available: false },
];
const SEED: JobsSeed = { scope: "ws-1", status: { workerNeeded: false } };
const ACCOUNT: NonNullable<OnboardingState["account"]> = { id: "acc-1", platform: "instagram", handle: "ornek.hesap", connection: "scrape_only" };
const ATTEMPTS = { probe: 2, build: 2 };

const job = (extra: Partial<JobStatusView> = {}): JobStatusView => ({
  id: "job_1",
  kind: "onboarding",
  dryRun: false,
  status: "running",
  stale: false,
  cancelRequested: false,
  steps: [],
  createdAt: "2026-10-13T09:00:00.000Z",
  ...extra,
});

const statuses = () => [...document.querySelectorAll<HTMLElement>("[data-step]")].map((item) => `${item.dataset.step}:${item.dataset.stepStatus}`);

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.snapshot = { settled: {}, workerNeeded: false };
});
afterEach(() => vi.useRealTimers());

describe("OnboardingFrame", () => {
  it("başlık Demirkazık'ın sözüdür; yol şeridi yeri gösterir (geçilen, şimdiki, sıradaki) ve bağlantı taşımaz", () => {
    render(
      <OnboardingFrame title="Bu sen misin?" lead="Doğru hesabı bulduysam söyle." notice="Hesabında az video var." maskotName="Demirkazık" mascot="telling" current={3} complete={false}>
        <p>gövde</p>
      </OnboardingFrame>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Bu sen misin?" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Demirkazık anlatıyor" })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="onboarding-notice"]')).toHaveTextContent("Hesabında az video var.");
    const rail = screen.getByRole("navigation", { name: "Başlangıç adımları" });
    const stops = within(rail).getAllByRole("listitem");
    expect(stops.map((stop) => stop.textContent)).toEqual(["Hesap", "İlk bakış", "3Hesabı onayla", "4Benzer hesaplar", "5İlk plan"]);
    expect(rail).toHaveTextContent("Adım 3/5 · Hesabı onayla");
    expect(stops[2]).toHaveAttribute("aria-current", "step");
    expect(within(rail).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("AddStep", () => {
  it("hesap ekleme formu + sonra ne olacağı; 'Yakında' platform seçilemez", () => {
    render(<AddStep state={{ step: "add_account", next: "add_account" }} platforms={PLATFORMS} returning={false} />);
    expect(document.querySelector('[data-slot="add-account-form"]')).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /TikTok/ })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Sonra ne olacak?" })).toBeInTheDocument();
    expect(screen.getByText(/Şifre istemem/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="pending-account"]')).toBeNull();
  });

  it("hesap ekli ama ona bakılmadıysa tek birincil eylem 'Hesabıma bak'tır; 'başka hesap ekle' kapalı açılır alanda, 'Sıra sende' bir kez", () => {
    render(<AddStep state={{ step: "add_account", next: "start_probe", account: ACCOUNT }} platforms={PLATFORMS} returning={false} />);
    expect(document.querySelector('[data-slot="pending-account"]')).toHaveTextContent("@ornek.hesap ekli; ona henüz bakmadım.");
    expect(screen.getByRole("button", { name: "Hesabıma bak" })).toBeEnabled();
    const another = document.querySelector<HTMLDetailsElement>('[data-slot="another-account"]');
    expect(another).not.toBeNull();
    expect(another?.open).toBe(false);
    expect(another?.querySelector("summary")).toHaveTextContent("Başka bir hesap ekle");
    expect(another?.querySelector('[data-slot="add-account-form"]')).not.toBeNull();
    expect(screen.getAllByText("Sıra sende")).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="onboarding-decision"]')).toHaveLength(1);
  });

  it("'başka hesap ekle' niyetiyle gelindiyse kaldığı yere dönüş bağlantısı vardır; eylemler kapalıysa form yerine neden yazar", () => {
    render(<AddStep state={{ step: "building", account: ACCOUNT }} platforms={PLATFORMS} returning closed={<p>Hesap ekleme bu ortamda kapalı.</p>} />);
    expect(screen.getByRole("link", { name: "@ornek.hesap için kaldığın yere dön" })).toHaveAttribute("href", "/baslangic");
    expect(screen.getByText("Hesap ekleme bu ortamda kapalı.")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="add-account-form"]')).toBeNull();
  });
});

describe("ProgressPanel", () => {
  it("aşamanın bütün adımları gerçek durumlarıyla; inceleme adımında sayaç; şimdiki adım işaretli", () => {
    mocks.snapshot = {
      settled: {},
      workerNeeded: false,
      active: job({ currentStep: "analyze", progress: { done: 7, total: 19 }, steps: [{ id: "collect", status: "ok" }, { id: "analyze", status: "running" }] }),
    };
    render(<ProgressPanel seed={SEED} phase="build" />);
    expect(statuses()).toEqual(["collect:ok", "analyze:running", "label:pending", "cluster:pending", "plan:pending", "briefing:pending"]);
    // İlk incelemede toplama "videoları getirmek"tir (hesaba bakışta aynı adım "hesabına bakıyorum" der).
    expect(document.querySelector('[data-step="collect"]')).toHaveTextContent("Videoları getiriyorum");
    expect(document.querySelector('[data-step="plan"]')).toHaveTextContent("Planını yazıyorum");
    const current = document.querySelector('[data-step="analyze"]');
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent("Videolarını inceliyorum");
    expect(current?.querySelector('[data-slot="step-counter"]')).toHaveTextContent("7/19");
    expect(document.querySelector('[data-slot="onboarding-progress"]')).toHaveAttribute("data-state", "running");
    // Adım duyurusu durum şeridindedir: buradaki canlı bölge adım / sayaç okumaz (her yoklamada konuşmaz).
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("hesaba bakışta kendi dört adımı; sıradayken ve yanıt gelmezken düz dille söyler", () => {
    mocks.snapshot = { settled: {}, workerNeeded: false, active: job({ status: "queued" }) };
    const { rerender } = render(<ProgressPanel seed={SEED} phase="probe" />);
    expect(statuses()).toEqual(["verify:pending", "collect:pending", "discover:pending", "draft_niche:pending"]);
    expect(screen.getByRole("status")).toHaveTextContent("Sıradayım; birazdan başlıyorum.");

    mocks.snapshot = { settled: {}, workerNeeded: false, active: job({ stale: true, currentStep: "verify", steps: [{ id: "verify", status: "running" }] }) };
    rerender(<ProgressPanel seed={SEED} phase="probe" />);
    expect(document.querySelector('[data-slot="onboarding-progress"]')).toHaveAttribute("data-state", "stale");
    expect(screen.getByRole("status")).toHaveTextContent("Bir süredir ilerleyemiyorum.");
  });

  it("olmayan adım 'tamam' görünmez: sonucu düz dille yazılır", () => {
    mocks.snapshot = { settled: {}, workerNeeded: false, active: job({ steps: [{ id: "verify", status: "failed", code: "account_private" }] }) };
    render(<ProgressPanel seed={SEED} phase="probe" />);
    expect(statuses()[0]).toBe("verify:failed");
    expect(document.querySelector('[data-step="verify"]')).toHaveTextContent(/olmadı/);
  });

  it("etkin iş görünmüyorsa 'bitiriyorum' der; sayfa verisi aralıkla yenilenir (adım sunucuda türer)", () => {
    vi.useFakeTimers();
    render(<ProgressPanel seed={SEED} phase="build" />);
    expect(screen.getByRole("status")).toHaveTextContent("Bitiriyorum");
    expect(document.querySelector('[data-slot="onboarding-progress"]')).toHaveAttribute("data-state", "settling");
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(ONBOARDING_REFRESH_MS));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("ProgressStep: yaklaşık süre ve 'kapatabilirsin' notu; iş durumu okunamadıysa çökmez", () => {
    mocks.snapshot = { settled: {}, workerNeeded: false, active: job() };
    const { unmount } = render(<ProgressStep phase="probe" seed={SEED} />);
    expect(screen.getByText("3–5")).toBeInTheDocument();
    expect(screen.getByText(/Başka bir sekmeye geçebilir/)).toBeInTheDocument();
    unmount();
    render(<ProgressStep phase="build" seed={undefined} />);
    expect(screen.getByText("20–25")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="onboarding-progress"]')).toHaveAttribute("data-state", "unknown");
  });
});

describe("ReviewStep", () => {
  it("profil özeti: ad, takipçi, video; ölçülemeyen sayı tire + sebep (0 değil); tahmin ön seçili", () => {
    render(
      <ReviewStep
        state={{
          account: ACCOUNT,
          accountType: "business",
          probe: { profile: { platform: "instagram", handle: "ornek.hesap", displayName: "Örnek Hesap" }, videoCount: 0, suggestedAccountType: "creator", nicheDraft: "Taslak" },
        }}
      />,
    );
    const profile = document.querySelector<HTMLElement>('[data-slot="onboarding-profile"]');
    expect(profile).toHaveTextContent("@ornek.hesap");
    expect(profile).toHaveTextContent("Örnek Hesap");
    const [followers, videos] = [...(profile?.querySelectorAll("dd") ?? [])];
    expect(followers.querySelector('[data-state="unmeasured"]')).toHaveTextContent("—");
    expect(followers).toHaveTextContent("takipçi sayısını okuyamadım");
    expect(followers).not.toHaveTextContent("0");
    // Ölçülmüş 0 gerçek değerdir: "0" yazılır.
    expect(videos.querySelector('[data-state="measured"]')).toHaveTextContent("0");
    expect(screen.getByRole("radio", { name: /İçerik üreticisi/ })).toBeChecked();
    expect(screen.getByLabelText("Ne anlatıyorsun, kime sesleniyorsun?")).toHaveValue("Taslak");
  });

  it("kayıtlı konu taslağın önündedir; eylemler kapalıysa karar bloğu yerine neden yazar", () => {
    const state = { account: ACCOUNT, accountType: "mixed" as const, nicheBrief: "Kayıtlı konu", probe: { profile: { platform: "instagram" as const, handle: "ornek.hesap", followers: 12400 }, nicheDraft: "Taslak" } };
    const { unmount } = render(<ReviewStep state={state} />);
    expect(screen.getByLabelText("Ne anlatıyorsun, kime sesleniyorsun?")).toHaveValue("Kayıtlı konu");
    expect(screen.getByRole("radio", { name: /Karma/ })).toBeChecked();
    expect(document.querySelector('[data-slot="onboarding-profile"]')).toHaveTextContent("12,4 B");
    unmount();
    render(<ReviewStep state={state} closed={<p>kapalı</p>} />);
    expect(document.querySelector('[data-slot="review-account-form"]')).toBeNull();
    expect(screen.getByText("kapalı")).toBeInTheDocument();
  });
});

describe("RivalsStep", () => {
  it("ilk üç öneri ön seçili gelir; kendi hesabın özeti bilinen parçalarla yazılır", () => {
    const options = ["a", "b", "c", "d"].map((id) => ({ id, handle: `hesap.${id}`, manual: false }));
    render(<RivalsStep state={{ account: ACCOUNT, probe: { profile: { platform: "instagram", handle: "ornek.hesap", followers: 12400 }, videoCount: 25 } }} options={options} />);
    expect(screen.getAllByRole("checkbox").filter((box) => box.getAttribute("name") === "rival").map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, true, false]);
    expect(document.querySelector('[data-slot="own-account"]')).toHaveTextContent("@ornek.hesap · 12,4 B takipçi · 25 video");
    expect(screen.getByRole("heading", { name: "Neden benzer hesaplar?" })).toBeInTheDocument();
  });
});

describe("BlockedStep", () => {
  const resume = <button type="button">Kaldığın yerden sürdür</button>;

  it("gizli hesap: net neden + ne yapabileceği (yeniden bak ya da başka hesap)", () => {
    render(<BlockedStep state={{ next: "start_probe", reason: "account_private", account: ACCOUNT, attemptsLeft: ATTEMPTS }} platforms={PLATFORMS} resume={resume} />);
    expect(screen.getByText("@ornek.hesap")).toBeInTheDocument();
    expect(screen.getByText(/Düzelttiysen yeniden bakabilirim\./)).toBeInTheDocument();
    expect(screen.getByText(/2 kez daha deneyebilirim\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hesabıma bak" })).toBeEnabled();
    // "Başka hesap dene": yanlış açılan hesap bırakılır (kaldırma sunucuda denenir), sonra ekleme formu açılır.
    expect(screen.getByRole("button", { name: "Başka bir hesap ekle" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Kaldığın yerden sürdür" })).not.toBeInTheDocument();
  });

  it("bulunamayan hesap / biten deneme hakkı: yeniden bakış yok, hesap ekleme formu vardır", () => {
    render(<BlockedStep state={{ next: "add_account", reason: "account_not_found", account: ACCOUNT, attemptsLeft: { probe: 0, build: 2 } }} platforms={PLATFORMS} resume={resume} />);
    expect(document.querySelector('[data-slot="add-account-form"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hesabıma bak" })).not.toBeInTheDocument();
  });

  it("yarıda kalan ilk inceleme: yapılanın durduğunu söyler, 'kaldığın yerden sürdür' ve Sonuçlar bağlantısı", () => {
    render(<BlockedStep state={{ next: "resume", reason: "build_incomplete", account: ACCOUNT, attemptsLeft: ATTEMPTS }} platforms={PLATFORMS} resume={resume} />);
    expect(document.querySelector('[data-slot="onboarding-resume"]')).toHaveTextContent("Yaptıklarım duruyor.");
    expect(screen.getByRole("button", { name: "Kaldığın yerden sürdür" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sonuçları aç" })).toHaveAttribute("href", "/sonuclar");
  });
});

describe("DoneStep", () => {
  const plan: WeeklyPlanSummary = { id: "plan-1", weekStart: "2026-10-12", status: "draft", plannedCount: 5, alternativeCount: 2, summary: "Bu hafta güven kuran videolar.", generatedAt: "2026-10-13T09:00:00.000Z" };
  const outlier = (id: string, lift: number | undefined, caption?: string) =>
    ({ id, owner: { kind: "own", id: "acc-1", handle: "ornek.hesap" }, caption, score: lift === undefined ? {} : { lift } }) as unknown as ContentItem;

  it("plan hazır: planın rakamı + 'Planı aç' (o haftaya) + en çok tutan üç video düz dille + Sonuçlar", () => {
    render(<DoneStep state={{ reason: "plan_ready" }} plan={plan} outliers={[outlier("c1", 5.9, "İlk video"), outlier("c2", undefined), outlier("c3", 2.3, "Üçüncü")]} maskotName="Demirkazık" canAdd />);
    const block = document.querySelector<HTMLElement>('[data-slot="onboarding-done"]');
    expect(block).toHaveAttribute("data-ready", "true");
    expect(block?.querySelector('[data-slot="plan-figure"]')).toHaveTextContent("5");
    expect(block).toHaveTextContent("Bu hafta güven kuran videolar.");
    expect(screen.getByRole("link", { name: "Planı aç" })).toHaveAttribute("href", "/bu-hafta?hafta=2026-10-12");
    const rows = within(document.querySelector<HTMLElement>('[data-slot="onboarding-outliers"]') as HTMLElement).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("İlk video");
    expect(rows[0]).toHaveTextContent("normalinin 5,9 katı izlendi");
    // Ölçülemeyen sonuç cümleye girmez; açıklamasız video uydurma başlık almaz.
    expect(rows[1]).toHaveTextContent("Açıklamasız video");
    expect(rows[1]).not.toHaveTextContent(/kat|izlendi/);
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/video/c1");
    expect(screen.getByRole("link", { name: "Sonuçları aç" })).toHaveAttribute("href", "/sonuclar");
    expect(screen.getByRole("link", { name: "Başka bir hesap ekle" })).toHaveAttribute("href", ONBOARDING_ADD_HREF);
    expect(document.body).not.toHaveTextContent(/lift|hook|\$/i);
  });

  it("plan okunamadıysa rakam uydurulmaz; 'Planı aç' yine çalışır", () => {
    render(<DoneStep state={{ reason: "plan_ready" }} plan={undefined} outliers={undefined} maskotName="Demirkazık" canAdd={false} />);
    expect(document.querySelector('[data-slot="plan-figure"]')).toBeNull();
    expect(screen.getByText("Planın hazır; içini birlikte açalım.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planı aç" })).toHaveAttribute("href", "/bu-hafta");
    expect(document.querySelector('[data-slot="onboarding-outliers"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Başka bir hesap ekle" })).not.toBeInTheDocument();
  });

  it("plan çıkmadıysa dürüst mesaj + Sonuçlar; plan özeti çizilmez", () => {
    render(<DoneStep state={{ reason: "plan_not_ready" }} plan={null} outliers={[]} maskotName="Demirkazık" canAdd />);
    const block = document.querySelector<HTMLElement>('[data-slot="onboarding-done"]');
    expect(block).toHaveAttribute("data-ready", "false");
    expect(block).toHaveTextContent("Yeni videolar geldikçe yeniden denerim.");
    expect(screen.queryByRole("link", { name: "Planı aç" })).not.toBeInTheDocument();
    expect(within(block as HTMLElement).getByRole("link", { name: "Sonuçları aç" })).toHaveAttribute("href", "/sonuclar");
    expect(screen.getByText(/Henüz öne çıkan bir video görmedim/)).toBeInTheDocument();
  });

  it("akıştan önce kurulmuş hesap: yalnız Bugün'e dönüş", () => {
    render(<DoneStep state={{ reason: "legacy" }} plan={plan} outliers={undefined} maskotName="Demirkazık" canAdd />);
    expect(screen.getByRole("link", { name: "Bugün'e git" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Planı aç" })).not.toBeInTheDocument();
  });
});
