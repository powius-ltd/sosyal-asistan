import { AutomationSwitch } from "@/components/automation/automation-switch";
import { Badge } from "@/components/ui/badge";
import { AUTOMATION_COPY as COPY } from "@/lib/copy/automation";
import type { AutomationRow } from "@/lib/automation/model";

function stateLabel(row: AutomationRow): string {
  if (row.mode === "always") return COPY.state.always;
  if (row.mode === "soon") return COPY.state.soon;
  return row.enabled ? COPY.state.on : COPY.state.off;
}

/** 4 satır: ad + ne yaptığı + anahtar (düzenlenebilirse) ya da durum rozeti; altında son çalışma ve sıradaki zaman. Sunucu bileşeni. */
export function AutomationList({ rows, canEdit }: { rows: readonly AutomationRow[]; canEdit: boolean }) {
  return (
    <ul className="grid gap-3" aria-label={COPY.title}>
      {rows.map((row) => (
        <li key={row.id} data-automation={row.id} className="rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{row.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{row.does}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.money}</p>
            </div>
            {canEdit && row.mode === "toggle" && row.settingKey !== undefined ? (
              <AutomationSwitch settingKey={row.settingKey} enabled={row.enabled} name={row.name} />
            ) : (
              <Badge variant={row.mode === "toggle" && !row.enabled ? "outline" : "secondary"}>{stateLabel(row)}</Badge>
            )}
          </div>
          <p className="mt-3 text-sm">
            <span className="text-muted-foreground">{COPY.last2.prefix}</span> {row.last.text}{" "}
            <span className="text-muted-foreground">{COPY.last2.sep}</span>{" "}
            {row.mode === "toggle" && !row.enabled ? row.next : <><span className="text-muted-foreground">{COPY.next.label}:</span> {row.next}</>}
          </p>
          {row.note === undefined ? null : <p className="mt-2 text-sm text-warning-soft-foreground">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
