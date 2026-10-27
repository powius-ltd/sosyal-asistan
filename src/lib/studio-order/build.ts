/**
 * Fiş kurucu (SAF; veri okumaz, dosya yazmaz): bir plan öğesi + fikir + brif slotu + dayanak videoların analizi → sipariş fişi.
 * Mod hesaptan gelir (`accounts.ts`), dolu alandan tahmin edilmez. Senaryo modunda metin fikrin script'idir (DEĞİŞTİRİLMEZ; seçili açılış
 * script'in başladığı hook'tur, başlamıyorsa nota yazılır); konu modunda konu + ana hat (önerilen açılış + taslak maddeleri) gider; kullanıcı açılışı fişte değiştirebilir.
 * Dayanak video yoksa `ornek_video` YAZILMAZ; ölçülmemiş biçim alanı YAZILMAZ. "Neden tuttu", ölçüm ve takvim kararı fişe girmez.
 */
import type { LiftGroupStat } from "@/lib/domain/insights";
import type { Idea } from "@/lib/domain/intel";
import type { DurationBucket } from "@/lib/domain/taxonomy";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import { safeExternalUrl } from "@/lib/safe-url";
import { foldTurkish } from "@/lib/text";
import { studioAccountOf, type StudioAccount } from "@/lib/studio-order/accounts";
import { suggestDuration } from "@/lib/studio-order/duration";
import { buildFormatCard, type CardAnalysis } from "@/lib/studio-order/format-card";
import type { Ticket } from "@/lib/studio-order/schema";
import { istanbulStamp } from "@/lib/studio-order/time";

/** Fikrin dayandığı bir tutan video (kendi ya da rakip) ve varsa analizi. */
export interface EvidenceVideo {
  contentItemId: string;
  url?: string;
  ownerKind: "own" | "competitor";
  durationSec?: number;
  analysis?: CardAnalysis;
  /** Fikir üretildiği andaki lift; dayanak sıralaması için. */
  lift?: number;
}

export interface BuildInput {
  panelSlug: string;
  /** Hesap doğrudan verilirse stüdyo tablosuna bakılmaz (uygulama içi fiş: stüdyoda tanımsız hesap). */
  account?: StudioAccount;
  /** Planın haftası (Pazartesi, YYYY-AA-GG). */
  planWeek: string;
  idea: Idea;
  position?: number;
  /** Planın slot saati (UTC ISO). */
  slotAt?: string;
  briefSlot?: string;
  brief?: Pick<CreativeBrief, "slots" | "testVariable">;
  evidence: readonly EvidenceVideo[];
  ownDurationGroups: readonly LiftGroupStat<DurationBucket>[];
}

export type BuildResult = { ok: true; ticket: Ticket; note: string } | { ok: false; reason: string };

/** Plan öğesinin fişteki yeri: brif slot kimliği, yoksa `P<sıra>` (SPEC açık soru (a)). */
export function slotOf(input: Pick<BuildInput, "briefSlot" | "position">): string | undefined {
  if (input.briefSlot) return input.briefSlot;
  return input.position === undefined ? undefined : `P${input.position}`;
}

export function orderIdOf(studioSlug: string, planWeek: string, slot: string): string {
  return `${studioSlug}-${planWeek}-${slot.toLowerCase()}`;
}

