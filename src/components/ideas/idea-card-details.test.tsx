// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/studio-orders", () => ({ createStudioOrderAction: vi.fn() }));
vi.mock("@/app/actions/ideas", () => ({ updateIdeaStatusAction: vi.fn() }));
vi.mock("@/components/prompt/copy-prompt-button", () => ({ CopyPromptButton: () => <button type="button">Prompt olarak kopyala</button> }));

import { IdeaCard } from "@/components/ideas/idea-card";
import { planHref, PlanBadge } from "@/components/ideas/plan-link";
import { testIdea } from "@/components/ideas/test-idea";
import type { IdeaDetails } from "@/lib/domain/intel";
import { PANEL_JARGON } from "@/lib/plain-language";

const FULL_DETAILS: IdeaDetails = {
  topic: "sabah rutini",
  frame: "practical",
  ctaType: "comment_keyword",
  targetDurationSec: 75,
  durationBucket: "60_90",
  script: "Sabah kahveni yanlış içiyorsun.\nİşte düzeltmenin yolu.",
  scriptLanguage: "tr",
  captionDraft: "Sabah rutinindeki tek hata. YORUM: RUTİN",
  hookTypes: ["bold_claim", "callout", "story_open"],
  quotes: [
    { contentItemId: "ci_rival_1", ownerHandle: "noelle", text: "Comment RENEW and I will send you the guide." },
    { contentItemId: "ci_rival_2", text: "Bir cümle." },
  ],
  ownTried: false,
};

describe("planHref", () => {
  it("/bu-hafta'ya hafta parametresiyle gider; geçersiz hafta parametresiz sayfa", () => {
    expect(planHref("2026-09-28")).toBe("/bu-hafta?hafta=2026-09-28");
    expect(planHref(undefined)).toBe("/bu-hafta");
    expect(planHref("yarın")).toBe("/bu-hafta");
  });
});

describe("IdeaCard: hesap sahibinin kendi fikri", () => {
  it("elle (sohbetten) eklenen fikirde 'Senin fikrin' rozeti var; plan rozeti ve belirsiz açılış rozeti yok", () => {
    render(<IdeaCard idea={testIdea({ source: "manual", hooks: [], hookType: undefined, evidence: [], scriptOutline: [], rankScore: 0 })} />);
    expect(screen.getByText("Senin fikrin")).toBeInTheDocument();
    expect(screen.queryByText("Haftalık plan")).not.toBeInTheDocument();
  });

  it("üretilmiş fikirde rozet yok", () => {
    render(<IdeaCard idea={testIdea({ source: "generated" })} />);
    expect(screen.queryByText("Senin fikrin")).not.toBeInTheDocument();
  });
});

describe("IdeaCard plan rozeti", () => {
  it("haftalık plan fikrinde rozet + plana bağlantı (hafta ve sıra)", () => {
    render(
      <IdeaCard
        idea={testIdea({ source: "weekly_plan", weeklyPlan: { planId: "wp_1", weekStart: "2026-09-28", position: 2 } })}
      />,
    );
    expect(screen.getByText("Haftalık plan")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Haftalık planı aç/ });
    expect(link).toHaveAttribute("href", "/bu-hafta?hafta=2026-09-28");
    expect(link).toHaveTextContent("28 Eyl 2026 haftası · 2. içerik");
  });

  it("plana girmeyen fikir 'yedekte' yazar; plan bağı yoksa yalnız rozet", () => {
    const { unmount } = render(<PlanBadge weeklyPlan={{ weekStart: "2026-09-28" }} />);
    expect(screen.getByRole("link")).toHaveTextContent("yedekte");
    expect(screen.getByRole("link")).not.toHaveTextContent(/aday/);
    unmount();
    render(<PlanBadge />);
    expect(screen.getByText("Haftalık plan")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("üretilmiş (plan dışı) fikirde rozet yok", () => {
    render(<IdeaCard idea={testIdea()} />);
    expect(screen.queryByText("Haftalık plan")).not.toBeInTheDocument();
  });
});

describe("IdeaCard ayrıntıları", () => {
  it("açılış cümleleri türleriyle, rakip alıntıları @sahip ve video bağlantısıyla, senaryo ve açıklama taslağı", () => {
    render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);

    const hooks = screen.getByText("Açılış cümlesi önerileri").parentElement as HTMLElement;
    const items = within(hooks).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Cesur iddia")).toBeInTheDocument();
    expect(within(items[1]).getByText("Seslenme")).toBeInTheDocument();
    expect(within(items[2]).getByText("Hikaye girişi")).toBeInTheDocument();

    const quotes = screen.getByText("Rakip alıntıları").parentElement as HTMLElement;
    expect(within(quotes).getByText("“Comment RENEW and I will send you the guide.”")).toBeInTheDocument();
    expect(within(quotes).getByText("@noelle")).toBeInTheDocument();
    // sahibi bilinmeyen alıntı
    expect(within(quotes).getByText("Rakip")).toBeInTheDocument();
    const videoLinks = within(quotes).getAllByRole("link", { name: "Video analizi" });
    expect(videoLinks.map((l) => l.getAttribute("href"))).toEqual(["/video/ci_rival_1", "/video/ci_rival_2"]);

    // Senaryo TEK bölüm: çekim adımları + (farklıysa) söylenecek metin; satır sonları korunur.
    expect(screen.getAllByText(/^Senaryo/)).toHaveLength(1);
    expect(screen.getByText("Söyleyeceğin metin (kendi sesinde)")).toBeInTheDocument();
    const spoken = screen.getByText(/Sabah kahveni yanlış içiyorsun\./);
    expect(spoken).toHaveClass("whitespace-pre-line");
    expect(spoken.textContent).toBe("Sabah kahveni yanlış içiyorsun.\nİşte düzeltmenin yolu.");
    expect(screen.getByRole("button", { name: "Senaryoyu kopyala" })).toBeInTheDocument();
    expect(screen.getByText(/YORUM: RUTİN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Açıklamayı kopyala" })).toBeInTheDocument();
  });

  it("künye: konu, çerçeve, sonunda istenen, hedef süre ve denenmemiş yön", () => {
    render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);
    expect(screen.getByText("Konu: sabah rutini")).toBeInTheDocument();
    expect(screen.getByText("Çerçeve: Pratik")).toBeInTheDocument();
    expect(screen.getByText("Sonunda: yoruma kelime yazma")).toBeInTheDocument();
    expect(screen.getByText("Hedef süre 1:15")).toBeInTheDocument();
    expect(screen.getByText("Bu yönü henüz denemedin")).toBeInTheDocument();
  });

  it("dayandığı videolar çarpan rozeti ve video bağlantısıyla", () => {
    render(<IdeaCard idea={testIdea()} />);
    const evidence = screen.getByText(/Dayandığı videolar/).parentElement as HTMLElement;
    expect(within(evidence).getAllByRole("listitem")).toHaveLength(2);
    expect(within(evidence).getByText("4,2x")).toBeInTheDocument();
    expect(within(evidence).getByText("3,1x")).toBeInTheDocument();
    expect(within(evidence).getAllByRole("link", { name: /Comment RENEW/ })[0]).toHaveAttribute("href", "/video/ci_rival_1");
  });

  it("boş ayrıntı (eski/elle fikir): ek bölümler çizilmez, kart eskisi gibi çalışır", () => {
    render(<IdeaCard idea={testIdea({ details: {} })} />);
    expect(screen.queryByText("Rakip alıntıları")).not.toBeInTheDocument();
    expect(screen.queryByText(/Söyleyeceğin metin/)).not.toBeInTheDocument();
    expect(screen.queryByText("Açıklama taslağı")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bu yönü/)).not.toBeInTheDocument();
    // açılış tarzı rozeti yok, yalnız metin
    const hooks = screen.getByText("Açılış cümlesi önerileri").parentElement as HTMLElement;
    expect(within(hooks).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Senaryo \(3 adım\)/)).toBeInTheDocument();
  });

  it("durum geçiş düğmeleri bozulmadı: new → Kaydet, Script hazır, Ele", () => {
    render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);
    expect(screen.getByRole("button", { name: /Kaydet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Script hazır/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ele/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Yayınlandı/ })).not.toBeInTheDocument();
  });
});

