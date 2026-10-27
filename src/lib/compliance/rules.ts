/**
 * Uyum kural tablosu. Her kural: hangi bölge, ne zaman uygulanır (`appliesTo`), karşılandı mı (`isSatisfied`),
 * ciddiyet (fail = onay/onaya gönderme engellenir, warn = uyarı) ve Türkçe mesaj.
 *
 * Kural tabanlıdır (LLM yok). Amaç yayın öncesi HATIRLATMA; hukuki tavsiye değildir. Kurallar sözleşmedir:
 * değişiklik sıralı ajanın işidir (AGENTS.md "Dosya sahipliği"), her kural `check.test.ts`'te sınanır.
 *
 * TR kaynakları (`docs/RAKIP-ANALIZI.md` §4.1): Ticaret Bakanlığı Ticari Reklam ve Haksız Ticari Uygulamalar
 * düzenlemesi, yürürlük 1 Ağustos 2026 [K30]; etkileyici kılavuzu: ibare "daha fazla oku" arkasında kalmaz, ilk
 * bakışta görünür [K31]; "Reklam"/"Tanıtım" ibaresi + reklam veren adı ya da "@… tarafından sağlandı", YZ karakter
 * için açık beyan [K32]. K32 hukuk-dışı bir blogdur → metinler resmî kaynaktan doğrulanmalı [DY].
 * US kaynağı: FTC Endorsement Guides (16 CFR Part 255) "clear and conspicuous" ilkesi; docs/RAKIP-ANALIZI.md'de
 * yer almaz, ayrıca doğrulanmalı [DY]. ABD'de genel bir YZ etiketi zorunluluğu yok; uyarı "en iyi uygulama"dır.
 *
 * İbare konumu (karar, 2026-09-30): TR ve US ibaresi açıklamanın ilk `DISCLOSURE_WINDOW` (100) kod noktasında aranır;
 * Instagram açıklamayı yaklaşık 125 karakterde "daha fazla" ile keser (sayı resmî kaynaktan doğrulanmadı [DY]).
 * "Ad:" biçimi beyan SAYILMAZ ("Ad: Ayşe" gibi kullanımlarla karışır). Olumsuz kalıplar ("Not sponsored", "Not an ad",
 * "Ad-free", TR "reklam değil", "yapay zekâ ile üretilmedi") beyan sayılmaz.
 */
import type { ComplianceInput, ComplianceSeverity } from "@/lib/domain/compliance";
import {
  CAPTION_TRUNCATION_APPROX,
  DISCLOSURE_WINDOW,
  containsWord,
  disclosureHeadOf,
  foldTurkish,
  wordsOf,
} from "@/lib/compliance/normalize";

/** Bir açıklamanın bir kez hesaplanmış görünümü (kurallar aynı normalizasyonu paylaşır). */
export interface CaptionView {
  /** Ham açıklama. */
  text: string;
  /** İbare penceresi: açıklamanın ilk `DISCLOSURE_WINDOW` kod noktası (ham). */
  head: string;
  /** Tüm açıklama, `foldTurkish` ile. */
  folded: string;
  /** İbare penceresinin kelimeleri, `foldTurkish` + `wordsOf`. */
  headWords: string[];
}

export interface ComplianceRule {
  id: string;
  region: "TR" | "US";
  severity: ComplianceSeverity;
  appliesTo(input: ComplianceInput): boolean;
  /** true = kural karşılandı (bulgu üretilmez). */
  isSatisfied(view: CaptionView, input: ComplianceInput): boolean;
  message: string;
  hint?: string;
}

// ---- TR: "Reklam"/"Tanıtım" ibaresi (ilk `DISCLOSURE_WINDOW` kod noktası). Kelime tam eşleşir (+ "-dır/-dir/-i" ekleri);
// "reklamcılık" ibare değildir. Hemen ardından "değil/değildir" gelen kelime ibare sayılmaz ("Reklam değil, tavsiye").
const TR_AD_LABEL_WORDS = new Set(["reklam", "reklamdir", "tanitim", "tanitimdir", "tanitimi"]);
const TR_NEGATION_WORD = /^degil(?:dir)?$/;

