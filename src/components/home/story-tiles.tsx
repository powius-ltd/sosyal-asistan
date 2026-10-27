import { TODAY_COPY } from "@/lib/copy/today";
import type { StoryTile } from "@/lib/home/story-tiles";
import { cn } from "@/lib/utils";

const NONE_HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--unmeasured-hatch)_7px_8px)]";

/**
 * Cümleli rakam karoları: her karo Demirkazık'ın bir cümlesi + tek büyük rakam. Ölçülemeyen karo taralıdır (tire + sebep cümlesi);
 * 0 yazılmaz. Rakam yalnız süstür (cümle aynı bilgiyi söyler): ekran okuyucuya cümle okunur.
 */
export function StoryTiles({ tiles }: { tiles: readonly StoryTile[] }) {
  return (
    <section aria-labelledby="today-tiles-heading" data-testid="today-tiles" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="today-tiles-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
        {TODAY_COPY.tilesHeading}
      </h2>
      <ul className="flex min-w-0 flex-col gap-2.5">
        {tiles.map((tile) => {
          const measured = tile.figure !== undefined;
          return (
            <li
              key={tile.kind}
              data-tile={tile.kind}
              data-measured={measured}
              className={cn(
                "grid min-h-[6.5rem] min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3.5 rounded-card py-4 pr-[1.125rem] pl-4",
                measured ? (tile.kind === "found" ? "bg-brand-soft" : "bg-card") : cn("ring-1 ring-border", NONE_HATCH),
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "font-figure leading-[0.9] font-bold tracking-[-0.045em] tabular-nums",
                  tile.kind === "found" && "text-brand",
                  measured ? "text-[3.5rem]" : "text-[3rem] font-medium text-unmeasured",
                )}
              >
                {tile.figure ?? "—"}
                {tile.unit !== undefined ? (
                  <small className="mt-1.5 block font-sans text-sm leading-none font-semibold tracking-normal text-muted-foreground">{tile.unit}</small>
                ) : null}
                {tile.ratio !== undefined ? (
                  <span className="mt-2.5 grid w-[4.875rem] gap-1">
                    <i className="block h-1.5 rounded-[3px] bg-bar-track" style={{ width: `${100 / tile.ratio}%` }} />
                    <i className="block h-[0.5625rem] rounded-[3px] bg-trend" />
                  </span>
                ) : null}
              </div>
              <p className="text-[1.0625rem] leading-snug font-medium text-pretty">
                {tile.sentence}
                {tile.detail !== undefined ? <span className="mt-1 block text-[0.9375rem] font-normal text-muted-foreground">{tile.detail}</span> : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
