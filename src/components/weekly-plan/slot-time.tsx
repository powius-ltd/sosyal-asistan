import { MeasuredValue } from "@/components/common/measured-value";
import { DEFAULT_TIMEZONE, formatWeekdayTime, timeZoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SlotTimeProps {
  /** Paylaşım anı (ISO); atanmadıysa undefined. */
  at?: string;
  /** Hedef kitle saat dilimi (ör. America/New_York); saat önce burada, sonra İstanbul karşılığı yazılır. */
  audienceTimeZone: string;
  className?: string;
}

/** Slot zamanı: hedef kitle saati (ET) + İstanbul karşılığı. Gün adı dilime göre değişebilir, her ikisi ayrı yazılır. */
export function SlotTime({ at, audienceTimeZone, className }: SlotTimeProps) {
  if (at === undefined) {
    return <MeasuredValue value={undefined} reason="Bu içerik için paylaşım saati atanmadı." className={className} />;
  }
  const audience = formatWeekdayTime(at, audienceTimeZone);
  const istanbul = formatWeekdayTime(at, DEFAULT_TIMEZONE);
  if (audience === undefined || istanbul === undefined) {
    return <MeasuredValue value={undefined} reason="Paylaşım saati okunamadı." className={className} />;
  }
  const sameZone = audienceTimeZone === DEFAULT_TIMEZONE;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 tabular", className)}>
      <span className="font-medium">
        {audience} {timeZoneLabel(audienceTimeZone)}
      </span>
      {sameZone ? null : (
        <span className="text-muted-foreground">
          · {istanbul} {timeZoneLabel(DEFAULT_TIMEZONE)}
        </span>
      )}
    </span>
  );
}
