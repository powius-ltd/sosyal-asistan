// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/publish", () => ({
  submitPublishJob: vi.fn(),
  approvePublishJob: vi.fn(),
  cancelPublishJob: vi.fn(),
  createPublishJob: vi.fn(),
}));

import { ComplianceDot, JobFlagBadges } from "@/components/publish/job-badges";
import { PublishJobCard } from "@/components/publish/job-card";
import { buildJobViews } from "@/components/publish/job-views";
import { TooltipProvider } from "@/components/ui/tooltip";
import { checkCompliance } from "@/lib/compliance";
import type { PublishJob } from "@/lib/domain/publish";

const plain = { paidPartnership: false, aiGenerated: false, advertiserName: undefined, trial: undefined };

describe("JobFlagBadges", () => {
  it("işaret yoksa hiçbir rozet çizmez", () => {
    const { container } = render(<JobFlagBadges job={plain} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Ücretli iş birliği, YZ ve deneme yayını (elle açılır / otomatik açılır) rozetleri", () => {
    const { rerender } = render(
      <JobFlagBadges job={{ ...plain, paidPartnership: true, aiGenerated: true, advertiserName: "Notion Türkiye", trial: { enabled: true, graduation: "manual" } }} />,
    );
    expect(screen.getByText("Ücretli iş birliği")).toHaveAttribute("title", "Reklam veren: Notion Türkiye");
    expect(screen.getByText("YZ")).toBeInTheDocument();
    expect(screen.getByText("Deneme yayını (elle açılır)")).toBeInTheDocument();

    rerender(<JobFlagBadges job={{ ...plain, trial: { enabled: true, graduation: "performance" } }} />);
    expect(screen.getByText("Deneme yayını (otomatik açılır)")).toBeInTheDocument();
    expect(screen.queryByText("YZ")).not.toBeInTheDocument();
  });

  it("kapalı deneme yayını (enabled=false) rozet üretmez", () => {
    const { container } = render(<JobFlagBadges job={{ ...plain, trial: { enabled: false, graduation: "manual" } }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/** Noktayı (aria-hidden `span`) durum metnini saran öğenin içinden bulur. */
const dotOf = (status: HTMLElement) => status.querySelector<HTMLElement>('[aria-hidden="true"]');

describe("ComplianceDot", () => {
  const renderDot = (result: ReturnType<typeof checkCompliance>) =>
    render(
      <TooltipProvider>
        <ComplianceDot result={result} />
      </TooltipProvider>,
    );

  it("ok / warn / fail durumunu nokta + kısa metinle gösterir; ilk bulgu ipucunda (erişilebilir ad)", () => {
    const fail = checkCompliance({ caption: "Merhaba", isPaidPartnership: true, isAiGenerated: true, region: "TR" });
    const { unmount } = renderDot(fail);
    expect(screen.getByText("Onaylanamaz")).toBeInTheDocument();
    const trigger = screen.getByLabelText(/^Uyum denetimi: Onaylanamaz\./);
    expect(trigger).toHaveTextContent("Onaylanamaz");
    expect(trigger.getAttribute("aria-label")).toContain(fail.findings[0]?.message);
    expect(trigger.getAttribute("aria-label")).toContain("(+2 bulgu daha)");
    expect(dotOf(trigger)).toHaveClass("bg-destructive");
    unmount();

    const warn = checkCompliance({ caption: "Reklam · kahve", isPaidPartnership: true, isAiGenerated: false, region: "TR" });
    const second = renderDot(warn);
    expect(dotOf(screen.getByText("Dikkat"))).toHaveClass("bg-warning-solid");
    expect(screen.getByLabelText(/^Uyum denetimi: Dikkat\./).getAttribute("aria-label")).not.toContain("bulgu daha");
    second.unmount();

    renderDot({ status: "ok", findings: [] });
    expect(dotOf(screen.getByText("Uyumlu"))).toHaveClass("bg-success-solid");
    expect(screen.getByLabelText("Uyum denetimi: Uyumlu. Bu bölgenin kurallarına göre bulgu yok.")).toBeInTheDocument();
  });
});

describe("PublishJobCard", () => {
  const job: PublishJob = {
    id: "pj_1",
    workspaceId: "ws_1",
    socialAccountId: "oa_1",
    platform: "instagram",
    status: "draft",
    caption: "Harika ürün",
    shareToFeed: true,
    paidPartnership: true,
    aiGenerated: true,
    advertiserName: "Notion Türkiye",
    trial: { enabled: true, graduation: "performance" },
    attemptCount: 0,
    createdAt: "2026-09-30T09:00:00.000Z",
    updatedAt: "2026-09-30T09:00:00.000Z",
  };

  it("kartta rozetler ve uyum noktası görünür; TR'de fail olan taslağın 'Onaya gönder' düğmesi devre dışı", () => {
    const [view] = buildJobViews([job], [{ id: "oa_1", handle: "bahcekafe.ist" }], [], "TR");
    render(
      <TooltipProvider>
        <ul>
          <PublishJobCard view={view!} timeZone="Europe/Istanbul" />
        </ul>
      </TooltipProvider>,
    );
    expect(screen.getByText("Ücretli iş birliği")).toBeInTheDocument();
    expect(screen.getByText("YZ")).toBeInTheDocument();
    expect(screen.getByText("Deneme yayını (otomatik açılır)")).toBeInTheDocument();
    expect(screen.getByText("Onaylanamaz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeDisabled();
  });

  it("uyumlu iş: yeşil nokta 'Uyumlu'; işaretsiz işte rozet yok", () => {
    const clean = { ...job, paidPartnership: false, aiGenerated: false, advertiserName: undefined, trial: undefined };
    const [view] = buildJobViews([clean], [{ id: "oa_1", handle: "bahcekafe.ist" }], [], "TR");
    render(
      <TooltipProvider>
        <ul>
          <PublishJobCard view={view!} timeZone="Europe/Istanbul" />
        </ul>
      </TooltipProvider>,
    );
    expect(screen.getByText("Uyumlu")).toBeInTheDocument();
    expect(screen.queryByText("Ücretli iş birliği")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Deneme yayını/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeEnabled();
  });
});
