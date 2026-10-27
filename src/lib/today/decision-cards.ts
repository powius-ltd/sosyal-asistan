/**
 * Karar kartı üreticileri: her tür tek fonksiyon, kendi verisi okunamadıysa (undefined) hiç kart çıkmaz. Cümleler Genel bakışın
 * "senden beklediğim" satırlarından gelir (`lib/overview/summary-asks.ts`; aynı mantık ikinci kez yazılmaz); burada yalnız kayıt başına
 * kart, eylem ve kanıt eklenir. Saf: LLM yok, saat girdiden. Ton `persona.ts`: "sen", birinci tekil, kısa, ünlemsiz; düz dil.
 */
import { checkCompliance, complianceFailureMessage } from "@/lib/compliance";
import { accountTypeProfile } from "@/lib/domain/account-type";
import { briefingFreshness, type BriefingEvidenceRef } from "@/lib/domain/briefing";
import { isBriefingRef } from "@/lib/domain/briefing-refs";
import { isOnboardingOpen } from "@/lib/domain/onboarding";
import { DEFAULT_TIMEZONE, formatDateTime } from "@/lib/format";
import { nextPlanItem, planItemStatuses } from "@/lib/overview/plan-item-status";
import { approvePublishAsk, connectAccountAsk, measurementAsk, shootNextAsk } from "@/lib/overview/summary-asks";
import type { SummaryAsk } from "@/lib/overview/types";
import { JOB_KIND_PLAIN, PLAIN_TERMS, rivalSuggestionsPhrase } from "@/lib/plain-language";
import {
  ONBOARDING_ACTION_PLAIN,
  ONBOARDING_REASON_PLAIN,
  ONBOARDING_STEP_PLAIN,
  ONBOARDING_TODAY_BODY_PLAIN,
  ONBOARDING_TODAY_PLAIN,
} from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";
import { truncateText } from "@/lib/text";
import { DAY_MS } from "@/lib/time";
import { publishFixHref } from "@/lib/today/publish-fix-href";
import type { DecisionAction, DecisionCard, TodayInput } from "@/lib/today/types";

const TITLE_MAX_CHARS = 80;
const CAPTION_MAX_CHARS = 100;
/** Planlanan günü bu kadar gün geçmiş videolar için "paylaştın mı?" sorulur; daha eskisi sorulmaz. */
export const PASTE_LINK_WINDOW_DAYS = 14;

const SETTINGS_LINK: DecisionAction = { kind: "link", label: "Ayarlar'ı aç", href: ROUTES.settings };

const ideaHref = (ideaId: string) => `${ROUTES.ideas}?id=${encodeURIComponent(ideaId)}`;
const quote = (text: string, max: number) => `“${truncateText(text, max)}”`;

/** Geçerli ref'ler (kimliği ref biçimine uymayan kayıt kanıtsız kalır; kart yine çıkar). */
function refs(...candidates: (string | undefined)[]): BriefingEvidenceRef[] {
  return candidates.filter((candidate): candidate is BriefingEvidenceRef => candidate !== undefined && isBriefingRef(candidate));
}

const askLink = (ask: SummaryAsk): DecisionAction => ({ kind: "link", ...ask.action });

/** Plandaki fikir başlığı (öneri kartı fikri adıyla ansın diye); planda yoksa undefined. */
function planIdeaTitle(input: TodayInput, ideaId: string): string | undefined {
  const plan = input.summary.plan;
  if (!plan) return undefined;
  return [...plan.items, ...plan.alternatives].find((item) => item.ideaId === ideaId)?.idea.title;
}

// ----------------------------------------------------------------- Başlangıç

/**
 * Başlangıç akışı açıkken (hesap eklendi ama ilk plan çıkmadı) tek kart: akış sürüyorsa "ilk bakışımı yapıyorum" (ilerlemeyi gör), kullanıcıyı
 * bekliyorsa "ilk bakışı birlikte tamamlayalım" (devam et), durduysa durduğunu NEDENİYLE söyler ("Burada durdum" + akışın kendi neden cümlesi;
 * düğme akışın sıradaki eylemini adıyla anar). Kart yalnız `/baslangic`'e götürür: adım orada veriden türer, harcama onayı karttan VERİLMEZ
 * (akıştaki düğmelerdedir). Akış okunamadıysa / bu ortamda ilerletilemiyorsa (`onboarding` undefined) kart yok.
 */
