// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ current: { available: true } as { available: true } | { available: false; reason: string } }));
vi.mock("@/lib/job-control/availability", () => ({ jobsAvailability: () => availability.current }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), kickWorkerAction: vi.fn(), requestRoutineForAllAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { JobAction, type JobActionProps } from "@/components/jobs/job-action";
import { RunJobButton, type RunJobButtonProps } from "@/components/jobs/run-job-button";
import { JobCommand, jobCommandText, type JobCommandProps } from "@/components/workspace/job-command";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const mode = (operator: boolean) => vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
const closeJobs = () => (availability.current = { available: false, reason: "data_source" });

/**
 * Sunucu ağacını elle çözer (jsdom async sunucu bileşeni çizemez): `JobCommand` → `JobAction` (kapı) → düğme ya da yedek (async).
 * Dönen: işler açıksa `RunJobButton` öğesi; kapalıysa yedeğin çizilebilir çıktısı (yönetici değilse / yedek yoksa null).
 */
async function resolve(props: JobCommandProps): Promise<ReactNode> {
  const action = JobCommand(props) as ReactElement<JobActionProps>;
  expect(action.type).toBe(JobAction);
  const drawn = await JobAction(action.props);
  if (!isValidElement(drawn) || drawn.type === RunJobButton) return drawn;
  return (drawn.type as (props: unknown) => Promise<ReactNode>)(drawn.props);
}

beforeEach(() => {
  availability.current = { available: true };
  mode(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("JobCommand (komut metni → iş düğmesi)", () => {
  it("işler açıkken düğme çizilir; komut metni hiç çizilmez", async () => {
    const drawn = (await resolve({ request: { kind: "plan", week: "2026-10-12" }, label: "Planı hazırla", variant: "default", size: "sm", lead: "yenilemek için" })) as ReactElement<RunJobButtonProps>;
    expect(drawn.type).toBe(RunJobButton);
    expect(drawn.props).toMatchObject({ request: { kind: "plan", week: "2026-10-12" }, label: "Planı hazırla", variant: "default", size: "sm" });
    // Yedeğe ait alanlar düğmeye sızmaz.
    for (const key of ["fallback", "lead", "flags", "note", "workspace", "command"]) expect(drawn.props).not.toHaveProperty(key);
  });

  it("işler kapalı + yönetici: komut metni yedek olarak görünür; çalışma alanını HER ZAMAN taşır (verilmezse istekteki kimlik)", async () => {
    closeJobs();
    render(<>{await resolve({ request: { kind: "measure" } })}</>);
    const command = `npm run measure:now -- --workspace=${MOCK_WORKSPACE_ID}`;
    expect(screen.getByText(command)).toBeInTheDocument();
    expect(screen.getByText("Yönetici:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Komutu kopyala: ${command}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sonuçları ölç" })).not.toBeInTheDocument();
  });

  it("yedek komut: çağıranın çalışma alanı (slug), önündeki metin, isteğin ve çağıranın bayrakları, altındaki not", async () => {
    closeJobs();
    render(
      <>
        {await resolve({
          request: { kind: "routine", dryRun: true },
          workspace: { id: "ws-1", slug: "kahve-dukkani" },
          lead: "Terminalde:",
          flags: "--apify-max=0.5",
          note: <span>Para harcar</span>,
        })}
      </>,
    );
    expect(screen.getByText("npm run rutin -- --workspace=kahve-dukkani --dry-run --apify-max=0.5")).toBeInTheDocument();
    expect(screen.getByText("Terminalde:")).toBeInTheDocument();
    expect(screen.getByText("Para harcar")).toBeInTheDocument();
  });

  it("müşteri görünümü: ne düğme ne komut (işler açık olsa da kapalı olsa da)", async () => {
    mode(false);
    expect(await resolve({ request: { kind: "plan" }, note: <span>not</span> })).toBeNull();
    closeJobs();
    expect(await resolve({ request: { kind: "plan" } })).toBeNull();
  });

  it("command={false}: işler kapalıyken yönetici modunda da hiçbir şey çizilmez; işler açıkken düğme yine çizilir", async () => {
    expect(((await resolve({ request: { kind: "collect" }, command: false })) as ReactElement).type).toBe(RunJobButton);
    closeJobs();
    expect(await resolve({ request: { kind: "collect" }, command: false })).toBeNull();
  });
});

describe("jobCommandText", () => {
  const ws = { id: "7a3f0000-0000-4000-8000-000000000002", slug: "ikinci-alan" };

  it("yedi türün betiği komut tablosundan gelir; slug yoksa tam kimlik", () => {
    expect(jobCommandText({ kind: "routine" }, ws)).toBe("npm run rutin -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "collect" }, ws)).toBe("npm run collect:now -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "measure" }, ws)).toBe("npm run measure:now -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "analyze" }, ws)).toBe("npm run analyze:now -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "label" }, ws)).toBe("npm run label:angles -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "plan" }, ws)).toBe("npm run plan:week -- --workspace=ikinci-alan");
    expect(jobCommandText({ kind: "briefing" }, { id: ws.id })).toBe(`npm run brief:now -- --workspace=${ws.id}`);
  });

  it("isteğin alanları bayrağa çevrilir: ön bakış, hafta, video sayısı; ek bayrak sona eklenir", () => {
    expect(jobCommandText({ kind: "collect", dryRun: true, limit: 10 }, ws)).toBe("npm run collect:now -- --workspace=ikinci-alan --dry-run --limit=10");
    expect(jobCommandText({ kind: "plan", week: "2026-10-12" }, ws)).toBe("npm run plan:week -- --workspace=ikinci-alan --week=2026-10-12");
    expect(jobCommandText({ kind: "routine" }, ws, "--apify-max=0.5")).toBe("npm run rutin -- --workspace=ikinci-alan --apify-max=0.5");
  });
});
