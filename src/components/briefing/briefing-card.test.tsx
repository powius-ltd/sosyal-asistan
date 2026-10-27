// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { BriefingCard } from "@/components/briefing/briefing-card";
import { BRIEFING_COMMAND_IDS, type Briefing, type BriefingEvidenceRef, type BriefingItem } from "@/lib/domain/briefing";
import { JOB_KIND_BY_COMMAND } from "@/lib/domain/panel-job";
import { JOB_KIND_PLAIN } from "@/lib/plain-language";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const HOUR_MS = 3_600_000;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const ITEMS: BriefingItem[] = [
  {
    kind: "worked",
    headline: "En iyi videon baz çizgisinin üstünde",
    body: "Videon medyan izlenmenin 2,4 katına çıktı. Tek video: ikinci bir örnek bekle.",
    evidence: ["c:ci_1", "c:ci_2"],
    confidence: "low",
  },
  {
    kind: "opportunity",
    headline: "Matriste denemediğin bir hücre var",
    body: "Rakiplerin 6 videosu bu hücrede medyan 3,1 kat aldı.",
    evidence: ["cell:sorunu-biliyor:aci-korku"],
    action: { type: "open_matrix", label: "Hücreyi aç", target: "cell:sorunu-biliyor:aci-korku", spendsMoney: false },
    confidence: "medium",
  },
  {
    kind: "next_step",
    headline: "Bu haftanın planı onay bekliyor",
    body: "3 içerik planlandı.",
    evidence: ["plan:2026-09-28"],
    action: { type: "open_plan", label: "Planı aç", target: "plan:2026-09-28", spendsMoney: false },
    confidence: "high",
  },
  {
    kind: "pending",
    headline: "Bir videonun 7. gün ölçümü geldi",
    body: "Ölçüm koşusu Apify kullanır.",
    evidence: ["due:ci_1:d7"],
    action: { type: "run_cmd", label: "Ölçüm koşusu", commandId: "measure", spendsMoney: true },
    confidence: "medium",
  },
  {
    kind: "changed",
    headline: "Brifing yenileme",
    body: "Ücretsiz bir komut.",
    evidence: ["idea:idea_1"],
    action: { type: "run_cmd", label: "Videoları analiz et", commandId: "analyze", spendsMoney: false },
    confidence: "low",
  },
];

function makeBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: "br_1",
    agent: "analyst",
    generatedAt: iso(-2 * HOUR_MS),
    items: ITEMS,
    basis: { analyzedCount: 24, labeledCount: 20, lastCollectedAt: iso(-5 * HOUR_MS) },
    promptVersion: "v1",
    personaVersion: "persona-v1",
    ...overrides,
  };
}

/** Not satırı (iç içe kanıt `li`'leri değil): `data-kind` yalnız not satırında vardır. */
function itemOf(kind: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`li[data-kind="${kind}"]`);
  if (!el) throw new Error(`not yok: ${kind}`);
  return el;
}

/** Kartın iş düğmeleri (yer tutucu): `data-kind` iş türü, `data-workspace` yedek komutun çalışma alanı. */
const jobButtons = (root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>('[data-slot="job-command"]')];

/** Kartın çalışma alanı (slug parametre olarak gelir; kaynakta hesap adı yok). */
const WORKSPACE = { id: "7a3f0000-0000-4000-8000-000000000002", slug: "ikinci-alan" };

function renderCard(
  briefing: Briefing | null,
  extra: { lastCollectedAt?: string; operator?: boolean; scope?: string; workspace?: { id: string; slug?: string } } = {},
) {
  return render(<BriefingCard briefing={briefing} workspace={WORKSPACE} maskotName="Pusula" now={NOW} {...extra} />);
}

