import { Hint } from "@/components/common/hint";
import { Badge } from "@/components/ui/badge";
import type { AdOutcome, AdSignal } from "@/lib/domain/ads";
import { AD_SIGNAL_PLAIN } from "@/lib/plain-language-ads";
import { cn } from "@/lib/utils";

/** Reklam işareti renkleri: yalnız anlam belirteçleri (yeni belirteç yok). Renk tek taşıyıcı değil: rozet metni her zaman yazılıdır. */
const AD_SIGNAL_TONE: Record<AdSignal, string> = {
  worked: "border-transparent bg-success-soft text-success-soft-foreground",
  fatigued: "border-transparent bg-warning-soft text-warning-soft-foreground",
  weak: "border-transparent bg-danger-soft text-danger-soft-foreground",
  unmeasured: "border-transparent bg-muted text-muted-foreground",
  untested: "border-transparent bg-info-soft text-info-soft-foreground",
};

/** Tek kreatifin sonucu → rozet işareti (yargılanmamış = sonuç bekleniyor). */
export const signalOfOutcome = (outcome: AdOutcome): AdSignal => (outcome === "unjudged" ? "unmeasured" : outcome);

/** Reklam işareti rozeti (+ anlamı ipucu balonunda). `text` verilirse metin onunla değişir (organik içerik rozeti), renk işaretten gelir. Sunucu bileşeninden de çizilebilir (`Hint` istemci yaprağıdır). */
export function AdSignalBadge({ signal, className, text }: { signal: AdSignal; className?: string; text?: { badge: string; meaning: string } }) {
  const { badge, meaning } = text ?? AD_SIGNAL_PLAIN[signal];
  return (
    <Hint content={<span className="block max-w-64 whitespace-normal">{meaning}</span>} label={`${badge}. ${meaning}`} className={cn("relative z-10 shrink-0", className)}>
      <Badge variant="outline" className={cn("font-normal", AD_SIGNAL_TONE[signal])} data-ad-signal={signal}>
        {badge}
      </Badge>
    </Hint>
  );
}
