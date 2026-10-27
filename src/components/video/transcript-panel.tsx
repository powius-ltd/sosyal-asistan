import { FileText } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Heading } from "@/components/video/analysis-parts";
import { ScreenTextChannel } from "@/components/video/screen-text-channel";
import { splitTranscript } from "@/components/video/transcript-split";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentItem } from "@/lib/domain/content";
import {
  HOOK_SOURCE_LABEL,
  MIN_MEANINGFUL_WORDS,
  type EditMetrics,
  type HookSource,
  type Transcript,
  type TranscriptSource,
} from "@/lib/domain/intel";
import { formatDate, formatNumber } from "@/lib/format";
import { ANALYSIS_PLAIN } from "@/lib/plain-language-publish";

function sourceLabel(source: TranscriptSource): string {
  if (source === "manual") return "Elle girildi";
  if (source === "deepgram" || source === "openai_stt") return ANALYSIS_PLAIN.speechRecognition;
  if (source === "gemini" || source === "claude_cli") return "Video analizi (yapay zekâ)";
  return ANALYSIS_PLAIN.speechPlatformSource;
}

/** Hook konuşmadan geliyorsa (ya da kaynağı kayıtlı değilse: eski analiz) konuşma metninde vurgulanır. */
const highlightsSpeech = (hookSource: HookSource | undefined) => hookSource === undefined || hookSource === "speech";

function SpeechBody({
  transcript,
  text,
  hookText,
  hookSource,
  timeZone,
}: {
  transcript: Transcript;
  text: string;
  hookText?: string;
  hookSource?: HookSource;
  timeZone?: string;
}) {
  const highlight = highlightsSpeech(hookSource);
  const { before, hook, after } = highlight ? splitTranscript(text, hookText) : { before: "", hook: "", after: text };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {transcript.language ? <Badge variant="outline">{transcript.language.toUpperCase()}</Badge> : null}
        <Badge variant="outline">{formatNumber(transcript.wordCount)} kelime</Badge>
        <Badge variant="outline">{sourceLabel(transcript.source)}</Badge>
        <span className="text-muted-foreground">
          {transcript.expiresAt ? `Saklama bitişi: ${formatDate(transcript.expiresAt, timeZone)}` : "Süresiz saklanır"}
        </span>
      </div>

      {!transcript.isMeaningful ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Anlamlı konuşma yok: {formatNumber(transcript.wordCount)} kelime (en az {MIN_MEANINGFUL_WORDS} gerekir); müzik ya
          da ses efekti olabilir. Bu yüzden analiz için yetersiz sayılır.
        </p>
      ) : null}

      <p className="text-sm leading-relaxed whitespace-pre-line">
        {before}
        {hook ? (
          <mark className="rounded bg-highlight px-0.5 font-medium text-highlight-foreground">
            {hook}
          </mark>
        ) : null}
        {after}
      </p>
      {hook ? <p className="text-xs text-muted-foreground">Vurgulu kısım: açılış (ilk cümle).</p> : null}
      {!highlight && hookSource ? (
        <p className="text-xs text-muted-foreground">
          Açılış konuşmada değil: kaynağı {HOOK_SOURCE_LABEL[hookSource].toLocaleLowerCase("tr-TR")}, bu yüzden metinde vurgulanmadı.
        </p>
      ) : null}
    </>
  );
}

/** Konuşma kanalı: metin yoksa/süresi dolmuşsa açıklayıcı boş durum. */
function SpeechChannel({
  item,
  transcript,
  hookText,
  hookSource,
  timeZone,
}: {
  item: ContentItem;
  transcript?: Transcript;
  hookText?: string;
  hookSource?: HookSource;
  timeZone?: string;
}) {
  const noSpeechFormat = item.format === "image" || item.format === "carousel";

  if (!transcript) {
    return (
      <EmptyState
        icon={FileText}
        title={noSpeechFormat ? "Bu biçimde konuşma yok" : "Konuşma metni henüz alınmadı"}
        description={
          noSpeechFormat
            ? "Görsel ve karusel gönderilerde ses olmadığı için konuşma metni çıkarılmaz."
            : "Konuşma metni, video analizi koşunca çıkarılır. Videoda anlamlı konuşma yoksa (yalnız müzik ya da sessiz) boş kalabilir."
        }
      />
    );
  }
  if (transcript.text === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="Konuşma metninin saklama süresi doldu"
        description="Konuşma metni 90 gün saklanır; süre dolduktan sonra yalnız açılış alıntısı ve analiz kalır."
      />
    );
  }
  return (
    <SpeechBody transcript={transcript} text={transcript.text} hookText={hookText} hookSource={hookSource} timeZone={timeZone} />
  );
}

/**
 * Konuşma metni kartı: KONUŞMA ve EKRAN YAZISI ayrı kanallar. Açılış konuşmadansa konuşma metninde vurgulanır; ekran yazısı ya da
 * açıklamadansa vurgu yapılmaz (yanlış cümleyi boyamamak için) ve kanal notu düşülür.
 */
export function TranscriptPanel({
  item,
  transcript,
  hookText,
  hookSource,
  editMetrics,
  timeZone,
}: {
  item: ContentItem;
  transcript?: Transcript;
  hookText?: string;
  hookSource?: HookSource;
  editMetrics?: EditMetrics;
  timeZone?: string;
}) {
  const showScreenChannel = transcript !== undefined || editMetrics !== undefined || hookSource === "screen_text";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ANALYSIS_PLAIN.speechTitle}</CardTitle>
        <CardDescription>{ANALYSIS_PLAIN.speechDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section className="flex flex-col gap-3" aria-label="Konuşma kanalı">
          <Heading>Konuşma</Heading>
          <SpeechChannel item={item} transcript={transcript} hookText={hookText} hookSource={hookSource} timeZone={timeZone} />
        </section>
        {showScreenChannel ? (
          <ScreenTextChannel hookText={hookText} hookSource={hookSource} editMetrics={editMetrics} segments={transcript?.segments} />
        ) : null}
      </CardContent>
    </Card>
  );
}
