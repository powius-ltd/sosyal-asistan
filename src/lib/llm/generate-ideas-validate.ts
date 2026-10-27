/**
 * `generate-ideas` KOD DOĞRULAMASI: modelin her ham fikri sunucuda denetlenir; kuralı geçmeyen fikir DÜŞER ve sebebi döner
 * (sessizce kabul yok). Saf; LLM ve DB yok. Kurallar (docs/FAZ2-PLAN.md §3, §7):
 *  - Kanıt: id'ler girdi alt kümesi; ≥ 2 FARKLI kanıt; ≥ 1'i rakip tutanı (lift ≥ 3). Havuzda ≥ 3x rakip HİÇ yoksa ≥ 2x kabul edilir ve
 *    `relaxedOutlier` ile İŞARETLENİR. Havuzda ≥ 3x varken yalnız daha zayıf rakip kanıtı seçmek geçersizdir.
 *    Rakipsiz mod (`ctx.mode = "own"`): AYNI kural, tutan KENDİ videodur (≥ 1 kendi tutanı, lift ≥ 3; havuzda yoksa ≥ 1,5x işaretli); alıntılar
 *    fikrin kendi tutan kanıtlarından birebir doğrulanır (rakip alıntısı aranmaz).
 *  - Hesap türü (`ctx.accountType` verilmişse): CTA türü hesabın önerilen CTA'ları (`ctaTypes`) dışındaysa fikir DÜŞMEZ, nota ve gerekçeye
 *    uyarı yazılır (`creator`'da satış CTA'sı); fikrin amacı (`purpose`: erişim/satış) belirlenir (karmada modelin etiketi, yoksa CTA'dan).
 *  - Hook 3–5 ve birbirinden farklı; hook türü taksonomiden (şema).
 *  - Rakip alıntıları (≤ 200 kr): fikrin kanıt listesindeki RAKİP içeriğin korpusunda birebir; bulunamayan alıntı atılır, hiç doğrulanmış
 *    alıntı kalmazsa fikir düşer.
 *  - KOPYA ENGELİ: script, açıklama taslağı ve hook'lar ile havuzdaki HERHANGİ bir rakip metni (transcript, ekran yazısı, açıklama, hook)
 *    arasındaki en uzun ortak kelime dizisi < 8 (`longestSharedWordRun`).
 *  - Dil (çalışma alanı içerik diline göre): `en`'de hook/script/açıklamada Türkçe harf (ğ ş ı İ) yok (düşer); `tr`'de hiç Türkçe'ye özgü
 *    harf içermeyen UZUN script yanlış dil şüphesidir: fikir DÜŞMEZ, nota uyarı yazılır. Açıklama taslağı yayın sınırlarını (2200 kr, 30 hashtag)
 *    aşmaz; script ≥ 15 kelime.
 *  - Brif (`ctx.briefSlotIds` verilmişse): fikir brifteki bir slota (`slotId`) bağlı olmalı; bağsız fikir DÜŞER (kreatif direktör).
 *  - Ses: `voiceTraitKeys` yalnız doğrulanmış özellik anahtarları (bilinmeyen atılır).
 *  - Kişisel anlatım (`usesPersonalStory` ya da `personalQuotes`): ≥ 1 alıntı fikrin KENDİ kanıtlarından ve kendi korpusunda birebir
 *    doğrulanmalı, yoksa fikir düşer. Doğrulanınca gerekçeye `PERSONAL_CLAIM_NOTE` eklenir, alıntılar `details.personalQuotes`'a yazılır.
 */
import "server-only";

