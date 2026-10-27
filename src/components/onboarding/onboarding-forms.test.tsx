// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  follow: vi.fn(),
  addOnboardingAccountAction: vi.fn(),
  startOnboardingProbeAction: vi.fn(),
  confirmOnboardingAccountAction: vi.fn(),
  startOnboardingBuildAction: vi.fn(),
  addOnboardingRivalAction: vi.fn(),
  discardOnboardingAccountAction: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace, push: mocks.push }) }));
vi.mock("@/app/actions/onboarding", () => ({
  addOnboardingAccountAction: mocks.addOnboardingAccountAction,
  startOnboardingProbeAction: mocks.startOnboardingProbeAction,
  confirmOnboardingAccountAction: mocks.confirmOnboardingAccountAction,
  startOnboardingBuildAction: mocks.startOnboardingBuildAction,
  addOnboardingRivalAction: mocks.addOnboardingRivalAction,
  discardOnboardingAccountAction: mocks.discardOnboardingAccountAction,
}));
vi.mock("@/components/jobs/job-status-store", () => ({ jobStatusStore: { follow: mocks.follow } }));

import { AddAccountForm } from "@/components/onboarding/add-account-form";
import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import type { PlatformOption } from "@/components/onboarding/platform-options";
import { ProbeStartButton } from "@/components/onboarding/probe-start-button";
import { ReviewAccountForm, type AccountTypeChoice } from "@/components/onboarding/review-account-form";
import type { RivalOption } from "@/components/onboarding/rival-options";
import { RivalsForm } from "@/components/onboarding/rivals-form";

const PLATFORMS: PlatformOption[] = [
  { value: "instagram", label: "Instagram", available: true },
  { value: "tiktok", label: "TikTok", available: false },
  { value: "youtube", label: "YouTube", available: false },
];

const TYPES: AccountTypeChoice[] = [
  { value: "business", label: "İşletme / koç", description: "Satışa giden hesap." },
  { value: "creator", label: "İçerik üreticisi", description: "Erişim büyüten hesap." },
  { value: "mixed", label: "Karma", description: "İkisi birden." },
];

