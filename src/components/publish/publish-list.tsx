import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PublishJobCard, type PublishFixSettings } from "@/components/publish/job-card";
import { splitQueue, type PublishJobView } from "@/components/publish/job-views";
import { emptyQueueText } from "@/lib/plain-language-publish";

function Group({
  title,
  hint,
  views,
  timeZone,
  fixSettings,
}: {
  title: string;
  hint: string;
  views: PublishJobView[];
  timeZone: string;
  fixSettings?: PublishFixSettings;
}) {
  if (views.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {views.length} iş · {hint}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {views.map((view) => (
          <PublishJobCard key={view.job.id} view={view} timeZone={timeZone} fixSettings={fixSettings} />
        ))}
      </ul>
    </section>
  );
}

/** Liste görünümü: kuyruk (yakın plan önce) + geçmiş (yayınlanan/iptal). */
export function PublishList({
  views,
  timeZone,
  canCreate,
  fixSettings,
}: {
  views: PublishJobView[];
  timeZone: string;
  /** "Yeni yayın" düğmesi sayfada var mı: yoksa boş durum ona yönlendirmez (D2-07). */
  canCreate: boolean;
  fixSettings?: PublishFixSettings;
}) {
  if (views.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Henüz yayın işi yok"
        description={emptyQueueText(canCreate)}
      />
    );
  }

  const { queue, history } = splitQueue(views);
  return (
    <div className="flex flex-col gap-6">
      <Group title="Kuyruk" hint="planlanan zamana göre" views={queue} timeZone={timeZone} fixSettings={fixSettings} />
      <Group title="Geçmiş" hint="yayınlanan ve iptal edilenler" views={history} timeZone={timeZone} fixSettings={fixSettings} />
    </div>
  );
}
