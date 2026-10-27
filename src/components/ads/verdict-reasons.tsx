import { VerdictBadge } from "@/components/ads/verdict-badge";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdVerdict } from "@/lib/domain/ads";
import { AD_VERDICT_PLAIN, adReasonPhrases, adUnmeasuredPhrase } from "@/lib/plain-language-ads";

const COPY = AD_SCREEN_COPY.detail;

/** Öneri + nedenler (yalnız sözlükten) + ölçülemeyen girdiler. Bilinmeyen kod için cümle uydurulmaz. */
export function VerdictReasons({ verdict }: { verdict: AdVerdict }) {
  const reasons = adReasonPhrases(verdict);
  const unmeasured = (verdict.unmeasured ?? []).flatMap((code) => adUnmeasuredPhrase(code) ?? []);
  return (
    <section data-slot="ad-verdict" aria-label={COPY.verdict} className="mb-6 rounded-xl border px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <VerdictBadge status={verdict.status} />
        <span className="text-sm">{AD_VERDICT_PLAIN[verdict.status].advice}</span>
      </div>
      <h2 className="text-sm font-medium">{COPY.why}</h2>
      {reasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noReason}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {unmeasured.length > 0 ? (
        <>
          <h3 className="mt-3 text-sm font-medium">{COPY.unmeasuredTitle}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {unmeasured.map((phrase) => (
              <li key={phrase}>{phrase}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