const RIVALS: RivalOption[] = ["a", "b", "c", "d"].map((id, index) => ({ id, handle: `hesap.${id}`, followers: index === 3 ? undefined : 1000 * (index + 1), similarSize: index < 2 ? true : undefined, manual: false }));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("AddAccountForm", () => {
  it("platformlar listeden gelir: modülü olmayan görünür ama seçilemez ve 'Yakında' rozetlidir", () => {
    render(<AddAccountForm platforms={PLATFORMS} />);
    const group = screen.getByRole("group", { name: "Platform" });
    expect(within(group).getByRole("radio", { name: "Instagram" })).toBeChecked();
    for (const name of [/TikTok/, /YouTube/]) {
      const radio = within(group).getByRole("radio", { name });
      expect(radio).toBeDisabled();
      expect(radio.closest("label")).toHaveTextContent("Yakında");
    }
    // Sıra ve seçilebilirlik veriden gelir: kayıtlı modül değişirse seçilebilen de değişir.
    render(<AddAccountForm platforms={[{ value: "tiktok", label: "TikTok", available: true }]} />);
    expect(screen.getAllByRole("radio", { name: "TikTok" }).at(-1)).toBeChecked();
  });

  it("resmi bağlantı düğmesi görünür ama kapalıdır; şifre istenmediği yazılır", () => {
    render(<AddAccountForm platforms={PLATFORMS} />);
    const connect = screen.getByRole("button", { name: /Hesabımı bağla/ });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAccessibleDescription(/şifre istemem/);
  });

  it("birincil düğme action'ı ham girdi + platformla çağırır; başarıda niyet adresten düşer ve sayfa yenilenir", async () => {
    mocks.addOnboardingAccountAction.mockResolvedValue({ ok: true, workspaceId: "ws-1", probeStarted: true });
    const user = userEvent.setup();
    render(<AddAccountForm platforms={PLATFORMS} />);
    await user.type(screen.getByLabelText("Kullanıcı adın ya da profil bağlantın"), "@Ornek.Hesap");
    expect(screen.getByText("Bakacağım hesap: @ornek.hesap")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Herkese açık veriyle devam et" }));
    await waitFor(() => expect(mocks.addOnboardingAccountAction).toHaveBeenCalledExactlyOnceWith({ handle: "@Ornek.Hesap", platform: "instagram" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/baslangic"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("geçersiz ad / zaten ekli hesap mesajı sunucudan gelir ve alanla ilişkilendirilir; ekran yerinde kalır", async () => {
    mocks.addOnboardingAccountAction.mockResolvedValue({ ok: false, code: "already_exists", message: "Bu hesabı zaten ekledin." });
    const user = userEvent.setup();
    render(<AddAccountForm platforms={PLATFORMS} />);
    const input = screen.getByLabelText("Kullanıcı adın ya da profil bağlantın");
    await user.type(input, "ornek{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu hesabı zaten ekledin.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Bu hesabı zaten ekledin\./);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    // Yazınca hata kalkar.
    await user.type(input, "2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("boş ya da platformun kuralına uymayan ad gönderilmez: mesaj alanın hemen altında, odak alanda, alan mesaja bağlı", async () => {
    const user = userEvent.setup();
    render(<AddAccountForm platforms={PLATFORMS} />);
    const input = screen.getByLabelText("Kullanıcı adın ya da profil bağlantın");
    const submit = screen.getByRole("button", { name: "Herkese açık veriyle devam et" });

    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("Kullanıcı adı ya da profil bağlantısı gir.");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Kullanıcı adı ya da profil bağlantısı gir\./);
    // Mesaj, alanla düğme arasında değil alanın hemen ardındadır.
    expect(input.nextElementSibling).toBe(screen.getByRole("alert"));

    // Instagram'ın sınırı (30) aşılınca sunucuya gidilmez.
    await user.type(input, "a".repeat(40));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("Geçersiz kullanıcı adı");
    expect(input).toHaveFocus();
    expect(mocks.addOnboardingAccountAction).not.toHaveBeenCalled();
  });

  it("sunucu hatasında da odak alana döner", async () => {
    mocks.addOnboardingAccountAction.mockResolvedValue({ ok: false, code: "already_exists", message: "Bu hesabı zaten ekledin." });
    const user = userEvent.setup();
    render(<AddAccountForm platforms={PLATFORMS} />);
    const input = screen.getByLabelText("Kullanıcı adın ya da profil bağlantın");
    await user.type(input, "ornek");
    await user.click(screen.getByRole("button", { name: "Herkese açık veriyle devam et" }));
    await screen.findByRole("alert");
    expect(input).toHaveFocus();
  });

  it("quiet kipte gönder düğmesi ikincildir ve kapalı 'resmi bağlantı' düğmesi çizilmez", () => {
    render(<AddAccountForm platforms={PLATFORMS} quiet />);
    expect(screen.getByRole("button", { name: "Herkese açık veriyle devam et" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Hesabımı bağla/ })).not.toBeInTheDocument();
  });

  it("seçilebilir platform yoksa birincil düğme kapalıdır", () => {
    render(<AddAccountForm platforms={PLATFORMS.map((option) => ({ ...option, available: false }))} />);
    expect(screen.getByRole("button", { name: "Herkese açık veriyle devam et" })).toBeDisabled();
  });
});

describe("ProbeStartButton", () => {
  it("bakışı başlatır, açılan işi izlemeye alır ve sayfayı yeniler; hata düğmenin altında yazar", async () => {
    mocks.startOnboardingProbeAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Bu hesap için deneme hakkı bitti." });
    const user = userEvent.setup();
    render(<ProbeStartButton />);
    await user.click(screen.getByRole("button", { name: "Hesabıma bak" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu hesap için deneme hakkı bitti.");
    expect(mocks.follow).not.toHaveBeenCalled();

    mocks.startOnboardingProbeAction.mockResolvedValueOnce({ ok: true, jobId: "job_9" });
    await user.click(screen.getByRole("button", { name: "Hesabıma bak" }));
    await waitFor(() => expect(mocks.follow).toHaveBeenCalledExactlyOnceWith("job_9"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ReviewAccountForm", () => {
  it("tahmin ön seçili ve rozetlidir ama karar kullanıcınındır; konu düzeltilir; onay seçilen türle gider", async () => {
    mocks.confirmOnboardingAccountAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ReviewAccountForm types={TYPES} initialType="creator" suggestedType="creator" initialNiche="Taslak konu" />);
    const group = screen.getByRole("group", { name: "Bu hesap ne için?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /İçerik üreticisi/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /İçerik üreticisi/ }).closest("label")).toHaveTextContent("Tahminim");

    await user.click(within(group).getByRole("radio", { name: /Karma/ }));
    const niche = screen.getByLabelText("Ne anlatıyorsun, kime sesleniyorsun?");
    expect(niche).toHaveValue("Taslak konu");
    await user.clear(niche);
    await user.paste("  Evde kahve demleme; yeni başlayanlara.  ");
    await user.click(screen.getByRole("button", { name: "Evet, bu benim" }));
    await waitFor(() => expect(mocks.confirmOnboardingAccountAction).toHaveBeenCalledExactlyOnceWith({ accountType: "mixed", nicheBrief: "Evde kahve demleme; yeni başlayanlara." }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("konu boş geçilebilir: alan hiç gönderilmez (kayıtlı konuya dokunulmaz)", async () => {
    mocks.confirmOnboardingAccountAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ReviewAccountForm types={TYPES} initialType="business" initialNiche="" />);
    expect(screen.queryByText("Tahminim")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Evet, bu benim" }));
    await waitFor(() => expect(mocks.confirmOnboardingAccountAction).toHaveBeenCalledExactlyOnceWith({ accountType: "business" }));
  });

  it("'Bu ben değilim' yanlış açılan hesabı kaldırmayı dener, sonra hesap ekleme formuna götürür", async () => {
    mocks.discardOnboardingAccountAction.mockResolvedValue({ ok: true, discarded: true });
    const user = userEvent.setup();
    render(<ReviewAccountForm types={TYPES} initialType="business" initialNiche="" />);
    await user.click(screen.getByRole("button", { name: "Bu ben değilim" }));
    await waitFor(() => expect(mocks.discardOnboardingAccountAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledExactlyOnceWith(ONBOARDING_ADD_HREF));
    expect(mocks.confirmOnboardingAccountAction).not.toHaveBeenCalled();
  });

  it("'Bu ben değilim': hesap kaldırılamasa da (gerçek veri) form açılır; sunucuya ulaşılamazsa ekranda kalır ve not yazar", async () => {
    const user = userEvent.setup();
    mocks.discardOnboardingAccountAction.mockResolvedValue({ ok: true, discarded: false });
    const { unmount } = render(<ReviewAccountForm types={TYPES} initialType="business" initialNiche="" />);
    await user.click(screen.getByRole("button", { name: "Bu ben değilim" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledExactlyOnceWith(ONBOARDING_ADD_HREF));
    unmount();

    mocks.push.mockClear();
    mocks.discardOnboardingAccountAction.mockRejectedValue(new Error("ağ yok"));
    render(<ReviewAccountForm types={TYPES} initialType="business" initialNiche="" />);
    await user.click(screen.getByRole("button", { name: "Bu ben değilim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hesabı bırakamadım.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Bu ben değilim" })).toBeEnabled();
  });

  it("onay hatası ekranda yazar", async () => {
    mocks.confirmOnboardingAccountAction.mockResolvedValue({ ok: false, code: "invalid_state", message: "Hesap şu an onaylanamaz." });
    const user = userEvent.setup();
    render(<ReviewAccountForm types={TYPES} initialType="business" initialNiche="" />);
    await user.click(screen.getByRole("button", { name: "Evet, bu benim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hesap şu an onaylanamaz.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("RivalsForm", () => {
  const boxes = () => screen.getAllByRole("checkbox").filter((box) => box.getAttribute("name") === "rival");

  it("ilk üçü ön seçilidir; en çok 3 seçilir: sınır dolunca kalan kutu kapanır, biri bırakılınca açılır", async () => {
    const user = userEvent.setup();
    render(<RivalsForm options={RIVALS} preselected={["a", "b", "c"]} max={3} />);
    expect(boxes().map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, true, false]);
    expect(boxes()[3]).toBeDisabled();
    expect(screen.getByText("3 benzer hesap seçtin")).toBeInTheDocument();
    // Ölçülemeyen takipçi 0 yazılmaz.
    expect(boxes()[3].closest("label")).toHaveTextContent("takipçi sayısı bilinmiyor");
    expect(boxes()[0].closest("label")).toHaveTextContent("Boyu sana yakın");

    await user.click(boxes()[0]);
    expect(boxes()[3]).toBeEnabled();
    await user.click(boxes()[3]);
    expect(boxes().map((box) => (box as HTMLInputElement).checked)).toEqual([false, true, true, true]);
    expect(boxes()[0]).toBeDisabled();
  });

  it("'Başlat' doğru action'ı seçilen hesaplarla çağırır, işi izlemeye alır ve sayfayı yeniler; ne olacağı düğmeye bağlı yazar", async () => {
    mocks.startOnboardingBuildAction.mockResolvedValue({ ok: true, jobId: "job_7" });
    const user = userEvent.setup();
    render(<RivalsForm options={RIVALS} preselected={["a", "b", "c"]} max={3} />);
    await user.click(boxes()[1]);
    const start = screen.getByRole("button", { name: "Başlat" });
    expect(start).toHaveAccessibleDescription(/ilk planını yazarım[\s\S]*hesap başına bir kez[\s\S]*20–25 dakika/);
    await user.click(start);
    await waitFor(() => expect(mocks.startOnboardingBuildAction).toHaveBeenCalledExactlyOnceWith({ rivalIds: ["a", "c"] }));
    await waitFor(() => expect(mocks.follow).toHaveBeenCalledExactlyOnceWith("job_7"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.addOnboardingAccountAction).not.toHaveBeenCalled();
  });

  it("TEK başlatan düğme var: 'Benzer hesap seçmeden devam et' yalnız seçimi boşaltır ve 'Başlat'ın notunu değiştirir", async () => {
    mocks.startOnboardingBuildAction.mockResolvedValue({ ok: true, jobId: "job_9" });
    const user = userEvent.setup();
    render(<RivalsForm options={RIVALS} preselected={["a", "b", "c"]} max={3} />);
    expect(screen.getAllByRole("button").filter((button) => /başlat|devam et/i.test(button.textContent ?? "")).map((button) => button.textContent)).toEqual(["Başlat"]);
    const none = screen.getByRole("checkbox", { name: "Benzer hesap seçmeden devam et" });
    const note = () => document.querySelector('[data-slot="start-note"]');
    expect(none).not.toBeChecked();
    expect(note()).toHaveAttribute("data-mode", "with-rivals");
    expect(note()).toHaveTextContent("seçtiğin hesaplara bakar");

    await user.click(none);
    expect(mocks.startOnboardingBuildAction, "işaretlemek başlatmaz").not.toHaveBeenCalled();
    expect(none).toBeChecked();
    expect(boxes().filter((box) => box !== none).every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText("Benzer hesap seçmedin")).toBeInTheDocument();
    expect(note()).toHaveAttribute("data-mode", "own-only");
    expect(note()).toHaveTextContent("yalnız kendi videolarına bakar");
    expect(screen.getByRole("button", { name: "Başlat" })).toHaveAccessibleDescription(/yalnız kendi videolarına bakar/);
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    await waitFor(() => expect(mocks.startOnboardingBuildAction).toHaveBeenCalledExactlyOnceWith({ rivalIds: [] }));
  });

  it("'seçmeden devam et' işareti kaldırılınca önerilen hesaplar geri gelir; bir hesap seçmek de işareti kaldırır", async () => {
    const user = userEvent.setup();
    render(<RivalsForm options={RIVALS} preselected={["a", "b"]} max={3} />);
    const none = screen.getByRole("checkbox", { name: "Benzer hesap seçmeden devam et" });
    await user.click(none);
    expect(none).toBeChecked();
    await user.click(none);
    expect(none).not.toBeChecked();
    expect(screen.getByText("2 benzer hesap seçtin")).toBeInTheDocument();
    await user.click(none);
    await user.click(boxes()[2]);
    expect(none).not.toBeChecked();
    expect(screen.getByText("1 benzer hesap seçtin")).toBeInTheDocument();
  });

  it("benzer hesapsız yol geçerlidir: boş listeyle başlar; öneri yokken de 'Başlat' çalışır", async () => {
    mocks.startOnboardingBuildAction.mockResolvedValue({ ok: true, jobId: "job_8" });
    const user = userEvent.setup();
    const { unmount } = render(<RivalsForm options={RIVALS} preselected={["a"]} max={3} />);
    await user.click(screen.getByRole("checkbox", { name: "Benzer hesap seçmeden devam et" }));
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    await waitFor(() => expect(mocks.startOnboardingBuildAction).toHaveBeenCalledExactlyOnceWith({ rivalIds: [] }));
    unmount();

    mocks.startOnboardingBuildAction.mockClear();
    render(<RivalsForm options={[]} preselected={[]} max={3} />);
    expect(screen.queryByRole("checkbox"), "liste boşken 'seçmeden devam et' kutusu gereksiz").not.toBeInTheDocument();
    expect(screen.getByText("Benzer hesap seçmedin")).toBeInTheDocument();
    expect(screen.getByText(/yalnız kendi videolarına bakar/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    await waitFor(() => expect(mocks.startOnboardingBuildAction).toHaveBeenCalledExactlyOnceWith({ rivalIds: [] }));
  });

  it("elle ekleme yalnız listeye ekler (izlemeye almaz); yer varsa eklenen seçili gelir; hata alanın altında yazar", async () => {
    mocks.addOnboardingRivalAction.mockResolvedValueOnce({ ok: false, code: "already_exists", message: "@hesap.a zaten listede." });
    const user = userEvent.setup();
    const { rerender } = render(<RivalsForm options={RIVALS} preselected={["a"]} max={3} />);
    const input = screen.getByLabelText("Bildiğin bir hesabı ekle");
    const add = screen.getByRole("button", { name: "Listeye ekle" });
    expect(add).toBeDisabled();
    await user.type(input, "hesap.a");
    await user.click(add);
    expect(await screen.findByRole("alert")).toHaveTextContent("@hesap.a zaten listede.");

    mocks.addOnboardingRivalAction.mockResolvedValueOnce({ ok: true, rivalId: "m", handle: "yeni.hesap" });
    await user.clear(input);
    await user.type(input, "yeni.hesap{Enter}");
    await waitFor(() => expect(mocks.addOnboardingRivalAction).toHaveBeenLastCalledWith({ handle: "yeni.hesap" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("");
    expect(mocks.startOnboardingBuildAction).not.toHaveBeenCalled();
    // Sayfa yenilenince satır listeye düşer ve seçili gelir.
    rerender(<RivalsForm options={[{ id: "m", handle: "yeni.hesap", manual: true }, ...RIVALS]} preselected={["a"]} max={3} />);
    expect(boxes()[0]).toBeChecked();
    expect(boxes()[0].closest("label")).toHaveTextContent("Sen ekledin");
    expect(screen.getByText("2 benzer hesap seçtin")).toBeInTheDocument();
  });

  it("3 hesap seçiliyken ekleme alanı kapanır ve nedenini yazar; biri bırakılınca açılır", async () => {
    const user = userEvent.setup();
    render(<RivalsForm options={RIVALS} preselected={["a", "b", "c"]} max={3} />);
    const input = screen.getByLabelText("Bildiğin bir hesabı ekle");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Listeye ekle" })).toBeDisabled();
    expect(input).toHaveAccessibleDescription(/En çok 3 hesap seçebilirsin; birinin seçimini kaldırırsan yenisini ekleyebilirsin\./);
    await user.click(boxes()[0]);
    expect(input).toBeEnabled();
    expect(document.querySelector('[data-slot="add-rival-full"]')).toBeNull();
  });

  it("tutar müşteri görünümünde yoktur; yönetici notu yalnız verilirse küçük not olarak çizilir; başlatma hatası ekranda yazar", async () => {
    mocks.startOnboardingBuildAction.mockResolvedValue({ ok: false, code: "already_exists", message: "Bu hesabın ilk incelemesi zaten yapıldı ya da sürüyor." });
    const user = userEvent.setup();
    const { unmount } = render(<RivalsForm options={RIVALS} preselected={["a"]} max={3} />);
    expect(document.querySelector('[data-operator="spend-note"]')).toBeNull();
    expect(document.body).not.toHaveTextContent(/\$|USD|Apify/i);
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("zaten yapıldı ya da sürüyor");
    expect(mocks.follow).not.toHaveBeenCalled();
    unmount();

    render(<RivalsForm options={RIVALS} preselected={["a"]} max={3} operatorNote="Yönetici notu: bu adımın harcama tavanı $0,40." />);
    expect(document.querySelector('[data-operator="spend-note"]')).toHaveTextContent("$0,40");
  });
});
