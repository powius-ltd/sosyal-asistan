/**
 * Mock plan / fikir metinlerinin düz dil parçaları (D2-03): örnek üreteçler (`weekly-plan.ts`, `ideas.ts`) panel jargonu ("baz çizgisi",
 * "medyan lift", "hook") yazmaz; çarpan cümlesi ve güven söz dağarcığı `plain-language.ts` / `plain-language-plan.ts`'ten gelir.
 */
import { liftPhrase } from "@/lib/plain-language";
import { OPENING_PLAIN } from "@/lib/plain-language-plan";

/** Açılış tarzına göre "neden tuttu" parçası; her tür aynı cümleyi taşımasın (hepsi "sorunu adlandırıyor" demesin). */
const OPENING_WHY = new Map<string, string>([
  ["question", "izleyiciye doğrudan bir soru soruyor"],
  ["list", "ne alacağını baştan sayıyor"],
  ["confession", "içten bir itirafla başlıyor"],
  ["shock_stat", "şaşırtıcı bir rakamla dikkat çekiyor"],
  ["pov", "izleyiciyi sahnenin içine alıyor"],
  ["mistake_warning", "sık yapılan bir hatayı uyarıyor"],
  ["comparison", "iki şeyi yan yana koyuyor"],
  ["barrier_removal", "izleyicinin çekincesini baştan kaldırıyor"],
  ["bold_claim", "cesur bir iddiayla başlıyor"],
  ["story_open", "küçük bir hikâyeyle başlıyor"],
  ["callout", "izleyiciye doğrudan seslenerek başlıyor"],
  ["affirmation", "olumlayıcı bir cümleyle başlıyor"],
  ["teaching_quote", "bir öğreti ya da alıntıyla başlıyor"],
]);

/** Tutan videonun "neden tuttu" cümlesi: "Açılış cümlesi izleyiciye doğrudan bir soru soruyor; video normalinin 19,1 katı izlendi." */
export function winnerWhy(hookType: string, lift: number | undefined): string {
  const what = OPENING_WHY.get(hookType) ?? "dikkat çekici bir açılışla başlıyor";
  const times = liftPhrase(lift);
  return `${OPENING_PLAIN.lead} ${what}${times === undefined ? "." : `; video ${times}.`}`;
}
