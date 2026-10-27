/** Transcript'i "öncesi / hook / sonrası" olarak böler (hook vurgusu için). */

export interface TranscriptParts {
  before: string;
  /** Vurgulanacak hook; bulunamazsa boş dizge (vurgu yok). */
  hook: string;
  after: string;
}

/** İlk cümle: noktalama ile biten en kısa öbek. */
const FIRST_SENTENCE = /^[\s\S]+?[.!?…]+(?=\s|$)/;

/**
 * Analizin hook metni transcript'te BİREBİR varsa onu, yoksa ilk cümleyi hook sayar.
 * Noktalaması olmayan (ilk cümlesi bulunamayan) transcript'te vurgu yapılmaz — tümünü boyamaktan iyidir.
 */
export function splitTranscript(text: string, hookText?: string): TranscriptParts {
  const exact = hookText?.trim();
  if (exact) {
    const index = text.indexOf(exact);
    if (index >= 0) {
      return { before: text.slice(0, index), hook: exact, after: text.slice(index + exact.length) };
    }
  }

  const lead = text.length - text.trimStart().length;
  const match = FIRST_SENTENCE.exec(text.slice(lead));
  if (match) {
    return {
      before: text.slice(0, lead),
      hook: match[0],
      after: text.slice(lead + match[0].length),
    };
  }
  return { before: "", hook: "", after: text };
}
