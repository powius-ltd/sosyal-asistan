import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { briefingAgeLabel } from "@/components/briefing/age-label";
import { EvidenceLinks, resolveEvidence } from "@/components/briefing/evidence-links";
import { splitLeadSentence } from "@/components/briefing/lead-sentence";
import { ConfidenceMeter } from "@/components/common/confidence-meter";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import { Demirkazik } from "@/components/mascot/demirkazik";
import { TAP_CHIPS, TAP_LINK, TAP_WHY } from "@/components/today/tap";
import type { MascotState } from "@/lib/mascot/state";
import type { TodayState, TodayVoice as TodayVoiceModel } from "@/lib/today";

interface TodayVoiceProps {
  voice: TodayVoiceModel;
  state: TodayState;
  /** Maskot adı (`maskotName()`, sayfa okur ve geçirir): "ben" diyen kimin olduğunu söyler. */
  maskotName: string;
  /** Demirkazık'ın durumu (`voiceMascotState`). */
  mascot: MascotState;
  /** İstekteki tek saat (`getPanelContext()`): notların yaşı bundan hesaplanır. */
  now: Date;
  /** Cümlenin altındaki küçük satır (verinin tazeliği); yoksa yazılmaz. */
  caption?: string;
  /** Müşteri kopyası: maskot ve "… diyor ki" yok; düz "Bugün" başlığı + aynı tek cümle. */
  plain?: boolean;
}

/**
 * Demirkazık'ın tek cümlesi (sayfanın başlığı): şablon cümle + karar sayısı, serif ve büyük. Altında (varsa) en güçlü notun başlığı ve ilk
 * cümlesi; notun kalanı, güven ve kanıt bağlantıları "Neden?" içinde. Künye sade: yalnız notların yaşı. Metin mantık katmanından hazır
 * gelir (LLM çağrısı ve sayı üretimi yok); okunamayan parça hiç yazılmaz, cümle de not da yoksa blok çizilmez.
 */
export function TodayVoice({ voice, state, maskotName, mascot, now, caption, plain = false }: TodayVoiceProps) {
  const { note } = voice;
  const lead = [voice.lead, state.kind === "decisions" ? state.text : undefined].filter((part) => part !== undefined && part !== "").join(" ");
  if (lead === "" && note === undefined) return null;

  const sentence = note === undefined ? undefined : splitLeadSentence(note.text);
  const evidenceCount = note === undefined ? 0 : resolveEvidence(note.evidence).length;
  const hasWhy = note !== undefined && ((sentence?.rest ?? "") !== "" || evidenceCount > 0);
  const LeadTag = plain ? "p" : "h1";
  const age = note === undefined ? undefined : briefingAgeLabel(note.generatedAt, now);

  return (
    <section aria-label={plain ? "Bugün" : `${maskotName} diyor ki`} data-testid="today-voice" data-state={state.kind} className="flex min-w-0 items-start gap-3 lg:gap-4">
      {plain ? null : <Demirkazik state={mascot} name={maskotName} className="mt-1 size-11 lg:size-14" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {plain ? <h1 className="font-figure text-3xl font-bold tracking-tight">Bugün</h1> : null}
        {lead !== "" ? (
          <LeadTag className={plain ? "font-voice text-xl/[1.3] text-balance break-words text-muted-foreground lg:text-2xl/[1.3]" : "font-voice text-2xl/[1.2] font-medium tracking-tight text-balance break-words lg:text-[2rem]/[1.18]"}>{lead}</LeadTag>
        ) : null}
        {caption !== undefined ? <p className="text-sm text-muted-foreground">{caption}</p> : null}
        {note !== undefined ? (
          <div className="mt-1 flex min-w-0 flex-col gap-0.5" data-slot="voice-note">
            <h2 className="font-figure text-base leading-snug font-semibold break-words">{note.headline}</h2>
            {sentence !== undefined && sentence.lead !== "" ? <p className="font-voice text-[1.0625rem] leading-[1.5] text-muted-foreground">{sentence.lead}</p> : null}
            {age !== undefined ? (
              <p className="text-xs text-ai-meta" data-byline="when">
                notlarım {age}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-start gap-x-4">
          {hasWhy && note !== undefined ? (
            <WhyDisclosure className={`open:basis-full ${TAP_WHY}`}>
              {sentence !== undefined && sentence.rest !== "" ? <p className="font-voice text-base leading-[1.55] text-muted-foreground">{sentence.rest}</p> : null}
              <ConfidenceMeter level={note.confidence} className="text-sm text-ai-meta" />
              <div className={TAP_CHIPS}>
                <EvidenceLinks evidence={note.evidence} />
              </div>
            </WhyDisclosure>
          ) : null}
          {voice.link ? (
            <Link href={voice.link.href} className={`inline-flex ${TAP_LINK} w-fit items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline`}>
              {voice.link.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
          {note?.stale ? (
            <p className="basis-full text-sm text-muted-foreground" data-slot="stale-note">
              {note.stale.text}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
