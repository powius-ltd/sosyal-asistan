import { GoalForm } from "@/components/ads/goal-form";
import { goalSentence } from "@/components/ads/goal-input";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdAccount } from "@/lib/domain/ads";

/** Hedef bölümü: tek cümlelik özet + açılır form (hedef yoksa açık gelir). */
export function GoalSection({ account }: { account: AdAccount }) {
  const copy = AD_SCREEN_COPY.goal;
  const sentence = goalSentence(account.goal, account.currency);
  return (
    <details data-slot="ad-goal" open={account.goal === undefined} className="mb-6 rounded-xl border px-4 py-3">
      <summary className="min-h-tap cursor-pointer text-sm font-medium md:min-h-0">
        {sentence === undefined ? copy.none : copy.summary(sentence)} <span className="font-normal text-muted-foreground">· {copy.open}</span>
      </summary>
      <div className="mt-3">
        <GoalForm accountId={account.id} goal={account.goal} />
      </div>
    </details>
  );
}