import { LIFT_TIER_MIN, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import type { ContentLanguage } from "@/lib/domain/content-language";
import { accountTypeProfile, type AccountType } from "@/lib/domain/account-type";
import { CTA_TYPE_LABEL, durationBucketOf } from "@/lib/domain/taxonomy";
import type { IdeaDetails, PersonalQuote, RivalQuote } from "@/lib/domain/intel";
import { captionLimitProblem } from "@/lib/domain/publish";
import { focusDirectionIndex, type FocusDirection } from "@/lib/domain/weekly-plan";
import type { PlanMode } from "@/lib/insights/mode";
import { inferPurposeFromCta, purposeOfType, type SlotPurpose } from "@/lib/insights/slot-mix";
import { normalizeForMatch, wordTokens } from "@/lib/intel/normalize";
import { certaintyProblem, rivalMentionProblem } from "@/lib/llm/brief-tone";
import { checkQuote, type ContentText } from "@/lib/llm/content-text";
import type { RawIdea } from "@/lib/llm/generate-ideas-schema";
import { EVIDENCE_MIN, HOOKS_MAX, HOOKS_MIN } from "@/lib/llm/generate-ideas-schema";
import { COPY_WORD_LIMIT, hasTurkishOnlyLetters, maxSharedWithRivals, rivalTexts } from "@/lib/llm/script-rules";

/** Rakip tutanı eşiği (lift): `OUTLIER_MIN_TIER` kademesinin alt sınırı = 3. */
export const RIVAL_OUTLIER_LIFT = LIFT_TIER_MIN[OUTLIER_MIN_TIER];
/** Havuzda ≥ 3x rakip yoksa kabul edilen gevşek eşik (haftalık plan kuralıyla aynı: 2x). */
export const RIVAL_RELAXED_LIFT = LIFT_TIER_MIN[2];
/** Rakipsiz modda (kendi tutanı) havuzda ≥ 3x yoksa kabul edilen gevşek eşik: kendi "ne tuttu" eşiği (1,5x; `insights/constants` `OWN_SEED_RELAXED_LIFT`). */
export const OWN_RELAXED_LIFT = LIFT_TIER_MIN[1];
/** Rakip metniyle bu kadar ya da daha uzun ortak kelime dizisi = kopya (kural `script-rules.ts`'te; burada geriye uyumlu yeniden dışa açılır). */
export { COPY_WORD_LIMIT };
export const MIN_SCRIPT_WORDS = 15;
/** CTA'sı hesap amacına uymayan fikrin gerekçesine eklenen uyarı (fikir düşmez; insan karar verir). */
export const ctaMismatchNote = (ctaLabel: string, purposeText: string): string => `CTA önerisi (${ctaLabel}) bu hesabın amacına (${purposeText}) uymuyor: yayından önce değiştir.`;
/** Kişisel anlatım (yer, olay, geçmiş) kullanan fikrin gerekçesine eklenen onay notu. */
export const PERSONAL_CLAIM_NOTE = "Yayından önce hesap sahibi onaylamalı: kişisel anlatım.";
/** `tr` içerikte bu kadar ya da daha uzun scriptte hiç Türkçe'ye özgü harf yoksa yanlış dil şüphesi (nota yazılır, fikir düşmez). */
export const WRONG_LANGUAGE_MIN_WORDS = 25;

/** Fikre kanıt olabilecek içerik (kendi ya da rakip). */
export interface IdeaEvidenceContent extends ContentText {
  ownerHandle: string;
  isOwn: boolean;
  /** Lift (ölçülemediyse undefined; 0 değil). */
  lift?: number;
  durationSec?: number;
  hookText?: string;
  hookType?: string;
}

export type IdeaDirectionInput = Pick<FocusDirection, "group" | "value" | "label" | "rationale" | "ownTried" | "confidence">;

export interface GeneratedIdea {
  /** Türkçe kart başlığı. */
  title: string;
  /** Türkçe gerekçe ("Neden bu?"). */
  rationale: string;
  /** 3–5 İngilizce hook; `details.hookTypes` ile aynı sırada. */
  hooks: string[];
  /** Ana hook türü = ilk hook'un türü (`Idea.hookType`). */
  hookType: string;
  /** Türkçe sahne/adım maddeleri (`Idea.scriptOutline`). */
  scriptOutline: string[];
  details: IdeaDetails;
  /** Kanıtlar (girdi sırasında, tekil); `liftAtCreation` üretim anındaki lift (ölçülemediyse undefined). */
  evidence: { contentItemId: string; liftAtCreation?: number }[];
  /** Fikrin hizmet ettiği yön (`F1..`); yoksa undefined. */
  directionRef?: string;
  /** Fikrin doldurduğu brif slotu (`S1..`); brif yoksa undefined. DB'ye yazılmaz. */
  slotId?: string;
  /** Fikrin hizmet ettiği amaç (erişim/satış); hesap türü verilmediyse undefined. */
  purpose?: SlotPurpose;
  /** Kanıtın dayandığı mod (`own`: kendi tutanı; `rivals`: rakip tutanı); doğrulayıcı her zaman doldurur. */
  mode?: PlanMode;
  /** Kanıtta ≥ 3x rakip tutan yoktu, ≥ 2x ile kabul edildi: ekranda "zayıf kanıt" işareti. */
  relaxedOutlier: boolean;
  /** Fikri düşürmeyen kırpmalar (atılan alıntı, bilinmeyen ses özelliği) — Türkçe. */
  notes: string[];
}

export interface DroppedIdea {
  title: string;
  reasons: string[];
}

export type IdeaVerdict = { ok: true; idea: GeneratedIdea } | { ok: false; dropped: DroppedIdea };

export interface IdeaValidationContext {
  /** Üretilen hook/script/açıklama dili (çalışma alanı içerik dili); dil denetimi buna göre. */
  language: ContentLanguage;
  evidence: ReadonlyMap<string, IdeaEvidenceContent>;
  directions: readonly IdeaDirectionInput[];
  verifiedTraitKeys: ReadonlySet<string>;
  /** Kanıt kuralının tarafı: `rivals` (varsayılan; ≥ 1 rakip tutanı) ya da `own` (rakipsiz; ≥ 1 kendi tutanı). */
  mode?: PlanMode;
  /** Hesap türü: verilirse CTA uyumu denetlenir ve fikrin amacı belirlenir; verilmezse ikisi de atlanır. */
  accountType?: AccountType;
  /** Kreatif direktör brifi verildiyse slot kimlikleri (`S1..`): her fikir birine bağlanmak zorundadır; verilmezse denetim yok. */
  briefSlotIds?: ReadonlySet<string>;
  /** Brif slotu (`S1..`) → dayanağının güven derecesi: düşük/orta dayanakta gerekçede kesinlik sözü yoktur (verilmezse yalnız yönün güveni). */
  slotConfidence?: ReadonlyMap<string, string>;
}

/** Türkçe metinde uzun bir parçada mutlaka görülen harfler (ç ğ ı İ ö ş ü). */
const TURKISH_LETTERS = /[çÇğĞıİöÖşŞüÜ]/u;

/** Kanıt kuralının tarafı: rakip modunda rakip videosu, rakipsiz modda kendi videosu. */
const onSide = (content: IdeaEvidenceContent, mode: PlanMode): boolean => (mode === "own" ? content.isOwn : !content.isOwn);
const isOutlier = (content: IdeaEvidenceContent | undefined, mode: PlanMode): boolean =>
  content !== undefined && onSide(content, mode) && content.lift !== undefined && content.lift >= RIVAL_OUTLIER_LIFT;

/** Havuzda (tüm kanıt içerikleri) ≥ 3x tutan var mı (kuralın tarafında): gevşek eşiğin ön koşulu. */
export const poolHasStrongWinner = (evidence: ReadonlyMap<string, IdeaEvidenceContent>, mode: PlanMode = "rivals"): boolean => [...evidence.values()].some((content) => isOutlier(content, mode));
/** Rakip modunda `poolHasStrongWinner` (geriye uyumluluk adı). */
export const poolHasStrongRival = (evidence: ReadonlyMap<string, IdeaEvidenceContent>): boolean => poolHasStrongWinner(evidence, "rivals");

export function validateIdea(raw: RawIdea, ctx: IdeaValidationContext): IdeaVerdict {
  const reasons: string[] = [];
  const notes: string[] = [];

  // ---- Kanıt
  const requested = [...new Set(raw.evidenceIds)];
  const unknown = requested.filter((id) => !ctx.evidence.has(id));
  if (unknown.length > 0) reasons.push(`girdide olmayan kanıt id'si: ${unknown.join(", ")}`);
  const known = requested.filter((id) => ctx.evidence.has(id));
  if (known.length < EVIDENCE_MIN) reasons.push(`en az ${EVIDENCE_MIN} farklı (girdideki) kanıt içeriği gerekli (${known.length} var)`);
  const mode: PlanMode = ctx.mode ?? "rivals";
  const sideLabel = mode === "own" ? "kendi tutanı" : "rakip tutanı";
  // Kuralın tarafındaki kanıtlar: rakip modunda rakip videoları (alıntı da bunlardan), rakipsiz modda kendi videoları.
  const rivals = known.map((id) => ctx.evidence.get(id) as IdeaEvidenceContent).filter((content) => onSide(content, mode));
  let relaxedOutlier = false;
  if (known.length >= EVIDENCE_MIN && !rivals.some((content) => isOutlier(content, mode))) {
    const relaxedLift = mode === "own" ? OWN_RELAXED_LIFT : RIVAL_RELAXED_LIFT;
    const relaxedOk = !poolHasStrongWinner(ctx.evidence, mode) && rivals.some((content) => content.lift !== undefined && content.lift >= relaxedLift);
    if (relaxedOk) relaxedOutlier = true;
    else reasons.push(`kanıtlar arasında ${sideLabel} (lift ≥ ${RIVAL_OUTLIER_LIFT}) yok${poolHasStrongWinner(ctx.evidence, mode) ? " (havuzda var; birini kanıt göstermeli)" : ` (havuzda da yok; en az ${relaxedLift}x gerekir)`}`);
  }

  // ---- Hook (sayı şemada da zorlanır; burada doğrudan çağrılan doğrulayıcı için tekrar denetlenir)
  if (raw.hooks.length < HOOKS_MIN || raw.hooks.length > HOOKS_MAX) reasons.push(`hook sayısı ${HOOKS_MIN}–${HOOKS_MAX} olmalı (${raw.hooks.length} var)`);
  const hookKeys = raw.hooks.map((hook) => normalizeForMatch(hook.text));
  if (new Set(hookKeys).size !== hookKeys.length) reasons.push("hook'lar birbirinin aynısı");

  // ---- Brif slotu: bağsız fikir düşer
  if (ctx.briefSlotIds !== undefined && (raw.slotId === undefined || !ctx.briefSlotIds.has(raw.slotId))) reasons.push(`brifteki bir slota bağlı değil (slotId: ${raw.slotId ?? "yok"}; geçerli: ${[...ctx.briefSlotIds].join(", ")})`);

  // ---- Alıntılar (yalnız fikrin rakip kanıtlarından, birebir)
  const rivalIds = new Set(rivals.map((content) => content.id));
  const quotes: RivalQuote[] = [];
  for (const quote of raw.quotes) {
    const check = rivalIds.has(quote.contentId) ? checkQuote(ctx.evidence.get(quote.contentId), quote.text) : ({ ok: false, reason: `alıntının içeriği bu fikrin ${mode === "own" ? "kendi tutan" : "rakip"} kanıtlarında değil` } as const);
    if (check.ok) {
      if (!quotes.some((kept) => kept.contentItemId === quote.contentId && kept.text === quote.text)) {
        quotes.push({ contentItemId: quote.contentId, ownerHandle: ctx.evidence.get(quote.contentId)?.ownerHandle, text: quote.text });
      }
    } else notes.push(`Alıntı atıldı (${quote.contentId}): ${check.reason}.`);
  }
  if (quotes.length === 0) reasons.push(mode === "own" ? "doğrulanmış kendi tutan alıntısı yok" : "doğrulanmış rakip alıntısı yok");

  // ---- Kişisel anlatım: dayanak fikrin KENDİ kanıtlarından, kendi korpusunda birebir (yer/olay/geçmiş uydurulmasın)
  const ownIds = new Set(known.filter((id) => ctx.evidence.get(id)?.isOwn));
  const personalQuotes: PersonalQuote[] = [];
  for (const quote of raw.personalQuotes ?? []) {
    const check = ownIds.has(quote.contentId) ? checkQuote(ctx.evidence.get(quote.contentId), quote.text) : ({ ok: false, reason: "kişisel alıntının içeriği bu fikrin kendi kanıtlarında değil" } as const);
    if (check.ok) {
      if (!personalQuotes.some((kept) => kept.contentItemId === quote.contentId && kept.text === quote.text)) {
        personalQuotes.push({ contentItemId: quote.contentId, ownerHandle: ctx.evidence.get(quote.contentId)?.ownerHandle, text: quote.text });
      }
    } else notes.push(`Kişisel alıntı atıldı (${quote.contentId}): ${check.reason}.`);
  }
  const usesPersonalStory = raw.usesPersonalStory === true || (raw.personalQuotes?.length ?? 0) > 0;
  if (usesPersonalStory && personalQuotes.length === 0) reasons.push("kişisel anlatım var ama kanıt listesindeki kendi içeriklerinden doğrulanmış alıntı yok");

  // ---- Kopya engeli: script + açıklama + hook'lar ↔ HER rakip metni
  const produced = [raw.script, raw.captionDraft, ...raw.hooks.map((hook) => hook.text)];
  const { maxSharedWords, copiedFrom } = maxSharedWithRivals(produced, rivalTexts(ctx.evidence.values()));
  if (maxSharedWords >= COPY_WORD_LIMIT) reasons.push(`kopya: ${copiedFrom} içeriğiyle ${maxSharedWords} kelimelik ortak dizi (sınır < ${COPY_WORD_LIMIT})`);

  // ---- Dil ve biçim
  if (hasTurkishOnlyLetters(ctx.language, produced)) reasons.push("hook/script/açıklama İngilizce olmalı: Türkçe harf bulundu");
  const scriptWords = wordTokens(raw.script).length;
  if (ctx.language === "tr" && scriptWords >= WRONG_LANGUAGE_MIN_WORDS && !TURKISH_LETTERS.test(raw.script)) {
    notes.push(`Script Türkçe görünmüyor (${scriptWords} kelimede Türkçe'ye özgü harf yok): yanlış dilde olabilir, yayından önce kontrol et.`);
  }
  if (scriptWords < MIN_SCRIPT_WORDS) reasons.push(`script çok kısa (en az ${MIN_SCRIPT_WORDS} kelime)`);
  const captionProblem = captionLimitProblem(raw.captionDraft);
  if (captionProblem) reasons.push(`açıklama taslağı: ${captionProblem}`);

  // ---- Panel metni dili: rakipsiz hesapta rakip anılmaz; düşük/orta güvenli dayanakta kesinlik sözü yok
  const panelFields: [string, string][] = [["title", raw.title], ["rationale", raw.rationale], ["topic", raw.topic], ...raw.outline.map((step, index): [string, string] => [`outline.${index}`, step])];
  if (mode === "own") for (const [field, text] of panelFields) reasons.push(...[rivalMentionProblem(field, text)].filter((p): p is string => p !== undefined));
  const refConfidence = ctx.directions[focusDirectionIndex(raw.directionRef) ?? -1]?.confidence;
  const slotConfidence = raw.slotId === undefined ? undefined : ctx.slotConfidence?.get(raw.slotId);
  for (const confidence of new Set([refConfidence, slotConfidence])) reasons.push(...[certaintyProblem("rationale", raw.rationale, confidence)].filter((p): p is string => p !== undefined));

  if (reasons.length > 0) return { ok: false, dropped: { title: raw.title, reasons } };

  // ---- Ses özellikleri ve yön
  const voiceTraitKeys = [...new Set(raw.voiceTraitKeys)].filter((key) => ctx.verifiedTraitKeys.has(key));
  if (voiceTraitKeys.length < new Set(raw.voiceTraitKeys).size) notes.push("Doğrulanmamış/bilinmeyen ses özelliği anahtarları atıldı.");
  const directionIndex = focusDirectionIndex(raw.directionRef);
  const direction = directionIndex === undefined ? undefined : ctx.directions[directionIndex];

  // ---- Hesap türü: CTA uyumu (düşürmez) ve amaç. CTA denetimi yalnız satışsız türde (satış CTA'sı önerilmez); `none` (CTA yok) uygundur.
  let rationale = raw.rationale.trim();
  let purpose: SlotPurpose | undefined;
  if (ctx.accountType !== undefined) {
    const profile = accountTypeProfile(ctx.accountType);
    if (profile.contentMix.sales === 0 && raw.ctaType !== "none" && !profile.ctaTypes.includes(raw.ctaType)) {
      const warning = ctaMismatchNote(CTA_TYPE_LABEL[raw.ctaType], "erişim ve takipçi: satış CTA'sı önerilmez");
      notes.push(warning);
      rationale = `${rationale} ${warning}`;
    }
    purpose = purposeOfType(ctx.accountType) ?? raw.purpose ?? inferPurposeFromCta(raw.ctaType);
  }

  const details: IdeaDetails = {
    topic: raw.topic,
    frame: raw.frame,
    ctaType: raw.ctaType,
    targetDurationSec: raw.targetDurationSec,
    durationBucket: durationBucketOf(raw.targetDurationSec),
    script: raw.script,
    scriptLanguage: ctx.language,
    captionDraft: raw.captionDraft,
    hookTypes: raw.hooks.map((hook) => hook.type),
    quotes,
    ...(personalQuotes.length === 0 ? {} : { personalQuotes }),
    voiceTraitKeys,
    ...(direction === undefined ? {} : { ownTried: direction.ownTried }),
    maxSharedWords,
  };
  // Kişisel anlatım kullanan fikir insan onayına işaretlenir (kartta "Neden bu?" metninde görünür).
  if (personalQuotes.length > 0) {
    notes.push(PERSONAL_CLAIM_NOTE);
    rationale = `${rationale} ${PERSONAL_CLAIM_NOTE}`;
  }
  return {
    ok: true,
    idea: {
      title: raw.title.trim(),
      rationale,
      hooks: raw.hooks.map((hook) => hook.text.trim()),
      hookType: raw.hooks[0].type, // hook sayısı denetlendi (≥ 3)
      scriptOutline: raw.outline.map((step) => step.trim()),
      details,
      evidence: known.map((id) => ({ contentItemId: id, liftAtCreation: ctx.evidence.get(id)?.lift })),
      directionRef: direction === undefined ? undefined : raw.directionRef,
      ...(ctx.briefSlotIds === undefined ? {} : { slotId: raw.slotId }),
      ...(purpose === undefined ? {} : { purpose }),
      mode,
      relaxedOutlier,
      notes,
    },
  };
}
