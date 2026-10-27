import { LOCALE } from "@/lib/format";

const BACK_VOWELS = new Set(["a", "ı", "o", "u"]);
const FRONT_VOWELS = new Set(["e", "i", "ö", "ü"]);

/**
 * Ada yönelme (-e hâli) eki getirir: "Maskot" → "Maskot'a", "Ali" → "Ali'ye", "Bora" → "Bora'ya", "Zeynep" → "Zeynep'e".
 * Ünlü uyumu adın SON ünlüsüne bakar (kalın a ı o u → a, ince e i ö ü → e); ad ünlüyle bitiyorsa kaynaştırma "y" eklenir.
 * Maskot adı yapılandırılabilir (`MASKOT_ADI`) olduğundan başlıkta sabit "'a" yazılamaz. Ünlüsüz ya da tanınmayan adda "'e" yerine
 * güvenli varsayılan "'a" kullanılır (çoğu yabancı kökenli ad kalın ünlüyle biter). Saf.
 */
export function withDative(name: string): string {
  const lower = name.toLocaleLowerCase(LOCALE);
  const chars = [...lower];
  const lastVowel = [...chars].reverse().find((char) => BACK_VOWELS.has(char) || FRONT_VOWELS.has(char));
  const front = lastVowel !== undefined && FRONT_VOWELS.has(lastVowel);
  const last = chars.at(-1);
  const endsWithVowel = last !== undefined && (BACK_VOWELS.has(last) || FRONT_VOWELS.has(last));
  return `${name}'${endsWithVowel ? "y" : ""}${front ? "e" : "a"}`;
}
