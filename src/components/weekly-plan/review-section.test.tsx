// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { MeasurementDueStrip } from "@/components/weekly-plan/measurement-due-strip";
import { ReviewSectionView, type WeekReviewRead } from "@/components/weekly-plan/review-section";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Checkpoint, MeasurementDue, WeekReview } from "@/lib/domain/outcomes";

const window = { windowStart: "2026-09-30T00:00:00.000Z", windowEnd: "2026-10-07T00:00:00.000Z" };
const cp = (day: Checkpoint["day"], patch: Partial<Checkpoint> = {}): Checkpoint => ({ day, status: "measured", ...window, ...patch });

const review: WeekReview = {
  planId: "p1",
  weekStart: "2026-09-28",
  planGeneratedAt: "2026-09-27T10:00:00.000Z",
  computedAt: "2026-10-08T10:00:00.000Z",
  items: [
    {
      ideaId: "i1",
      title: "İlk fikir",
      position: 1,
      suggestionCount: 0,
      link: {
        linkId: "l1",
        status: "confirmed",
        origin: "manual_url",
        shortcode: "ABC",
        contentItemId: "c1",
        content: { contentItemId: "c1", ownerHandle: "ornek", platform: "instagram", format: "short_video", currentLift: 1.8 },
      },
      publishedAt: "2026-09-30T00:00:00.000Z",
      checkpoints: [
        cp(1, { views: 1200, viewsPerFollower: 0.12 }),
        cp(3, { status: "missed", reason: "3. gün ölçümü zamanında alınmadı." }),
        cp(7, { views: 9000, viewsPerFollower: 0.9, lift: 1.8, liftTier: 1 }),
      ],
      directions: [
        { group: "duration_bucket", value: "30_60", label: "30–60 sn", verdict: "held", strong: true },
        { group: "cta_type", value: "dm", label: "DM'e çağrı", verdict: "unmeasured", reason: "Yayın bu yöne uymadı." },
      ],
    },
    { ideaId: "i2", title: "İkinci fikir", position: 2, suggestionCount: 1, checkpoints: [], directions: [] },
  ],
  directions: [],
  summary: { planned: 2, linked: 1, measuredD7: 1, held: 1, missed: 0, unmeasured: 1 },
};

const renderReview = (read: WeekReviewRead) =>
  render(
    <TooltipProvider>
      <ReviewSectionView review={read} />
    </TooltipProvider>,
  );

describe("ReviewSectionView", () => {
  it("tablo: bağ durumu, ölçülen hücre, kaçırılan nokta '—' + sebep (0 değil), 7. gün durumu ve yön hükmü", () => {
    renderReview({ available: true, value: review });
    const rows = screen.getAllByRole("row");
    const first = within(rows[1]);
    expect(first.getByText("Yayınlandı")).toBeInTheDocument();
    expect(first.getByText("1,8x")).toBeInTheDocument(); // yalnız 7. günde lift
    expect(first.getByLabelText("Ölçülemedi: 3. gün ölçümü zamanında alınmadı.")).toHaveTextContent("—");
    expect(first.getByText("Güçlü tuttu")).toBeInTheDocument();
    expect(first.getByText("Ölçülemedi")).toBeInTheDocument(); // uymayan yön: hüküm yok
    expect(screen.getByText(/1 tuttu, 0 tutmadı, 1 ölçülemedi/)).toBeInTheDocument();
  });

  it("bağı olmayan öğe: 'yayınlandı mı bilinmiyor', öneri sayısı ve fikir kartına bağlantı; hücreler ve hüküm ölçülemedi", () => {
    renderReview({ available: true, value: review });
    const second = within(screen.getAllByRole("row")[2]);
    expect(second.getByText("Bağlantı yok (yayınlandı mı bilinmiyor)")).toBeInTheDocument();
    expect(second.getByText("1 eşleşme önerisi onay bekliyor")).toBeInTheDocument();
    // Platform adı modülden: platform verilmediğinde tarafsız "video" (D2-04).
    expect(second.getByRole("link", { name: "Fikir kartında video bağla" })).toHaveAttribute("href", "/fikirler?id=i2");
    expect(second.getAllByLabelText(/^Ölçülemedi: /).length).toBeGreaterThanOrEqual(4); // 3 nokta + 7. gün durumu
    // Bağ / 7. gün ölçümü yokken hüküm "Bu yayın uymadı" değil tire + "Henüz ölçülmedi".
    expect(second.getByText("Henüz ölçülmedi")).toBeInTheDocument();
    expect(second.queryByText(/plan yönlerinden birine uymadı/)).not.toBeInTheDocument();
  });

  it("platform Instagram ise bağlama bağlantısı 'Reels' der; TikTok ise 'video'", () => {
    const { unmount } = render(
      <TooltipProvider>
        <ReviewSectionView review={{ available: true, value: review }} platform="instagram" />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("link", { name: "Fikir kartında Reels bağla" }).length).toBeGreaterThan(0);
    unmount();
    render(
      <TooltipProvider>
        <ReviewSectionView review={{ available: true, value: review }} platform="tiktok" />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("link", { name: /Reels/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Fikir kartında video bağla" }).length).toBeGreaterThan(0);
  });

  it("dar ekran: tablonun yanında kart listesi (aynı hücreler, yatay kaydırma yok); tablo yalnız md+", () => {
    const { container } = renderReview({ available: true, value: review });
    const cards = [...screen.getByRole("list", { name: "Geçen haftanın içerikleri" }).children];
    expect(cards).toHaveLength(2);
    expect(container.querySelector("ul[aria-label='Geçen haftanın içerikleri']")).toHaveClass("md:hidden");
    expect(screen.getByRole("table").closest("div.hidden")).toHaveClass("md:block");
    expect(cards[0]).toHaveTextContent("Güçlü tuttu");
    expect(cards[1]).toHaveTextContent("Henüz ölçülmedi");
  });

  it("plan yok → sebep; depo desteklemiyor → 'henüz okunamıyor'", () => {
    const { unmount } = renderReview({ available: true, value: null });
    expect(screen.getByText(/Geçen hafta için kayıtlı plan yok/)).toBeInTheDocument();
    unmount();
    renderReview({ available: false, value: undefined });
    expect(screen.getByText("Geçen hafta sonucu bu veri kaynağında henüz okunamıyor.")).toBeInTheDocument();
  });
});

describe("MeasurementDueStrip", () => {
  const due = (n: number): MeasurementDue[] =>
    Array.from({ length: n }, (_, i) => ({ contentItemId: `c${i}`, ownerHandle: "ornek", publishedAt: "2026-09-30T00:00:00.000Z", day: 1, ...window }));

  it("ölçülecek yayın yoksa çizilmez; varsa sayı ve 'Sonuçları ölç' iş düğmesi görünür (komut metni yok), fazlası '+ N' ile anılır", () => {
    const { container, unmount } = render(<MeasurementDueStrip due={[]} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(
      <TooltipProvider>
        <MeasurementDueStrip due={due(6)} />
      </TooltipProvider>,
    );
    expect(screen.getByText(/6 yayının ölçümü geldi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sonuçları ölç" })).toHaveAttribute("data-kind", "measure");
    // Görünen metinde komut ve terminal yönlendirmesi yok (yedek, yalnız işler kapalıyken yönetici modunda çizilir).
    expect(screen.getByRole("region", { name: "Ölçüm zamanı geldi" })).not.toHaveTextContent(/npm run/);
    expect(screen.getByText(/terminalde/)).not.toBeVisible();
    expect(screen.getByText("+ 2 yayın daha")).toBeInTheDocument();
  });
});
