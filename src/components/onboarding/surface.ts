/**
 * Akış ekranlarının ortak görünüm sınıfları. Karar bekleyen blok Bugün'deki karar bloğuyla AYNI gece yüzeyidir (`today/focus-block.tsx`);
 * birincil düğme ekranın tek sarısıdır ("sıra sende"). Renk yalnız belirteçten. Dokunma hedefi en az 48 px (`min-h-tap`).
 */

/** Gece yüzeyi (karar bloğu). */
export const FOCUS_SURFACE = "relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-[1.25rem] bg-focus-surface p-5 text-focus-ink shadow-focus lg:p-7";
/** Gece yüzeyinde birincil düğme: sarı, basılı gölgeli; uzun etiket satır kırabilir. */
export const FOCUS_PRIMARY =
  "h-auto min-h-[3.375rem] rounded-control bg-attention px-5 py-2.5 text-base font-semibold whitespace-normal text-attention-ink shadow-[0_3px_0_var(--attention-pressed)] hover:bg-attention active:translate-y-0.5 active:shadow-[0_1px_0_var(--attention-pressed)]";
/** Gece yüzeyinde ikincil düğme / bağlantı: çerçeve + açık yazı. */
export const FOCUS_SECONDARY =
  "h-auto min-h-tap rounded-control border-focus-line bg-transparent px-4 py-2 text-[0.9375rem] whitespace-normal text-focus-ink hover:bg-focus-surface-raised hover:text-focus-ink dark:border-focus-line dark:bg-transparent dark:hover:bg-focus-surface-raised";
/** Gece yüzeyinde yazı alanı. */
export const FOCUS_FIELD =
  "border-focus-line bg-focus-surface-raised text-focus-ink placeholder:text-focus-ink-muted focus-visible:border-attention focus-visible:ring-attention/40 dark:border-focus-line dark:bg-focus-surface-raised";
/** Gece yüzeyinde seçilebilir satır (radyo / onay kutusu kartı): seçiliyken sarı çerçeve. */
export const FOCUS_OPTION =
  "flex min-h-tap min-w-0 cursor-pointer items-start gap-3 rounded-inner border border-focus-line bg-focus-surface-raised px-3.5 py-3 transition-colors duration-fast has-checked:border-attention has-focus-visible:ring-3 has-focus-visible:ring-attention/40 has-disabled:cursor-not-allowed has-disabled:opacity-55 motion-reduce:transition-none";
/** Gece yüzeyinde hata satırı. */
export const FOCUS_ALERT = "border-l-2 border-attention pl-3 text-sm font-medium text-focus-ink";
/** Gece yüzeyinde klavye odağı halkası (bağlantı / özet satırı gibi çerçevesiz öğeler). */
export const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-attention/40";
/** Gece yüzeyinde seçim işareti (radyo / onay kutusu): yerel denetim, sarı vurgu. */
export const FOCUS_CHECK = "mt-0.5 size-5 shrink-0 accent-attention";
/** Açık zeminde kart (yan sütun, ilerleme). */
export const QUIET_CARD = "flex min-w-0 flex-col gap-3 rounded-card bg-card p-5 lg:p-6";
