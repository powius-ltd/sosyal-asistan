/**
 * Mock metin kataloğunun tipleri. Niş: "yapay zekâ ile iş/verimlilik" kısa video üreticileri.
 * Transcript = hook + gövde cümleleri + çağrı; analiz alıntıları bu cümlelerden BİREBİR alınır.
 */

/** Taksonomi anahtarı (F2'de `lib/llm/taxonomy.ts`); ekran etiketi `lib/domain/hook-types.ts` tablosundan. */
export type MockHookType =
  | "question"
  | "list"
  | "confession"
  | "shock_stat"
  | "pov"
  | "mistake_warning"
  | "comparison";

export interface HookSpec {
  type: MockHookType;
  /** Transcript'in ilk cümlesi (birebir). */
  text: string;
  /** Hook türünü doğrulayan alıntı: `text` içinde BİREBİR geçmeli. */
  evidence: string;
}

export interface Topic {
  key: string;
  /** Konu etiketi (analiz `labels.topic` değeri). */
  label: string;
  hashtags: string[];
  hooks: HookSpec[];
  /** [problem, değer, değer] — sırayla transcript gövdesi. */
  body: [string, string, string];
  ctas: [string, string];
  /** Konu etiketinin kanıtı: `body[0]` içinde BİREBİR geçmeli. */
  topicEvidence: string;
  /** Ton etiketi (kanıtı `body[2]`). */
  tone: string;
}
