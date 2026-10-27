import type { ReactNode } from "react";

import { Hint } from "@/components/common/hint";
import { measured as measuredOf, unmeasured, type Measured } from "@/lib/domain/measured";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Ölçülemedi" görsel sözleşmesinin TEK uygulayıcısı (bkz. lib/domain/measured.ts).
 *
 *   0 / false          → gerçek ölçüm, normal basılır ("0", "Hayır")
 *   undefined / null   → gri tire "—" + sebebi anlatan ipucu; ASLA "0" ya da "%0" yazılmaz
 *   "" (boş metin)     → hiçbir şey çizilmez (alan döndü ama içi boş)
 *
 * İki kullanım biçimi:
 *   <MeasuredValue value={item.metrics.saves} reason="Platform vermedi" />
 *   <MeasuredValue measured={fromNumber(x, "sebep")} format={formatCompact} />
 *
 * Sebep nerede: varsayılan ipucu balonunda (dar tablo hücresi); `inline` verilirse tirenin YANINDA yazılır (balon açmadan,
 * dokunmatikte de okunur). Yer varsa `inline` yeğlenir; sebep kısa yazılır. Dar yerde `shortReason` verilirse tirenin yanında YALNIZ
 * kısa neden ("veri yok") görünür, tam sebep balonda ve ekran okuyucu etiketinde kalır (neden yalnız balonda saklanmaz).
 */
export const UNMEASURED_DASH = "—";
export const DEFAULT_UNMEASURED_REASON = "Bu alan ölçülemedi.";

type Scalar = number | string | boolean;

interface CommonProps<T extends Scalar> {
  /** Ölçülmüş değerin gösterimi. Verilmezse sayı → tr-TR gruplama, boolean → Evet/Hayır. */
  format?: (value: T) => ReactNode;
  /** Ölçülemeyen değerde sebebi satır içinde yaz (tire + kısa sebep), balon yerine. */
  inline?: boolean;
  /** Tirenin yanında görünen kısa neden (tam sebep balonda kalır). `inline` ile birlikte verilirse `inline` kazanır. */
  shortReason?: string;
  className?: string;
}

export type MeasuredValueProps<T extends Scalar> =
  | (CommonProps<T> & { value: T | null | undefined; reason?: string; measured?: undefined })
  | (CommonProps<T> & { measured: Measured<T>; value?: undefined; reason?: undefined });

function resolve<T extends Scalar>(props: MeasuredValueProps<T>): Measured<T> {
  if (props.measured) return props.measured;
  const { value, reason } = props;
  if (value === undefined || value === null) return unmeasured(reason);
  if (typeof value === "number" && !Number.isFinite(value)) return unmeasured(reason);
  if (typeof value === "string" && value.trim() === "") return { status: "empty" };
  return measuredOf(value);
}

function defaultFormat(value: Scalar): ReactNode {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  return value;
}

export function MeasuredValue<T extends Scalar>(props: MeasuredValueProps<T>) {
  const resolved = resolve(props);

  if (resolved.status === "empty") return null;

  if (resolved.status === "unmeasured") {
    const reason = resolved.reason ?? DEFAULT_UNMEASURED_REASON;
    if (props.inline) {
      return (
        <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-unmeasured", props.className)}>
          <span data-state="unmeasured" aria-hidden>
            {UNMEASURED_DASH}
          </span>
          <span className="sr-only">Ölçülemedi: </span>
          <span data-slot="unmeasured-reason" className="text-xs font-normal tracking-normal">
            {reason}
          </span>
        </span>
      );
    }
    const hint = (
      <Hint content={reason} label={`Ölçülemedi: ${reason}`} className={cn("text-unmeasured", !props.shortReason && props.className)}>
        <span data-state="unmeasured">{UNMEASURED_DASH}</span>
      </Hint>
    );
    if (!props.shortReason) return hint;
    return (
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-unmeasured", props.className)}>
        {hint}
        <span data-slot="unmeasured-short" aria-hidden className="text-xs font-normal tracking-normal">
          {props.shortReason}
        </span>
      </span>
    );
  }

  const render = props.format ?? defaultFormat;
  return (
    <span data-state="measured" className={cn("tabular", props.className)}>
      {render(resolved.value)}
    </span>
  );
}
