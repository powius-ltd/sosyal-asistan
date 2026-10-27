// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { anatomyPageCopy } from "@/components/matrix/matrix-copy";
import { MatrixSections } from "@/components/matrix/matrix-sections";
import { TopicHookMatrixSection } from "@/components/matrix/topic-hook-matrix-section";
import { TooltipProvider } from "@/components/ui/tooltip";
import { matrixKindsOf } from "@/lib/domain/account-type";
import { emptyCellStat, type CreativeCellStat, type CreativeMatrixSample } from "@/lib/domain/creative-matrix";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import {
  TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
  emptyTopicHookCell,
  emptyTopicHookMatrix,
  topicCellStatusOf,
  type TopicHookCell,
  type TopicHookMatrix,
  type TopicHookRow,
} from "@/lib/domain/topic-hook-matrix";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixInput } from "@/lib/matrix/test-fixtures";

const SCOPE = { workspaceId: "w", days: 90, since: "2026-07-01T00:00:00.000Z", until: "2026-09-30T00:00:00.000Z" };
const GENERATED_AT = SCOPE.until;

const stat = (n: number, lift: number | undefined, outliers = 0): CreativeCellStat => ({
  ...emptyCellStat(),
  n,
  liftN: lift === undefined ? 0 : n,
  medianLift: lift,
  outlierCount: outliers,
  confidence: n >= 5 ? "medium" : "low",
});

const sample = (id: string, isOwn: boolean, lift: number): CreativeMatrixSample => ({
  contentItemId: id,
  ownerHandle: isOwn ? "ben" : "rakip1",
  platform: "instagram",
  format: "short_video",
  caption: `Alt yazı ${id}`,
  currentLift: lift,
  hookType: "question",
  isOwn,
});

function cell(clusterKey: string, hookType: string, own: CreativeCellStat, rivals: CreativeCellStat, samples: CreativeMatrixSample[]): TopicHookCell {
  return { clusterKey, hookType, own, rivals, ownTried: own.n > 0, status: topicCellStatusOf({ own, rivals }), samples };
}

/** İki satır (sabah rutini, uyku ve enerji) × yalnız iki hook türünde video: biri tutan, biri fırsat, biri zayıf. */
function fixture(withRivals: boolean): TopicHookMatrix {
  const rivalStat = withRivals ? stat(4, 3, 2) : emptyCellStat();
  const worked = cell("sabah_rutini", "question", stat(3, 2.4, 1), emptyCellStat(), [sample("own-1", true, 3.1), sample("own-2", true, 2.4)]);
  const opportunity = cell("sabah_rutini", "list", emptyCellStat(), rivalStat, withRivals ? [sample("riv-1", false, 3)] : []);
  const weak = cell("uyku_ve_enerji", "question", stat(1, 0.8), emptyCellStat(), [sample("own-3", true, 0.8)]);
  const row = (key: string, label: string, special: TopicHookCell[]): TopicHookRow => ({
    key,
    label,
    own: stat(special.reduce((sum, c) => sum + c.own.n, 0), 1.5),
    rivals: withRivals && key === "sabah_rutini" ? rivalStat : emptyCellStat(),
    cells: HOOK_TYPES.map((hook) => special.find((c) => c.hookType === hook) ?? emptyTopicHookCell(key, hook)),
  });
  const rows = [row("sabah_rutini", "Sabah rutini", [worked, opportunity]), row("uyku_ve_enerji", "Uyku ve enerji", [weak])];
  return {
    schemaVersion: TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
    generatedAt: GENERATED_AT,
    scope: SCOPE,
    hookTypes: [...HOOK_TYPES],
    rows,
    clusteredCount: 4,
    unclusteredCount: 2,
    opportunities: withRivals ? [opportunity] : [],
    winners: [worked],
  };
}

const renderTopic = (matrix: TopicHookMatrix, selected?: { clusterKey: string; hookType: string }) =>
  render(
    <TooltipProvider>
      <TopicHookMatrixSection matrix={matrix} selected={selected} />
    </TooltipProvider>,
  );