function hasTrAdLabel(words: readonly string[]): boolean {
  return words.some((word, i) => TR_AD_LABEL_WORDS.has(word) && !TR_NEGATION_WORD.test(words[i + 1] ?? ""));
}

// ---- TR: reklam veren "@marka tarafından sağlandı" kalıbı (fold sonrası).
const TR_PROVIDED_BY = /tarafindan\s+(?:saglandi|saglanmistir|sunulmustur|sunuldu|desteklenmistir|desteklendi)/;

// ---- TR: YZ beyanı (fold sonrası): "yapay zekâ/YZ ile/tarafından üretildi|oluşturuldu|hazırlandı…", "yapay zekâ üretimi".
// Olumsuzluk beyan değildir: fiil kökünü "-me/-ma" ya da "-eme/-ama" izlerse ("üretilmedi", "oluşturulmamıştır",
// "yapılamadı") ya da arada/sonda "değil" varsa ("yz ile değil elle üretildi", "yapay zekâ üretimi değil") eşleşmez.
const TR_AI_DISCLOSURES: readonly RegExp[] = [
  /(?:^|[^\p{L}\p{N}])(?:yapay zeka|yz)\s+(?:ile|tarafindan)\s+(?:(?!degil(?:dir)?\s)\p{L}+\s+){0,2}?(?:uretil|olusturul|hazirlan|yapil|kurgulan|gelistiril)(?![ae]?m[ae])/u,
  /(?:^|[^\p{L}\p{N}])(?:yapay zeka|yz)\s+(?:uretimi|urunu|icerigi|kullanilarak)(?![\p{L}])(?!\s+degil)/u,
];

// ---- US: ücretli iş birliği ibaresi (ilk `DISCLOSURE_WINDOW` kod noktası). Önce olumsuz kalıplar silinir ("Not sponsored",
// "Not an ad", "no paid …", "Ad-free"), sonra ibare desenleri aranır. "Ad:" biçimi beyan SAYILMAZ (karar).
const US_NEGATION =
  /(?:^|[^\p{L}])(?:not|no|non)[\s-]+(?:an?\s+)?(?:ad|sponsored|paid)(?![\p{L}])|(?:^|[^\p{L}])ad[\s-]free(?![\p{L}])/giu;
