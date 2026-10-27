// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  approvePublishJob: vi.fn(),
  resolveIdeaLinkAction: vi.fn(),
  linkIdeaToReelAction: vi.fn(),
  requestJobAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/publish", () => ({ approvePublishJob: mocks.approvePublishJob }));
vi.mock("@/app/actions/idea-links", () => ({ resolveIdeaLinkAction: mocks.resolveIdeaLinkAction, linkIdeaToReelAction: mocks.linkIdeaToReelAction }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: mocks.requestJobAction }));

import { ACTION_UNREACHABLE_MESSAGE } from "@/components/common/call-action";
import { FocusBlock } from "@/components/today/focus-block";
import { LaterList } from "@/components/today/later-list";
import type { DecisionCard as DecisionCardModel } from "@/lib/today";

const APPROVE: DecisionCardModel = {
  id: "approve_publish:job_1",
  kind: "approve_publish",
  title: "Yayın onayını bekliyor",
  body: "Hazırlanan video yayına çıkmak için onayını bekliyor.",
  primary: { kind: "action", action: "approvePublishJob", label: "Yayını onayla", payload: { jobId: "job_1" } },
  secondary: { kind: "link", label: "Yayını aç", href: "/yayin" },
  evidence: ["idea:idea_1"],
  operatorOnly: false,
};

const CONFIRM: DecisionCardModel = {
  id: "confirm_link:l1",
  kind: "confirm_link",
  title: "Bu video bu fikirden mi çıktı?",
  body: "Yayınladığın bir videonun hangi fikirden çıktığını tahmin ettim.",
  primary: { kind: "action", action: "resolveIdeaLinkAction", label: "Evet, bu fikir", payload: { linkId: "l1", decision: "confirm" } },
  secondary: { kind: "action", action: "resolveIdeaLinkAction", label: "Bu değil", payload: { linkId: "l1", decision: "reject" } },
  evidence: [],
  operatorOnly: false,
};

const PASTE: DecisionCardModel = {
  id: "paste_reel_link:idea_2",
  kind: "paste_reel_link",
  title: "Bu videoyu paylaştın mı?",
  body: "Planlanan gün geçti. Paylaştıysan bağlantısını yapıştır; sonucunu takip edeyim.",
  primary: { kind: "action", action: "linkIdeaToReelAction", label: "Bağlantıyı kaydet", payload: { ideaId: "idea_2" }, input: "url" },
  secondary: { kind: "link", label: "Senaryoyu aç", href: "/fikirler?id=idea_2" },
  evidence: [],
  operatorOnly: false,
};

const ROUTINE: DecisionCardModel = {
  id: "run_routine",
  kind: "run_routine",
  title: "Haftalık tur zamanı",
  body: "Gelecek haftanın planı henüz hazır değil.",
  primary: { kind: "action", action: "requestJobAction", label: "Haftalık turu başlat", payload: { kind: "routine" } },
  secondary: { kind: "link", label: "İşler'i aç", href: "/isler" },
  evidence: [],
  operatorOnly: true,
};

const BLOCKED: DecisionCardModel = {
  id: "approve_publish:job_2",
  kind: "approve_publish",
  title: "Yayın onayını bekliyor",
  body: "Hazırlanan video yayına çıkmak için onayını bekliyor.",
  primary: { kind: "link", label: "Yayını düzelt", href: "/yayin" },
  evidence: [],
  operatorOnly: false,
  blockedReason: "Açıklamada reklam ibaresi eksik.",
};

const ZONE = "Europe/Istanbul";

/** Baskın kart (gece bloğu) ya da "Sonra" satırı (içeriği görünür olsun diye açılır). */
function renderCard(card: DecisionCardModel, lead = true) {
  if (lead) return render(<FocusBlock card={card} position={1} total={3} stepLabel="Karar" timeZone={ZONE} />);
  const view = render(<LaterList cards={[card]} timeZone={ZONE} />);
  view.container.querySelector("details")?.setAttribute("open", "");
  return view;
}

