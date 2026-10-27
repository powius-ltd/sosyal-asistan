/**
 * Not gövdesini "ilk cümle" ve "gerisi" diye böler: kartta yalnız ilk cümle görünür, gerisi "Neden?" içindedir. Cümle sonu: `. ! ? …`
 * ardından boşluk ve BÜYÜK harf/rakam/tırnak ("3. gün", "%47,9 arttı." gibi iç noktalar bölmez). Tek cümle → `rest` boş.
 */
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“'‘(])/u;

export function splitLeadSentence(body: string): { lead: string; rest: string } {
  const text = body.trim();
  const match = SENTENCE_BREAK.exec(text);
  if (match === null) return { lead: text, rest: "" };
  return { lead: text.slice(0, match.index).trim(), rest: text.slice(match.index + match[0].length).trim() };
}