export function onboardingCards(input: TodayInput): DecisionCard[] {
  const flow = input.onboarding;
  if (flow === undefined || !isOnboardingOpen(flow)) return [];
  const running = flow.step === "probing" || flow.step === "building";
  const stopped = flow.step === "blocked";
  const title = stopped ? ONBOARDING_STEP_PLAIN.blocked.title : running ? ONBOARDING_TODAY_PLAIN.running : ONBOARDING_TODAY_PLAIN.waiting;
  const body = stopped
    ? flow.reason === undefined
      ? ONBOARDING_STEP_PLAIN.blocked.lead
      : ONBOARDING_REASON_PLAIN[flow.reason]
    : running
      ? ONBOARDING_TODAY_BODY_PLAIN.running
      : ONBOARDING_TODAY_BODY_PLAIN.waiting;
  const label = running ? ONBOARDING_TODAY_BODY_PLAIN.runningOpen : stopped && flow.next !== undefined ? ONBOARDING_ACTION_PLAIN[flow.next] : ONBOARDING_TODAY_PLAIN.open;
  return [{ id: "onboarding", kind: "onboarding", title, body, primary: { kind: "link", label, href: ROUTES.onboarding }, evidence: [], operatorOnly: false }];
}

// ------------------------------------------------------------------- Kurulum

export function connectAccountCards(input: TodayInput): DecisionCard[] {
  const ask = connectAccountAsk(input.summary);
  if (!ask) return [];
  return [{ id: "connect_account", kind: "connect_account", title: "Hesabını bağla", body: ask.text, primary: askLink(ask), evidence: [], operatorOnly: false }];
}

/** İlk kurulum (yalnız boş çalışma alanında): hesabın konusu yazılmamışsa. */
export function setupNicheCards(input: TodayInput, empty: boolean): DecisionCard[] {
  if (!empty || !input.workspace) return [];
  if ((input.workspace.nicheBrief ?? "").trim() !== "") return [];
  return [
    {
      id: "setup_niche",
      kind: "setup_niche",
      title: "Hesabının konusunu yaz",
      body: "Ne anlattığını ve kime seslendiğini birkaç cümleyle yaz; videolarını ve fikirleri buna göre değerlendiririm.",
      primary: SETTINGS_LINK,
      evidence: [],
      operatorOnly: false,
    },
  ];
}

/** İlk kurulum (yalnız boş çalışma alanında): hesap türü her zaman doludur (varsayılanı var), bu yüzden kart "doğru mu?" diye sorar. */
export function setupAccountTypeCards(input: TodayInput, empty: boolean): DecisionCard[] {
  if (!empty || !input.workspace) return [];
  const profile = accountTypeProfile(input.workspace.accountType);
  return [
    {
      id: "setup_account_type",
      kind: "setup_account_type",
      title: "Hesap türünü kontrol et",
      body: `Hesabını “${profile.label}” olarak tanıyorum: ${profile.description} Yanlışsa değiştir; önerilerimi buna göre kurarım.`,
      primary: SETTINGS_LINK,
      evidence: [],
      operatorOnly: false,
    },
  ];
}

// -------------------------------------------------------------------- Yayın

/** Onay bekleyen yayın: iş başına kart. Açıklama uyum denetiminden geçmiyorsa onay düğmesi yerine sebep + "düzelt" bağlantısı. */
export function approvePublishCards(input: TodayInput): DecisionCard[] {
  const openPublish: DecisionAction = { kind: "link", label: "Yayını aç", href: ROUTES.publish };
  if (input.pendingJobs === undefined) {
    // İşler okunamadı: yalnız sayı biliniyorsa tek özet kartı.
    const ask = approvePublishAsk(input.summary);
    if (!ask) return [];
    return [{ id: "approve_publish:all", kind: "approve_publish", title: "Yayın onayını bekliyor", body: ask.text, primary: askLink(ask), evidence: [], operatorOnly: false }];
  }
  const zone = input.workspace?.timezone ?? DEFAULT_TIMEZONE;
  return input.pendingJobs.map((job) => {
    const caption = (job.caption ?? "").trim();
    const when = formatDateTime(job.scheduledFor, zone);
    const body = [
      caption === "" ? "Hazırlanan video yayına çıkmak için onayını bekliyor." : `${quote(caption, CAPTION_MAX_CHARS)} açıklamalı video yayına çıkmak için onayını bekliyor.`,
      when === undefined ? "Onaylayınca hemen yayınlanır." : `Planlanan yayın: ${when}.`,
    ].join(" ");
    const region = input.workspace?.complianceRegion;
    const blockedReason =
      region === undefined
        ? undefined
        : complianceFailureMessage(
            checkCompliance({ caption, isPaidPartnership: job.paidPartnership, isAiGenerated: job.aiGenerated, advertiserName: job.advertiserName, region }),
          );
    const subject = job.ideaId === undefined ? undefined : planIdeaTitle(input, job.ideaId);
    const base = {
      id: `approve_publish:${job.id}`,
      kind: "approve_publish" as const,
      title: "Yayın onayını bekliyor",
      subject,
      dueAt: job.scheduledFor,
      body,
      evidence: refs(job.ideaId && `idea:${job.ideaId}`),
      operatorOnly: false,
    };
    if (blockedReason !== undefined) return { ...base, primary: { kind: "link", label: "Yayını düzelt", href: publishFixHref(job.id) }, blockedReason };
    return { ...base, primary: { kind: "action", action: "approvePublishJob", label: "Yayını onayla", payload: { jobId: job.id } }, secondary: openPublish };
  });
}