/** Karta ait kap: baskın blok bölge, "Sonra" satırı liste öğesidir. */
const itemOf = (title: string) => screen.queryByRole("region", { name: title }) ?? screen.getByText(title, { selector: "li b" }).closest("li")!;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("FocusBlock ve Sonra satırı (karar eylemleri)", () => {
  it("ilk kart: sıra etiketi, başlık, cümle; TEK birincil düğme (dolu) + ikincil bağlantı; 'Neden?' kapalı gelir ve kanıtı taşır", async () => {
    const user = userEvent.setup();
    renderCard(APPROVE);
    const item = itemOf("Yayın onayını bekliyor");
    expect(item.closest("[data-decision]")).toHaveAttribute("data-lead", "true");
    expect(item).toHaveTextContent("Karar 1/3");
    expect(within(item).getAllByRole("button")).toHaveLength(1);
    expect(within(item).getByRole("button", { name: "Yayını onayla" })).toHaveAttribute("data-emphasis", "true");
    expect(within(item).getByRole("link", { name: "Yayını aç" })).toHaveAttribute("href", "/yayin");

    const details = screen.getByText("Neden?").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText("Neden?"));
    expect(within(details).getByRole("link", { name: "fikir" })).toHaveAttribute("href", "/fikirler?id=idea_1");
  });

  it("sonraki kart sessiz satırdır: birincil düğme dolu değil (ekranda tek dolu düğme baskın bloktadır); kanıt ve güven yoksa 'Neden?' çizilmez", () => {
    renderCard(CONFIRM, false);
    expect(itemOf(CONFIRM.title).closest("[data-decision]")).toHaveAttribute("data-lead", "false");
    expect(screen.getByRole("button", { name: "Evet, bu fikir" })).toHaveAttribute("data-emphasis", "false");
    expect(screen.queryByText("Neden?")).not.toBeInTheDocument();
  });

  it("birincil düğme eşlenen action'ı yükle çağırır; beklerken düğmeler kapalı; başarıda sayfa verisi yenilenir", async () => {
    let finish!: (value: { ok: true }) => void;
    mocks.approvePublishJob.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderCard(APPROVE);
    await user.click(screen.getByRole("button", { name: "Yayını onayla" }));

    expect(mocks.approvePublishJob).toHaveBeenCalledExactlyOnceWith("job_1");
    expect(screen.getByRole("button", { name: "Yayını onayla" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Yayını onayla" })).toHaveAttribute("aria-busy", "true");
    expect(mocks.refresh).not.toHaveBeenCalled();

    finish({ ok: true });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Tamam, kaydettim.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ikincil düğme de action olabilir: 'Bu değil' ret kararını gönderir", async () => {
    mocks.resolveIdeaLinkAction.mockResolvedValue({ ok: true, linkId: "l1", status: "rejected" });
    const user = userEvent.setup();
    renderCard(CONFIRM);
    await user.click(screen.getByRole("button", { name: "Bu değil" }));
    expect(mocks.resolveIdeaLinkAction).toHaveBeenCalledExactlyOnceWith({ linkId: "l1", decision: "reject" });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("hata kartın içinde sebep + 'Tekrar dene' olarak yazılır; kart yerinde kalır, sayfa yenilenmez; tekrar deneyince aynı action çağrılır", async () => {
    mocks.approvePublishJob.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Bu iş artık onay beklemiyor." }).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    renderCard(APPROVE);
    await user.click(screen.getByRole("button", { name: "Yayını onayla" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bu iş artık onay beklemiyor.");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(itemOf(APPROVE.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yayını onayla" })).toBeEnabled();

    await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.approvePublishJob).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sunucuya ulaşılamazsa (action fırlatırsa) Türkçe hata gösterilir", async () => {
    mocks.approvePublishJob.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderCard(APPROVE);
    await user.click(screen.getByRole("button", { name: "Yayını onayla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_UNREACHABLE_MESSAGE);
  });

  it("iş başlatan kart: haftalık turu ONAYSIZ ister (yükte tutar yok); başarıda 'sıraya yazdım' der ve sayfa yenilenir", async () => {
    mocks.requestJobAction.mockResolvedValue({ ok: true, jobId: "job-9" });
    const user = userEvent.setup();
    renderCard(ROUTINE);
    expect(screen.getByRole("link", { name: "İşler'i aç" })).toHaveAttribute("href", "/isler");
    await user.click(screen.getByRole("button", { name: "Haftalık turu başlat" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "routine" });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Tamam, sıraya yazdım.");
  });

  it("iş açılamazsa (ör. başka iş sürüyor) sebep kartta kalır, sayfa yenilenmez", async () => {
    mocks.requestJobAction.mockResolvedValue({ ok: false, code: "already_exists", message: "Bu hesapta zaten süren bir iş var." });
    const user = userEvent.setup();
    renderCard(ROUTINE);
    await user.click(screen.getByRole("button", { name: "Haftalık turu başlat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Olmadı: Bu hesapta zaten süren bir iş var.");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeEnabled();
  });

  it("engelli kart: sebep görünür, onay düğmesi YOK; tek eylem düzeltme bağlantısıdır", () => {
    renderCard(BLOCKED);
    const item = itemOf(BLOCKED.title);
    expect(item).toHaveTextContent("Açıklamada reklam ibaresi eksik.");
    expect(within(item).queryByRole("button")).not.toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Yayını düzelt" })).toHaveAttribute("href", "/yayin");
    expect(mocks.approvePublishJob).not.toHaveBeenCalled();
  });

  it("adres isteyen kart: boş gönderimde action çağrılmaz, alan hatayı söyler; yapıştırınca adres yüke eklenir (Enter gönderir)", async () => {
    mocks.linkIdeaToReelAction.mockResolvedValue({ ok: true, ideaId: "idea_2", status: "confirmed" });
    const user = userEvent.setup();
    renderCard(PASTE);
    const input = screen.getByRole("textbox", { name: "Videonun bağlantısı" });

    await user.click(screen.getByRole("button", { name: "Bağlantıyı kaydet" }));
    expect(mocks.linkIdeaToReelAction).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Önce videonun bağlantısını yapıştır.");
    expect(input).toHaveFocus();

    await user.paste("  https://www.instagram.com/reel/ABC123/  ");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.linkIdeaToReelAction).toHaveBeenCalledExactlyOnceWith({ ideaId: "idea_2", url: "https://www.instagram.com/reel/ABC123/" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("adres isteyen kartta sunucu hatası (tanınmayan bağlantı) kartta kalır; yazılan adres silinmez", async () => {
    mocks.linkIdeaToReelAction.mockResolvedValue({ ok: false, code: "invalid_input", message: "Geçerli bir Instagram içerik bağlantısı yapıştır." });
    const user = userEvent.setup();
    renderCard(PASTE);
    const input = screen.getByRole("textbox", { name: "Videonun bağlantısı" });
    await user.click(input);
    await user.paste("https://ornek.com/x");
    await user.click(screen.getByRole("button", { name: "Bağlantıyı kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Geçerli bir Instagram içerik bağlantısı yapıştır.");
    expect(input).toHaveValue("https://ornek.com/x");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});


describe("FocusBlock (baskın iş)", () => {
  const TIMED: DecisionCardModel = {
    id: "shoot_next:idea_7",
    kind: "shoot_next",
    title: "Sıradaki çekim",
    subject: "Görmeden önce görmek",
    dueAt: "2026-10-12T18:00:00Z",
    body: "Senaryosu hazır. Çekmen yeter.",
    primary: { kind: "link", label: "Senaryoyu aç", href: "/fikirler?id=idea_7" },
    evidence: [],
    operatorOnly: false,
  };

  it("zamanı olan kart: dev saat çalışma alanı diliminde, gün + tarih ve açıklama; başlık konudur, kart adı etikettir", () => {
    render(<FocusBlock card={TIMED} position={1} total={2} stepLabel="Karar" timeZone={ZONE} />);
    const block = screen.getByRole("region", { name: "Görmeden önce görmek" });
    expect(within(block).getByText("21:00")).toBeInTheDocument();
    expect(block).toHaveTextContent("Pazartesi · 12 Eki");
    expect(block).toHaveTextContent("yayın saati");
    expect(block).toHaveTextContent("Sıra sende");
    expect(block).toHaveTextContent("Sıradaki çekim");
    expect(block.querySelector('[data-slot="due"]')).not.toBeNull();
  });

  it("zamansız kartta saat bloğu çizilmez (saat uydurulmaz); hedef kitle saati farklıysa küçük not düşer", () => {
    const { unmount } = render(<FocusBlock card={{ ...TIMED, dueAt: undefined }} position={1} total={1} stepLabel="Adım" timeZone={ZONE} />);
    expect(document.querySelector('[data-slot="due"]')).toBeNull();
    expect(screen.getByRole("region", { name: "Görmeden önce görmek" })).toHaveTextContent("Adım 1/1");
    unmount();
    render(<FocusBlock card={TIMED} position={1} total={1} stepLabel="Karar" timeZone={ZONE} audienceTimeZone="America/New_York" />);
    expect(screen.getByRole("region", { name: "Görmeden önce görmek" })).toHaveTextContent("hedef kitle için 14:00 ET");
  });
});

describe("LaterList (Sonra)", () => {
  it("satırlar sessizdir ve kapalı gelir; kart yoksa hiçbir şey çizilmez; zamanı olan satır gün ve saat gösterir", () => {
    const { container, unmount } = render(<LaterList cards={[CONFIRM, { ...APPROVE, dueAt: "2026-10-12T18:00:00Z" }]} timeZone={ZONE} />);
    const list = screen.getByTestId("today-later");
    expect(within(list).getByRole("heading", { name: "Sonra" })).toBeInTheDocument();
    expect(container.querySelectorAll("li > details")).toHaveLength(2);
    expect([...container.querySelectorAll<HTMLDetailsElement>("li > details")].every((details) => !details.open)).toBe(true);
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent("21:00");
    expect(list.querySelector('[data-emphasis="true"]')).toBeNull();
    unmount();
    expect(render(<LaterList cards={[]} timeZone={ZONE} />).container).toBeEmptyDOMElement();
  });

  it("liste satırı gereksiz aria-labelledby taşımaz (adı içeriğinden gelir; özet başlığın kendi metni)", () => {
    const { container } = render(<LaterList cards={[CONFIRM, APPROVE]} timeZone={ZONE} />);
    expect(container.querySelectorAll("li[aria-labelledby]")).toHaveLength(0);
    expect(container.querySelectorAll("li[id], li b[id]")).toHaveLength(0);
  });
});
