import type { MascotState } from "@/lib/mascot/state";
import { MASCOT_STATE_LABEL } from "@/lib/mascot/state";
import { cn } from "@/lib/utils";

interface DemirkazikProps {
  state: MascotState;
  /** Verilirse ekran okuyucuya "<ad> <durum>" okunur; verilmezse süstür (gizli). */
  name?: string;
  className?: string;
}

/**
 * Demirkazık (Maskot): halka + dört köşeli yıldız. Dört durum: bekliyor (nefes alır) · düşünüyor (halka döner) · anlatıyor
 * (halka yayılır) · sıra sende (sarı işaret noktası atar). Renk yalnız belirteçten (`mascot-*`), hareket `globals.css` (`mk-*`;
 * hareket azaltmada durur). Boyutu çağıran verir (`size-10`); viewBox 48.
 */
export function Demirkazik({ state, name, className }: DemirkazikProps) {
  const label = name === undefined ? undefined : `${name} ${MASCOT_STATE_LABEL[state]}`;
  return (
    <svg
      viewBox="0 0 48 48"
      data-slot="mascot"
      data-state={state}
      className={cn("shrink-0", className)}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {state === "waiting" ? (
        <>
          <circle cx="24" cy="24" r="19" fill="none" className="stroke-mascot-part" strokeWidth="3.5" opacity="0.5" />
          <path className="mk-breathe fill-mascot-body" d="M24 15 26.7 21.3 33 24 26.7 26.7 24 33 21.3 26.7 15 24 21.3 21.3Z" />
        </>
      ) : null}
      {state === "thinking" ? (
        <>
          <g className="mk-turn">
            <circle cx="24" cy="24" r="19" fill="none" className="stroke-mascot-part" strokeWidth="3.5" strokeDasharray="5 6.94" strokeLinecap="round" />
            <circle cx="37.4" cy="10.6" r="4" className="fill-mascot-body" />
          </g>
          <path d="M24 14 27 21 34 24 27 27 24 34 21 27 14 24 21 21Z" className="fill-mascot-body" />
        </>
      ) : null}
      {state === "telling" ? (
        <>
          <circle className="mk-wave stroke-mascot-part" cx="24" cy="24" r="21.5" fill="none" strokeWidth="2" />
          <circle cx="24" cy="24" r="15.5" fill="none" className="stroke-mascot-part" strokeWidth="3.5" />
          <path d="M24 12 27.6 20.4 36 24 27.6 27.6 24 36 20.4 27.6 12 24 20.4 20.4Z" className="fill-mascot-body" />
        </>
      ) : null}
      {state === "turn" ? (
        <>
          <circle cx="24" cy="24" r="19" fill="none" className="stroke-mascot-part" strokeWidth="3.5" />
          <path d="M24 14 27 21 34 24 27 27 24 34 21 27 14 24 21 21Z" className="fill-mascot-body" />
          <circle className="mk-pulse fill-mascot-signal" cx="37.4" cy="10.6" r="7" />
        </>
      ) : null}
    </svg>
  );
}