describe("BriefingCard", () => {
  it("kapsam verilirse başlığın altında yazılır (hem notlu hem boş durumda; D3-06)", () => {
    const { unmount } = renderCard(makeBriefing(), { scope: "Tüm hesapların için" });
    expect(screen.getByText("Tüm hesapların için")).toBeInTheDocument();
    unmount();
    renderCard(null, { scope: "@ornek · TikTok için" });
    expect(screen.getByText("@ornek · TikTok için")).toBeInTheDocument();
  });

  it("brifing yoksa boş durum: müşteriye ne komut ne iş düğmesi", () => {
    renderCard(null);
    expect(screen.getByText("Henüz notum yok")).toBeInTheDocument();
    expect(screen.getByText("Pusula diyor ki")).toBeInTheDocument();
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
    expect(jobButtons()).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Notlar" })).not.toBeInTheDocument();
  });

  it("brifing yoksa yönetici modunda 'Notları güncelle' düğmesi görünür (komut metni yok)", () => {
    renderCard(null, { operator: true });
    const button = screen.getByRole("button", { name: "Notları güncelle" });
    expect(button).toHaveAttribute("data-kind", "briefing");
    expect(button).toHaveAttribute("data-workspace", "ikinci-alan");
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
  });

  it("notları çizer: başlık, tek cümle, düz güven ifadesi; next_step ve pending gösterilmez", () => {
    renderCard(makeBriefing(), { lastCollectedAt: iso(-5 * HOUR_MS) });
    expect(screen.getByText("Notlar")).toBeInTheDocument();
    expect(screen.getByText("Pusula diyor ki")).toBeInTheDocument();
    expect(screen.queryByText(/eskidi|yeni veri geldi|güncelleyeceğim/)).not.toBeInTheDocument();

    expect(screen.getByRole("list", { name: "Notlar" })).toBeInTheDocument();
    expect(document.querySelectorAll("li[data-kind]")).toHaveLength(3);
    expect(document.querySelector('li[data-kind="next_step"]')).toBeNull();
    expect(document.querySelector('li[data-kind="pending"]')).toBeNull();
    expect(screen.queryByText("Bu haftanın planı onay bekliyor")).not.toBeInTheDocument();

    const first = itemOf("worked");
    expect(first).toHaveTextContent("Ne tuttu");
    expect(first.querySelector("[data-confidence]")).toHaveAttribute("data-confidence", "low");
    expect(first).toHaveTextContent("az örnek, emin değilim");
    expect(itemOf("opportunity")).toHaveTextContent("kısmen eminim");
    expect(first).not.toHaveTextContent("Düşük güven");
  });

  it("gövdenin ilk cümlesi görünür, kalanı ve kanıt 'Neden?' içindedir (kapalı <details>)", () => {
    renderCard(makeBriefing());
    const first = itemOf("worked");
    const details = first.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(within(first).getByText("Neden?")).toBeInTheDocument();
    // İlk cümle `<details>` dışında, kalanı içinde.
    expect(within(first).getByText("Videon medyan izlenmenin 2,4 katına çıktı.").closest("details")).toBeNull();
    expect(within(first).getByText("Tek video: ikinci bir örnek bekle.").closest("details")).toBe(details);
    expect(details.contains(within(first).getByRole("list", { name: "Kanıt" }))).toBe(true);
  });

  it("kanıt bağlantıları '1. video' biçiminde ve ≥ 44 px dokunma alanında", () => {
    renderCard(makeBriefing());
    const first = itemOf("worked");
    const links = within(first).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["1. video", "2. video"]);
    expect(links[0]).toHaveAttribute("href", "/video/ci_1");
    for (const link of links) expect(link.className).toContain("min-h-11");

    const opportunity = itemOf("opportunity");
    expect(within(opportunity).getByRole("link", { name: "yaklaşım + izleyici" }).getAttribute("href")).toContain("/anatomi");
    const open = within(opportunity).getByRole("link", { name: /Hücreyi aç/ });
    expect(open.getAttribute("href")).toContain("/anatomi");
    expect(open.className).toContain("min-h-11");
  });

  it("en çok 3 not gösterir", () => {
    const many = Array.from({ length: 5 }, (_, i): BriefingItem => ({ ...ITEMS[0], headline: `Not ${i + 1}` }));
    renderCard(makeBriefing({ items: many }));
    expect(document.querySelectorAll("li[data-kind]")).toHaveLength(3);
    expect(screen.queryByText("Not 4")).not.toBeInTheDocument();
  });

  it("yalnız next_step/pending varsa not yok der", () => {
    renderCard(makeBriefing({ items: [ITEMS[2], ITEMS[3]] }));
    expect(screen.getByText("Bugün için ayrı bir notum yok.")).toBeInTheDocument();
  });

  it("müşteriye komut, iş düğmesi, Apify ve iç sayım göstermez", () => {
    renderCard(makeBriefing());
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Para harcar|Apify/)).not.toBeInTheDocument();
    expect(screen.queryByText(/analiz,|etiket/)).not.toBeInTheDocument();
    expect(jobButtons()).toHaveLength(0);
    expect(document.querySelector('[data-slot="briefing-footer"]')).toBeNull();
  });

  it("yönetici modunda madde eylemi ve altbilgi iş düğmesidir: komut metni yok, dayanak küçük ve ikincil", () => {
    renderCard(makeBriefing(), { operator: true });
    const free = itemOf("changed");
    expect(within(free).getByRole("button", { name: "Videoları incele" })).toHaveAttribute("data-kind", "analyze");
    expect(within(free).queryByText(/Para harcar/)).not.toBeInTheDocument();
    const footer = document.querySelector<HTMLElement>('[data-slot="briefing-footer"]')!;
    expect(footer).toHaveTextContent("2 saat önce üretildi");
    expect(footer).toHaveTextContent("dayandığı veri: 24 analiz, 20 etiket");
    expect(within(footer).getByRole("button", { name: "Notları güncelle" })).toHaveAttribute("data-kind", "briefing");
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
    // İş düğmeleri kartın çalışma alanını taşır (işler kapalıyken yedek komut onunla kurulur).
    for (const button of jobButtons()) expect(button).toHaveAttribute("data-workspace", "ikinci-alan");
  });

  it.each(BRIEFING_COMMAND_IDS)("komut eylemi (%s) aynı işi başlatan düğmeye çevrilir; düğme adı sözlükten", (commandId) => {
    const item: BriefingItem = { ...ITEMS[0], action: { type: "run_cmd", label: "Eski etiket", commandId, spendsMoney: false } };
    renderCard(makeBriefing({ items: [item] }), { operator: true });
    const kind = JOB_KIND_BY_COMMAND[commandId];
    const [button] = jobButtons(itemOf("worked"));
    expect(button).toHaveAttribute("data-kind", kind);
    expect(button).toHaveTextContent(JOB_KIND_PLAIN[kind].label);
  });

  it("yönetici modunda para harcayan işin yedeği açıkça etiketlenir (tablodaki değer esastır)", () => {
    const paid: BriefingItem = {
      ...ITEMS[0],
      // Satırdaki `spendsMoney` yanlış olsa da etiket komut tablosundan gelir.
      action: { type: "run_cmd", label: "Ölçüm koşusu", commandId: "measure", spendsMoney: false },
    };
    renderCard(makeBriefing({ items: [paid] }), { operator: true });
    const li = itemOf("worked");
    expect(within(li).getByRole("button", { name: "Sonuçları ölç" })).toHaveAttribute("data-kind", "measure");
    expect(li.querySelector('[data-slot="job-command-fallback"]')).toHaveTextContent("Ölçüm koşusu:Para harcar (Apify)");
  });

  it("iş düğmesi kartın çalışma alanını taşır; slug yoksa tam kimlik", () => {
    const paid: BriefingItem = { ...ITEMS[0], action: { type: "run_cmd", label: "Veriyi topla", commandId: "collect", spendsMoney: true } };
    renderCard(makeBriefing({ items: [paid] }), { operator: true, workspace: { id: WORKSPACE.id } });
    const buttons = jobButtons();
    expect(buttons.map((button) => button.getAttribute("data-kind"))).toEqual(["collect", "briefing"]);
    for (const button of buttons) expect(button).toHaveAttribute("data-workspace", WORKSPACE.id);
  });

  it("yeni veri toplandıysa bayat rozeti düz dille görünür", () => {
    renderCard(makeBriefing(), { lastCollectedAt: iso(-1 * HOUR_MS) });
    expect(screen.getByText("Bundan sonra yeni veri geldi; notlarımı güncelleyeceğim")).toBeInTheDocument();
    expect(screen.queryByText(/Bayat/)).not.toBeInTheDocument();
  });

  it("8 günden eski brifing bayat rozetiyle görünür", () => {
    renderCard(makeBriefing({ generatedAt: iso(-9 * 24 * HOUR_MS) }));
    expect(screen.getByText("Notlarım 8 günden eski; güncelleyeceğim")).toBeInTheDocument();
  });

  it("bilinmeyen ref ve eylem hedefinde çökmez, yalnız o bağlantıyı atlar", () => {
    const item: BriefingItem = {
      kind: "worked",
      headline: "Bozuk kanıtlı madde",
      body: "Gövde yine görünür.",
      evidence: ["c:geçersiz kimlik", "plan:2026-09-29", "zzz:1", "c:ci_9"] as BriefingEvidenceRef[],
      action: { type: "open_plan", label: "Hedefsiz plan", target: "plan:bozuk", spendsMoney: false },
      confidence: "medium",
    };
    renderCard(makeBriefing({ items: [item] }));
    const li = itemOf("worked");
    expect(li).toHaveTextContent("Gövde yine görünür.");
    // Geçersiz ref atlanır; plan:2026-09-29 Pazartesi değil → atlanır; yalnız c:ci_9 kalır.
    expect(within(li).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/video/ci_9"]);
    expect(screen.queryByText("Hedefsiz plan")).not.toBeInTheDocument();
  });

  it("yönetici modunda bozuk komut eylemi çizilmez", () => {
    const cmdWithoutId: BriefingItem = {
      ...ITEMS[0],
      action: { type: "run_cmd", label: "Bozuk komut", spendsMoney: true },
    };
    renderCard(makeBriefing({ items: [cmdWithoutId] }), { operator: true });
    expect(jobButtons(itemOf("worked"))).toHaveLength(0);
    expect(screen.queryByText("Bozuk komut:")).not.toBeInTheDocument();
    expect(screen.queryByText(/Para harcar/)).not.toBeInTheDocument();
  });

  it("yönetici altbilgisinde bilinmeyen dayanak sıfır gibi gösterilmez", () => {
    renderCard(makeBriefing({ generatedAt: "bozuk-zaman", basis: { analyzedCount: 0, labeledCount: 0 } }), { operator: true });
    const footer = screen.getByText(/dayandığı veri/).closest("p")!;
    expect(footer).toHaveTextContent("Üretim zamanı okunamadı");
    // Gerçek sıfır sayı sıfırdır; bilinmeyen toplama anı tarih değil "kaydı yok" olarak yazılır.
    expect(footer).toHaveTextContent("0 analiz, 0 etiket, son toplama kaydı yok");
    // Okunamayan zaman bayat sayılır ama kart yine çizilir.
    expect(screen.getByText("Notlarım 8 günden eski; güncelleyeceğim")).toBeInTheDocument();
  });
});
