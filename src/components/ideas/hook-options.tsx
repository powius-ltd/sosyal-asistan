import { CopyButton } from "@/components/ideas/copy-button";
import { Badge } from "@/components/ui/badge";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { OPENING_PLAIN } from "@/lib/plain-language-plan";

/**
 * Açılış cümlesi önerileri (3–5); her birinin yanında kopyala düğmesi. `hookTypes` (fikir ayrıntısından) cümlelerle AYNI sırada ise her
 * cümlenin açılış tarzı küçük rozetle gösterilir; yoksa yalnız metin.
 */
export function HookOptions({ hooks, hookTypes }: { hooks: string[]; hookTypes?: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{OPENING_PLAIN.options}</h3>
      {hooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{OPENING_PLAIN.none}</p>
      ) : (
        <ul className="flex flex-col">
          {hooks.map((hook, index) => {
            const type = hookTypes?.[index];
            return (
              <li key={index} className="flex items-start justify-between gap-2 border-b py-1.5 text-sm last:border-b-0">
                <span className="flex min-w-0 flex-col gap-1">
                  <span>“{hook}”</span>
                  {type ? (
                    <Badge variant="secondary" className="w-fit">
                      {hookTypeLabel(type)}
                    </Badge>
                  ) : null}
                </span>
                <CopyButton text={hook} label={OPENING_PLAIN.copy} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
