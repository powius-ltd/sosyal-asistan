/** Metrik modülünün ortak tarih yardımcıları. */

import { DAY_MS } from "@/lib/time";

export { DAY_MS };

/** Tanımlı ve geçerli (NaN olmayan) tarih mi? */
export function isValidDate(d: Date | undefined): d is Date {
  return d !== undefined && !Number.isNaN(d.getTime());
}
