/**
 * Yayın sayfasının görünüm durumu URL'de tutulur (`?gorunum=liste|hafta|ay&tarih=YYYY-MM-DD`):
 * sunucu bileşeni okur, geçişler düz bağlantıdır (istemci JS gerekmez).
 */
import { addDays, addMonths, isDayKey, startOfMonth, type DayKey } from "@/components/publish/calendar-utils";
import { ROUTES } from "@/lib/routes";
import { first } from "@/lib/search-params";

export type PublishView = "liste" | "hafta" | "ay";

export const PUBLISH_VIEWS: readonly PublishView[] = ["liste", "hafta", "ay"];

export const VIEW_LABEL: Record<PublishView, string> = {
  liste: "Liste",
  hafta: "Hafta",
  ay: "Ay",
};

export function parseView(value: string | string[] | undefined): PublishView {
  const raw = first(value);
  return PUBLISH_VIEWS.find((v) => v === raw) ?? "liste";
}

export function parseAnchor(value: string | string[] | undefined, fallback: DayKey): DayKey {
  const raw = first(value);
  return isDayKey(raw) ? raw : fallback;
}

export function publishHref(view: PublishView, anchor?: DayKey): string {
  const params = new URLSearchParams();
  if (view !== "liste") params.set("gorunum", view);
  if (view !== "liste" && anchor) params.set("tarih", anchor);
  const query = params.toString();
  return query ? `${ROUTES.publish}?${query}` : ROUTES.publish;
}

/** Önceki/sonraki dönemin çıpası: hafta 7 gün, ay bir ay kayar. */
export function shiftAnchor(view: PublishView, anchor: DayKey, direction: 1 | -1): DayKey {
  return view === "ay" ? addMonths(startOfMonth(anchor), direction) : addDays(anchor, 7 * direction);
}