describe("IdeaCard: müşteri ve yönetici görünümü (D2-03, D2-12)", () => {
  it("müşteri görünümünde öncelik puanı ve 'Prompt olarak kopyala' yok; panel jargonu yok", () => {
    const { container } = render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);
    expect(screen.queryByText(/Öncelik puanı/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prompt olarak kopyala" })).not.toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(PANEL_JARGON);
    expect(screen.getByText("Açılış: Cesur iddia")).toBeInTheDocument();
  });

  it("yönetici görünümünde puan adıyla ('Öncelik puanı 3,40') ve prompt düğmesi var", () => {
    render(<IdeaCard idea={testIdea()} operator />);
    expect(screen.getByText(/Öncelik puanı/)).toHaveTextContent("Öncelik puanı 3,40");
    expect(screen.getByRole("button", { name: "Prompt olarak kopyala" })).toBeInTheDocument();
  });

  it("senaryo adımları ve metin aynı sözleri taşıyorsa tek kez yazılır (yinelenen bölüm yok)", () => {
    render(<IdeaCard idea={testIdea({ scriptOutline: ["0-3 sn: Açılış", "3-10 sn: Sorun"], details: { script: "0-3 sn: Açılış 3-10 sn: Sorun" } })} />);
    expect(screen.queryByText("Söyleyeceğin metin (kendi sesinde)")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Sorun/)).toHaveLength(1);
  });

  it("vurgulanan kart: ekrana kaydırılır ve senaryo bölümü açık gelir; diğerinde kapalı", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { unmount } = render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByText(/^Senaryo/).closest("details")).not.toHaveAttribute("open");
    unmount();
    render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} highlighted />);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute("data-slot", "card");
    expect(screen.getByText(/^Senaryo/).closest("details")).toHaveAttribute("open");
  });

  it("dokunma hedefleri dar ekranda ≥ 48 px: durum düğmeleri ve kopyala düğmeleri", () => {
    render(<IdeaCard idea={testIdea({ details: FULL_DETAILS })} />);
    expect(screen.getByRole("button", { name: /Kaydet/ })).toHaveClass("min-h-tap", "md:min-h-0");
    for (const copy of screen.getAllByRole("button", { name: "Açılış cümlesini kopyala" })) expect(copy).toHaveClass("max-md:size-12");
  });
});


describe("IdeaCard: fiş düğmesi", () => {
  it("fişi yoksa 'Fiş hazırla'; fişi varsa 'Fişi aç' bağlantısı", () => {
    const { unmount } = render(<IdeaCard idea={testIdea()} />);
    expect(screen.getByRole("button", { name: "Fiş hazırla" })).toBeInTheDocument();
    unmount();
    render(<IdeaCard idea={testIdea()} orderId="so_1" />);
    expect(screen.getByRole("link", { name: "Fişi aç" })).toHaveAttribute("href", "/fis/so_1");
  });
});