// ------------------------------------------------------------ Fikir ↔ Reels

/** Otomatik eşleşme önerisi: öneri başına kart (onayla / bu değil). */
export function confirmLinkCards(input: TodayInput): DecisionCard[] {
  return (input.suggestedLinks ?? []).map((link) => {
    const title = planIdeaTitle(input, link.ideaId);
    const caption = (link.content?.caption ?? "").trim();
    const body = [
      title === undefined
        ? "Yayınladığın bir videonun hangi fikirden çıktığını tahmin ettim."
        : `Yayınladığın bir videonun ${quote(title, TITLE_MAX_CHARS)} fikrinden çıktığını tahmin ettim.`,
      caption === "" ? undefined : `Videonun açıklaması: ${quote(caption, CAPTION_MAX_CHARS)}.`,
      "Doğruysa onayla; sonucunu bu fikrin altında takip ederim.",
    ]
      .filter((part) => part !== undefined)
      .join(" ");
    return {
      id: `confirm_link:${link.id}`,
      kind: "confirm_link",
      title: "Bu video bu fikirden mi çıktı?",
      body,
      primary: { kind: "action", action: "resolveIdeaLinkAction", label: "Evet, bu fikir", payload: { linkId: link.id, decision: "confirm" } },
      secondary: { kind: "action", action: "resolveIdeaLinkAction", label: "Bu değil", payload: { linkId: link.id, decision: "reject" } },
      evidence: refs(`idea:${link.ideaId}`, link.contentItemId && `c:${link.contentItemId}`),
      operatorOnly: false,
    };
  });
}

/**
 * Planlanan günü geçmiş, yayınlandığı bilinmeyen plan videoları: "paylaştıysan bağlantısını yapıştır". Zaten eşleşme önerisi olan fikir
 * atlanır (onun kartı ayrı). Durum hesabı plan kartıyla aynı (`planItemStatuses`).
 */
export function pasteReelLinkCards(input: TodayInput): DecisionCard[] {
  const { plan, review, currentWeekStart } = input.summary;
  if (!plan) return [];
  const nowMs = input.now.getTime();
  const suggested = new Set((input.suggestedLinks ?? []).map((link) => link.ideaId));
  const statuses = planItemStatuses(plan, review, currentWeekStart);
  return plan.items.flatMap((item, index): DecisionCard[] => {
    const status = statuses[index].kind;
    if (status !== "next" && status !== "to_shoot" && status !== "not_shot") return [];
    const slotMs = item.slotAt === undefined ? Number.NaN : Date.parse(item.slotAt);
    if (Number.isNaN(slotMs) || slotMs >= nowMs || nowMs - slotMs > PASTE_LINK_WINDOW_DAYS * DAY_MS) return [];
    const pendingSuggestion = review?.items.find((entry) => entry.ideaId === item.ideaId)?.suggestionCount ?? 0;
    if (suggested.has(item.ideaId) || pendingSuggestion > 0) return [];
    return [
      {
        id: `paste_reel_link:${item.ideaId}`,
        kind: "paste_reel_link",
        title: "Bu videoyu paylaştın mı?",
        subject: item.idea.title,
        body: `${quote(item.idea.title, TITLE_MAX_CHARS)} için planlanan gün geçti. Paylaştıysan bağlantısını yapıştır; sonucunu takip edeyim.`,
        primary: { kind: "action", action: "linkIdeaToReelAction", label: "Bağlantıyı kaydet", payload: { ideaId: item.ideaId }, input: "url" },
        secondary: { kind: "link", label: "Senaryoyu aç", href: ideaHref(item.ideaId) },
        evidence: refs(`idea:${item.ideaId}`, `plan:${plan.weekStart}`),
        operatorOnly: false,
      },
    ];
  });
}

