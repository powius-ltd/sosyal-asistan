import { WeeklyFlowView } from "@/components/weekly-flow/weekly-flow-view";
import type { PanelRepository } from "@/lib/data/repository";
import type { TodayInput } from "@/lib/today/types";
import { deriveWeeklyFlow } from "@/lib/weekly-flow/derive";
import { loadWeeklyFlowInput } from "@/lib/weekly-flow/load";

interface Props {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  /** Bugün'ün zaten okuduğu veri: plan ve son toplama yeniden okunmaz. */
  today: Pick<TodayInput, "summary" | "workspace">;
}

/** Haftalık akış şeridi (sunucu bileşeni): girdiyi okur, 5 adımı türetir, çizimi `WeeklyFlowView`'a verir. */
export async function WeeklyFlowStrip({ repo, wsId, now, today }: Props) {
  const input = await loadWeeklyFlowInput({ repo, wsId, now, today });
  return <WeeklyFlowView steps={deriveWeeklyFlow(input)} />;
}