const US_PAID: readonly RegExp[] = [
  /(?:^|[^\p{L}\p{N}_#])#(?:ad|sponsored|paidpartnership)(?![\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:sponsored|paid partnership|advertisement)(?![\p{L}\p{N}_])/iu,
  /^\s*ad\s*(?:[|·•–—-]|$)/iu,
  /[(\[]\s*ad\s*[)\]]/iu,
];

function hasUsPaidDisclosure(head: string): boolean {
  const cleaned = head.replace(US_NEGATION, " ");
  return US_PAID.some((pattern) => pattern.test(cleaned));
}

// ---- US: YZ beyanı: "AI-generated", "made with AI" (+ yakın biçimler ve hashtag'ler).
const US_AI_DISCLOSURE =
  /(?:^|[^\p{L}\p{N}_])(?:ai[\s-]generated|ai[\s-]made|(?:made|created|generated|produced)\s+(?:with|by|using)\s+ai|#aigenerated|#madewithai)(?![\p{L}\p{N}_])/iu;

export const COMPLIANCE_RULES: readonly ComplianceRule[] = [
  {
    // K30, K31, K32: ücretli iş birliğinde "Reklam"/"Tanıtım" ibaresi ilk bakışta görünmeli (ilk 100 karakter).
    id: "tr.ad-label",
    region: "TR",
    severity: "fail",
    appliesTo: (input) => input.isPaidPartnership,
    isSatisfied: (view) => hasTrAdLabel(view.headWords),
    message: `Ücretli iş birliğinde açıklamanın ilk ${DISCLOSURE_WINDOW} karakterinde “Reklam” ya da “Tanıtım” ibaresi olmalı.`,
    hint: `İbareyi en başa yaz; Instagram açıklamayı yaklaşık ${CAPTION_TRUNCATION_APPROX} karakterde “daha fazla” ile keser, ibare kesilen kısımda kalmamalı.`,
  },
  {
    // K32: ibarenin yanında reklam veren adı ya da "@… tarafından sağlandı" ifadesi. Ad açıklamada herhangi bir yerde geçebilir
    // (kelime sınırıyla: "Ece" adı "gecelik" içinde sayılmaz).
    id: "tr.advertiser",
    region: "TR",
    severity: "warn",
    appliesTo: (input) => input.isPaidPartnership,
    isSatisfied: (view, input) => {
      const advertiser = input.advertiserName ? foldTurkish(input.advertiserName).replace(/\s+/g, " ").trim() : "";
      return TR_PROVIDED_BY.test(view.folded) || containsWord(view.folded, advertiser);
    },
    message: "Reklam veren adı ya da “@… tarafından sağlandı” ifadesi açıklamada görünmüyor.",
    hint: "Açıklamaya reklam verenin adını ekle ya da “@marka tarafından sağlandı” yaz.",
  },
  {
    // K30, K32: insan gibi görünen YZ içeriği için "açık, anlaşılır" beyan.
    id: "tr.ai-disclosure",
    region: "TR",
    severity: "fail",
    appliesTo: (input) => input.isAiGenerated,
    isSatisfied: (view) => TR_AI_DISCLOSURES.some((pattern) => pattern.test(view.folded)),
    message: "Yapay zekâ ile üretilmiş içerik için açık bir beyan yok.",
    hint: "Açıklamaya “Yapay zekâ ile üretildi” (ya da “YZ ile üretildi”) yaz.",
  },
  {
    // FTC Endorsement Guides: ücretli iş birliği açık ve ilk bakışta görünür olmalı (ilk 100 karakter).
    id: "us.paid-disclosure",
    region: "US",
    severity: "fail",
    appliesTo: (input) => input.isPaidPartnership,
    isSatisfied: (view) => hasUsPaidDisclosure(view.head),
    message: `ABD (FTC) için ücretli iş birliğinde ilk ${DISCLOSURE_WINDOW} karakterde #ad, #sponsored, “Sponsored”, “Paid partnership” ya da “(Ad)” gibi açık bir ibare olmalı.`,
    hint: `İbareyi en başa yaz (“#ad” ya da “Paid partnership”); Instagram açıklamayı yaklaşık ${CAPTION_TRUNCATION_APPROX} karakterde “daha fazla” ile keser.`,
  },
  {
    // ABD'de genel YZ etiketi zorunluluğu yok; en iyi uygulama olarak uyarı.
    id: "us.ai-disclosure",
    region: "US",
    severity: "warn",
    appliesTo: (input) => input.isAiGenerated,
    isSatisfied: (view) => US_AI_DISCLOSURE.test(view.text),
    message: "ABD için yapay zekâ ile üretilmiş içeriğe “AI-generated” ya da “made with AI” ifadesi eklenmesi önerilir.",
    hint: "Açıklamaya “AI-generated” yaz.",
  },
];

/** Görünümü kurar: normalizasyon her kural için tekrarlanmaz. */
export function makeCaptionView(caption: string): CaptionView {
  // Boşluk dizileri tek boşluğa iner: "yapay   zekâ" ya da satır sonu kalıbı bozmaz.
  const folded = foldTurkish(caption).replace(/\s+/g, " ");
  const head = disclosureHeadOf(caption);
  return { text: caption, head, folded, headWords: wordsOf(foldTurkish(head)) };
}