/** Sıradaki çekim: plan kartındaki "Sırada" maddesi. Güven planın genel güvenidir (fikir başına güven yok). */
export function shootNextCards(input: TodayInput): DecisionCard[] {
  const { plan, review, currentWeekStart } = input.summary;
  const ask = shootNextAsk(input.summary);
  if (!ask || !plan) return [];
  const item = nextPlanItem(plan, planItemStatuses(plan, review, currentWeekStart));
  if (!item) return [];
  return [
    {
      id: `shoot_next:${item.ideaId}`,
      kind: "shoot_next",
      title: "Sıradaki çekim",
      subject: item.idea.title,
      dueAt: item.slotAt,
      body: ask.text,
      primary: askLink(ask),
      evidence: refs(`idea:${item.ideaId}`, `plan:${plan.weekStart}`),
      confidence: plan.confidence,
      operatorOnly: false,
    },
  ];
}

// ------------------------------------------------------------------ Yönetici

/** Ölçüm bütçesi onayı (para konuşur: yalnız yönetici). Bütçe onaylıysa ya da ölçümü gelen video yoksa kart yok. */
export function measurementBudgetCards(input: TodayInput): DecisionCard[] {
  if (!input.summary.operator || input.summary.measureCapApproved !== false) return [];
  const ask = measurementAsk(input.summary);
  if (!ask) return [];
  return [{ id: "measurement_budget", kind: "measurement_budget", title: "Ölçüm bütçesi onayı", body: ask.text, primary: askLink(ask), evidence: [], operatorOnly: true }];
}

/** Benzer hesap önerileri (izlemeye almak veri toplatır, para ayırır: yalnız yönetici). Öneri yoksa (rakipsiz hesap dahil) kart yok. */
export function reviewRivalsCards(input: TodayInput): DecisionCard[] {
  const count = input.rivalCandidates;
  if (count === undefined || count <= 0) return [];
  const phrase = rivalSuggestionsPhrase(count);
  if (phrase === undefined) return [];
  return [
    {
      id: "review_rivals",
      kind: "review_rivals",
      title: "Benzer hesap önerileri",
      body: `${phrase} kararını bekliyor. İzlemeye aldığın hesapların videolarına da bakarım.`,
      primary: { kind: "link", label: "Rakipleri aç", href: ROUTES.competitors },
      evidence: [],
      operatorOnly: true,
    },
  ];
}

/**
 * Haftalık tur (iş başlatır: yalnız yönetici, işler panelden başlatılabiliyorken ve çalışma alanında süren iş yokken). Sebep: notlar
 * bayat (`briefingFreshness`, kartla aynı kural) YA DA gelecek haftanın planı yok (en son plan bu haftanın ya da daha eskisinin).
 * Okunamayan parça sebep sayılmaz (plan / hafta `undefined` ise "plan yok" denmez). Boş çalışma alanında kart yok: önce kurulum adımları.
 * Karttan başlayan tur ONAYSIZDIR (para harcamaz); yeni veri toplamak tutar onayı ister ve İşler ekranından başlatılır.
 */
export function runRoutineCards(input: TodayInput, empty: boolean): DecisionCard[] {
  if (!input.summary.operator || empty || input.jobs === undefined || !input.jobs.canRun || input.jobs.busy) return [];
  const { plan, currentWeekStart, lastCollectedAt } = input.summary;
  const staleNotes = input.briefing !== null && briefingFreshness(input.briefing.generatedAt, { now: input.now, lastCollectedAt }).stale;
  const planMissing = plan !== undefined && currentWeekStart !== undefined && (plan === null || plan.weekStart <= currentWeekStart);
  if (!staleNotes && !planMissing) return [];
  const body = [
    staleNotes ? PLAIN_TERMS.stale.meaning : undefined,
    planMissing ? "Gelecek haftanın planı henüz hazır değil." : undefined,
    "Turu başlatırsan videoları inceler, planı ve notlarımı hazırlarım. Bu tur para harcamaz; yeni veri de toplansın istersen İşler ekranından başlat.",
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  return [
    {
      id: "run_routine",
      kind: "run_routine",
      title: `${JOB_KIND_PLAIN.routine.label} zamanı`,
      body,
      primary: { kind: "action", action: "requestJobAction", label: "Haftalık turu başlat", payload: { kind: "routine" } },
      secondary: { kind: "link", label: "İşler'i aç", href: ROUTES.jobs },
      evidence: [],
      operatorOnly: true,
    },
  ];
}
