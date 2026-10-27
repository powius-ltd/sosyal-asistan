import { AdSignalBadge } from "@/components/matrix/ad-signal-badge";
import type { OrganicAdMark } from "@/lib/matrix/ad-organic";
import { AD_ORGANIC_PLAIN } from "@/lib/plain-language-ads";

/** Kendi içeriğin reklam rozeti (reklam adayı ya da reklamdaki durumu). Yalnız yönetici modunda verilir; işaretsiz içerik için çağrılmaz. */
export function AdOrganicBadge({ mark }: { mark: OrganicAdMark }) {
  if (mark.kind === "candidate") return <AdSignalBadge signal="untested" text={AD_ORGANIC_PLAIN.candidate} />;
  return <AdSignalBadge signal={mark.signal} text={AD_ORGANIC_PLAIN.used[mark.signal]} />;
}