describe("TopicHookMatrixSection", () => {
  it("satır = konu, sütun = açılış tarzı (videosuz sütunlar gizli); durum metni, tutanlar ve fırsatlar listesi, kutu bağlantısı", () => {
    const { container } = renderTopic(fixture(true));

    expect(screen.getByRole("heading", { name: "Konu ve açılış haritası" })).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelectorAll("thead th[scope='col']")).toHaveLength(1 + 2); // köşe + Soru + Liste
    expect(container.textContent).toContain("Videosu olmayan 11 açılış tarzı sütunu gizlendi");
    expect(container.querySelectorAll("[data-status='worked']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-status='proven_opportunity']")).toHaveLength(1);
    expect(container.querySelectorAll("[data-status='weak']")).toHaveLength(1);
    // Renge ek olarak metin: durum etiketleri kutuda yazılı.
    expect(screen.getAllByText("Sende tuttu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rakipte tutuyor").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/hook|CTA|matris|hücre|lift|kademe|medyan|baz çizgisi/i);
    // 4 kutu + 1 tutan satırı + 1 fırsat satırı
    expect(container.querySelectorAll("a[href^='/anatomi?konu=']")).toHaveLength(4 + 1 + 1);
    expect(container.querySelector("a[href^='/anatomi?konu=sabah_rutini:list']")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "En iyi videoların" })).toBeTruthy();
    expect(within(screen.getByTestId("topic-winners")).getByText(/Sabah rutini · açılış: Soru: 3 videon, tipik video normalinin 2,4 katı izlendi, 1 tanesi tutan/)).toBeTruthy();
    expect(within(screen.getByTestId("topic-winners")).getByText("Alt yazı own-1")).toBeTruthy(); // en iyi kendi videosu
    expect(within(screen.getByTestId("topic-opportunities")).getByText(/Sabah rutini · açılış: Liste: rakiplerde 4 video, tipik video normalinin 3,0 katı izlendi, 2 tanesi tutan, sen denemedin/)).toBeTruthy();
    expect(screen.getByTestId("topic-counters").textContent).toContain("4 video bir konuya girdi");
    expect(container.textContent).not.toContain("0,0x"); // ölçülemeyen/boş değer 0 olarak yazılmaz
  });

  it("rakip yokken rakip tarafı çizilmez; fırsat boşluğu sebebiyle söylenir, kendi tutanların öne çıkar", () => {
    const { container } = renderTopic(fixture(false));
    expect([...container.querySelectorAll("dt")].map((dt) => dt.textContent)).not.toContain("Rakip");
    expect(container.querySelector("tbody th")?.textContent).not.toContain("rakip");
    expect(container.textContent).not.toContain("rakip = izlenen rakipler");
    expect(container.textContent).toContain("İzlenen rakip videosu yok");
    expect(screen.getByTestId("topic-winners")).toBeTruthy();
    expect(container.querySelector("[data-testid='topic-opportunities']")).toBeNull();
  });

  it("seçili kutu (?konu=) örnek videolarını bağlantıyla gösterir; haritada olmayan konu seçimsiz sayılır ve tek cümleyle söylenir", () => {
    const { container, unmount } = renderTopic(fixture(true), { clusterKey: "sabah_rutini", hookType: "question" });
    const detail = within(screen.getByTestId("topic-cell-detail"));
    expect(detail.getByText("Sabah rutini · açılış: Soru")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='topic-cell-detail'] a[href^='/video/']")).toHaveLength(2);
    expect(container.querySelector("[data-selected]")?.getAttribute("data-status")).toBe("worked");
    unmount();

    const missing = render(
      <TooltipProvider>
        <TopicHookMatrixSection matrix={fixture(true)} requested />
      </TooltipProvider>,
    );
    expect(missing.container.querySelector("[data-testid='topic-cell-detail']")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Bu konu ve açılış kutusu haritada yok");
  });

  it("küme yokken tablo yerine boş durum + 'Planı hazırla' iş düğmesi (komut metni yok); küme varken düğme çizilmez", () => {
    const { container, unmount } = renderTopic(emptyTopicHookMatrix(SCOPE, GENERATED_AT));
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Konu grupları henüz yok");
    expect(container.textContent).toContain("Konu grupları plan hazırlanırken oluşur.");
    expect(container.textContent).not.toContain("npm run");
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toHaveAttribute("data-kind", "plan");
    unmount();

    renderTopic(fixture(true));
    expect(screen.queryByRole("button", { name: "Planı hazırla" })).not.toBeInTheDocument();
  });
});

