import { Badge } from "@/components/ui/badge";
import type { IdeaDetails } from "@/lib/domain/intel";
import { DURATION_BUCKET_LABEL, IDEA_FRAME_LABEL } from "@/lib/domain/taxonomy";
import { formatDuration } from "@/lib/format";
import { CTA_TYPE_PLAIN } from "@/lib/plain-language";
import { IDEA_PLAIN } from "@/lib/plain-language-plan";

/** Bilinmeyen taksonomi değeri ekranı bozmasın: sözlükte yoksa anahtar olduğu gibi yazılır ("constructor" prototipten okunmaz). */
const labelOf = (dict: Readonly<Record<string, string>>, key: string) => (Object.hasOwn(dict, key) ? dict[key] : key);

/**
 * Fikir ayrıntılarından künye rozetleri: konu, çerçeve, videonun sonunda istenen şey, hedef süre ve kendi hesapta denenip denenmediği.
 * Hiçbir alan yoksa (eski/elle eklenen fikir) hiçbir şey çizilmez; olmayan alan 0/boş yazılmaz.
 */
export function IdeaMeta({ details }: { details: IdeaDetails }) {
  const { topic, frame, ctaType, targetDurationSec, durationBucket, ownTried } = details;
  const duration =
    targetDurationSec !== undefined
      ? `Hedef süre ${formatDuration(targetDurationSec)}`
      : durationBucket
        ? `Süre ${labelOf(DURATION_BUCKET_LABEL, durationBucket)}`
        : undefined;
  const items = [
    topic ? `Konu: ${topic}` : undefined,
    frame ? `Çerçeve: ${labelOf(IDEA_FRAME_LABEL, frame)}` : undefined,
    ctaType ? `${IDEA_PLAIN.ctaPrefix}: ${labelOf(CTA_TYPE_PLAIN, ctaType)}` : undefined,
    duration,
  ].filter((item): item is string => item !== undefined);

  if (items.length === 0 && ownTried === undefined) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="font-normal">
          {item}
        </Badge>
      ))}
      {ownTried === undefined ? null : (
        <Badge variant={ownTried ? "secondary" : "outline"} className="font-normal">
          {ownTried ? "Bu yönü denedin" : "Bu yönü henüz denemedin"}
        </Badge>
      )}
    </div>
  );
}
