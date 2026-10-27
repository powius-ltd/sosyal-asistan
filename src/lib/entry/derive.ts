/**
 * Giriş ekranının 7 adımlı hattı (SAF). Analiz ve Plan haftalık akıştan (`deriveWeeklyFlow`) okunur: Analiz hiçbir zaman "sıra sende"
 * değildir (kendiliğinden yürür). Onayın → Takip haftanın plan videolarından: her videonun aşaması fişinden (`stageOf`), hattın
 * önü en geride kalan videonun aşamasıdır; öndekiler biter, arkadakiler bekler. Üretim biz çalışırken `running`'dir, Takip de.
 * Değişmez: `active` adım en çok 1.
 */
import { ENTRY_COPY as COPY } from "@/lib/copy/entry";
import { ENTRY_STAGES, type EntryInput, type EntryStage, type EntryStep, type EntryVideo, type EntryVideoInput, type EntryView } from "@/lib/entry/types";
import type { WeeklyFlowStep } from "@/lib/weekly-flow/types";

export function stageOf(video: EntryVideoInput): EntryStage {
  if (video.ideaStatus === "published") return "track";
  const order = video.order;
  if (!order || order.kind === undefined) return "approve";
  if (order.status === "paylasildi") return "track";
  if (order.status === "uretildi") return "share";
  if (order.status === "uretiliyor") return "produce";
  return "script";
}

const step = (flow: readonly WeeklyFlowStep[], key: WeeklyFlowStep["key"]) => flow.find((s) => s.key === key);

function analyzeStep(flow: readonly WeeklyFlowStep[]): EntryStep {
  const parts = [step(flow, "collect"), step(flow, "analyze")].filter((s): s is WeeklyFlowStep => s !== undefined);
  const open = parts.find((s) => s.state !== "done");
  if (!open) return { key: "analyze", state: "done", reason: COPY.reasons.analyze.done };
  return { key: "analyze", state: "running", reason: COPY.reasons.analyze.running(open.reason) };
}

function planStep(flow: readonly WeeklyFlowStep[], hasVideos: boolean): EntryStep {
  const plan = step(flow, "plan");
  if (hasVideos || plan?.state === "done") return { key: "plan", state: "done", reason: COPY.reasons.plan.done };
  if (plan?.state === "active" && plan.action) return { key: "plan", state: "active", reason: plan.reason, action: plan.action };
  if (plan?.state === "active") return { key: "plan", state: "running", reason: plan.reason };
  return { key: "plan", state: "waiting", reason: plan?.reason ?? COPY.reasons.plan.missing };
}

function stageStep(key: EntryStage, front: EntryStage | undefined, videos: readonly EntryVideo[]): EntryStep {
  const R = COPY.reasons;
  if (front === undefined) {
    const reason = key === "track" ? R.track.waiting : R[key].waiting;
    return { key, state: "waiting", reason };
  }
  const at = ENTRY_STAGES.indexOf(key);
  const frontAt = ENTRY_STAGES.indexOf(front);
  if (at < frontAt) return { key, state: "done", reason: "" };
  if (at > frontAt) return { key, state: "waiting", reason: key === "track" ? R.track.waiting : R[key].waiting };
  switch (key) {
    case "approve":
      return { key, state: "active", reason: R.approve.active(videos.filter((v) => v.stage === "approve").length) };
    case "script":
      return { key, state: "active", reason: R.script.active };
    case "produce":
      return { key, state: "running", reason: R.produce.active };
    case "share":
      return { key, state: "active", reason: R.share.active };
    case "track":
      return { key, state: "running", reason: R.track.running };
  }
}

export function deriveEntry(input: EntryInput): EntryView {
  const videos: EntryVideo[] = input.videos.map((v) => ({ ...v, stage: stageOf(v) }));
  const front = videos.length === 0 ? undefined : ENTRY_STAGES[Math.min(...videos.map((v) => ENTRY_STAGES.indexOf(v.stage)))];
  const steps: EntryStep[] = [analyzeStep(input.flow), planStep(input.flow, videos.length > 0), ...ENTRY_STAGES.map((key) => stageStep(key, front, videos))];
  // Biten aşamanın boş gerekçesi: tek cümle "tamam".
  return { steps: steps.map((s) => (s.state === "done" && s.reason === "" ? { ...s, reason: COPY.stateLabels.done } : s)), videos };
}