describe("MatrixSections: matris hesap türünün listesinden seçilir", () => {
  const angle = buildCreativeMatrix(matrixInput([]));
  const topic = fixture(true);
  const render3 = (type: Parameters<typeof matrixKindsOf>[0]) =>
    render(
      <TooltipProvider>
        <MatrixSections kinds={matrixKindsOf(type)} angle={angle} topic={topic} />
      </TooltipProvider>,
    );

  it("business → yalnız yaklaşım haritası; creator → yalnız konu haritası; mixed → ikisi (yaklaşım önce)", () => {
    const business = render3("business");
    expect(business.container.querySelector("#creative-matrix-title")).toBeTruthy();
    expect(business.container.querySelector("#topic-matrix-title")).toBeNull();
    business.unmount();

    const creator = render3("creator");
    expect(creator.container.querySelector("#creative-matrix-title")).toBeNull();
    expect(creator.container.querySelector("#topic-matrix-title")).toBeTruthy();
    creator.unmount();

    const mixed = render3("mixed");
    const headings = [...mixed.container.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(headings).toEqual(["Yaklaşım haritası", "Konu ve açılış haritası"]);
  });

  it("boş matrisin iş düğmesi hesap türünü izler: işletme → açıları etiketle; içerik üreticisi → planı hazırla; karma → ikisi", () => {
    const emptyTopic = emptyTopicHookMatrix(SCOPE, GENERATED_AT);
    const jobsOf = (type: Parameters<typeof matrixKindsOf>[0]) => {
      const view = render(
        <TooltipProvider>
          <MatrixSections kinds={matrixKindsOf(type)} angle={angle} topic={emptyTopic} />
        </TooltipProvider>,
      );
      const kinds = [...view.container.querySelectorAll('[data-slot="job-command"]')].map((button) => button.getAttribute("data-kind"));
      view.unmount();
      return kinds;
    };
    expect(jobsOf("business")).toEqual(["label"]);
    expect(jobsOf("creator")).toEqual(["plan"]);
    expect(jobsOf("mixed")).toEqual(["label", "plan"]);
  });
});

describe("anatomyPageCopy: başlık matris listesine göre", () => {
  it("başlık her türde sekme adıyla aynı (\"Kreatif anatomisi\"); açıklama haritaların düz dil cümlelerini sıralar", () => {
    for (const type of ["creator", "business", "mixed"] as const) expect(anatomyPageCopy(matrixKindsOf(type)).title).toBe("Kreatif anatomisi");
    expect(anatomyPageCopy(matrixKindsOf("creator")).description).toContain("Hangi konuda hangi açılış tarzı tutuyor");
    expect(anatomyPageCopy(matrixKindsOf("business")).description).toContain("Hangi yaklaşım hangi izleyicide tutuyor");
    expect(anatomyPageCopy(matrixKindsOf("mixed")).description).not.toMatch(/hook|CTA|matris|hücre|lift|kademe|medyan|farkındalık/i);
  });

  it("hesap türünde olmayan haritaya işaret eden adres sessizce yok sayılmaz", () => {
    const view = render(
      <TooltipProvider>
        <MatrixSections kinds={matrixKindsOf("business")} angle={buildCreativeMatrix(matrixInput([]))} topic={undefined} topicRequested />
      </TooltipProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Bu hesap türünde konu haritası yok");
    view.unmount();
  });
});