/** "Spor tarihi" → "spor-tarihi" (kayıt için sütun etiketi). */
function pillarSlug(text: string): string {
  return foldTurkish(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const squash = (text: string): string => foldTurkish(text).replace(/\s+/g, " ").trim();

/** Script'in başladığı hook; hiçbiriyle başlamıyorsa ilk hook (ve `matched: false`). */
export function chooseOpening(hooks: readonly string[], script: string | undefined): { hook: string; matched: boolean } | undefined {
  if (hooks.length === 0) return undefined;
  if (script !== undefined) {
    const body = squash(script);
    const hit = hooks.find((hook) => squash(hook) !== "" && body.startsWith(squash(hook)));
    if (hit !== undefined) return { hook: hit, matched: true };
  }
  return { hook: hooks[0], matched: false };
}

/** "Yorumlara SEMİNER yaz" / "comment REST" → kelime; bulunamazsa undefined (fikirde kelime alanı yok). */
export function extractCtaWord(...texts: (string | undefined)[]): string | undefined {
  const pattern = /(?:[Yy]orum(?:lara|a)?|[Cc]omment)\s+["“']?([A-ZÇĞİÖŞÜ]{3,})["”']?/u;
  for (const text of texts) {
    const hit = text === undefined ? undefined : pattern.exec(text);
    if (hit) return hit[1];
  }
  return undefined;
}

function pickReference(evidence: readonly EvidenceVideo[]): EvidenceVideo | undefined {
  const usable = evidence.filter((e) => safeExternalUrl(e.url) !== undefined);
  const rank = (e: EvidenceVideo): number => (e.ownerKind === "competitor" ? 2 : 0) + (e.analysis?.status === "ok" ? 1 : 0);
  return [...usable].sort((a, b) => rank(b) - rank(a) || (b.lift ?? 0) - (a.lift ?? 0))[0];
}

function targetLine(input: BuildInput, hasRivalEvidence: boolean): string | undefined {
  const slot = input.brief?.slots.find((s) => s.slotId === input.briefSlot);
  if (slot?.decision === "test") {
    const variable = input.brief?.testVariable;
    return `test: ${variable ? `${variable.kind} ${variable.value}`.trim() : "deneme"}${slot.testValue ? ` (${slot.testValue})` : ""}`;
  }
  if (slot?.decision === "adapt" || hasRivalEvidence) return "uyarla";
  return undefined;
}

export function buildTicket(input: BuildInput): BuildResult {
  const account = input.account ?? studioAccountOf(input.panelSlug);
  const { idea } = input;
  const slot = slotOf(input);
  if (slot === undefined) return { ok: false, reason: "Plan sırası ve slot yok (yalnız plana girmiş fikir sipariş olur)." };
  if (input.slotAt === undefined) return { ok: false, reason: "Plan öğesinin slot saati yok; istenen_saat yazılamaz." };

  const details = idea.details;
  const opening = chooseOpening(idea.hooks, details.script);
  const notes: string[] = [`Fikir: ${idea.title}`];
  if (opening) {
    notes.push(`${opening.matched ? "Seçili açılış" : "Önerilen açılış"}: ${opening.hook}`);
    const others = idea.hooks.filter((hook) => hook !== opening.hook);
    if (others.length > 0) notes.push(`Diğer açılış adayları: ${others.join(" · ")}`);
    if (account.mode === "senaryo" && !opening.matched) notes.push("Not: senaryo bu açılışlardan hiçbiriyle başlamıyor; metin olduğu gibi gönderildi.");
  }

  let senaryo: string | undefined;
  let konu: string | undefined;
  let anaHat: string[] | undefined;
  if (account.mode === "senaryo") {
    senaryo = details.script?.trim();
    if (!senaryo) return { ok: false, reason: "Fikrin script'i yok; senaryo modunda metin hazır olmalı." };
  } else {
    konu = (details.topic ?? idea.title).trim();
    const outline = idea.scriptOutline.map((line) => line.trim()).filter((line) => line !== "");
    if (outline.length === 0 && !opening) return { ok: false, reason: "Fikrin ana hattı (taslak maddeleri) ve açılışı yok; konu modunda ana hat zorunlu." };
    anaHat = [...(opening ? [`${opening.matched ? "Seçili açılış" : "Önerilen açılış"}: ${opening.hook}`] : []), ...outline];
    if (details.scriptLanguage !== undefined && details.scriptLanguage !== "tr") {
      notes.push(`Not: fikrin senaryosu ${details.scriptLanguage} dilinde; konu modunda gönderilmedi, konu ve ana hat Türkçe alanlardan alındı.`);
    }
  }
  if ((details.personalQuotes?.length ?? 0) > 0) notes.push("Dikkat: fikir kişisel anlatım içeriyor; yayından önce hesap sahibinin onayı gerekir.");

  const reference = pickReference(input.evidence);
  const card = reference ? buildFormatCard(reference.analysis, reference.durationSec) : undefined;
  if (reference && card === undefined) notes.push("Biçim kartı yok: örnek videonun analizi yok ya da ölçülmüş alan içermiyor.");
  const rivalSecs = input.evidence.filter((e) => e.ownerKind === "competitor" && e.durationSec !== undefined).map((e) => e.durationSec as number);
  const duration = suggestDuration({ rivalSecs, ideaTargetSec: details.targetDurationSec, ownGroups: input.ownDurationGroups });
  const hedef = targetLine(input, input.evidence.some((e) => e.ownerKind === "competitor"));
  const briefSlot = input.brief?.slots.find((s) => s.slotId === input.briefSlot);
  const cta = extractCtaWord(details.script, details.captionDraft);

  const ticket: Ticket = {
    siparis_id: orderIdOf(account.studioSlug, input.planWeek, slot),
    fikir_id: idea.id,
    plan_hafta: input.planWeek,
    slot,
    hesap: account.studioSlug,
    mod: account.mode,
    sutun: briefSlot?.pillar ?? (pillarSlug(details.topic ?? idea.title) || "genel"),
    istenen_saat: istanbulStamp(input.slotAt),
    onay: false,
    durum: "taslak",
    ...(hedef ? { hedef } : {}),
    ...(duration ? { hedef_sure_sn: duration.sec, hedef_sure_gerekce: duration.reason } : {}),
    ...(cta ? { cta } : {}),
    ...(konu !== undefined ? { konu, ana_hat: anaHat } : {}),
    ...(senaryo !== undefined ? { senaryo } : {}),
    ...(reference ? { ornek_video: { url: safeExternalUrl(reference.url) as string, ...(card ? { bicim: card } : {}) } } : {}),
  };
  return { ok: true, ticket, note: notes.join("\n") };
}
