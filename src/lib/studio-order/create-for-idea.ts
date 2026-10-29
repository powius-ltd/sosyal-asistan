/**
 * Fikir için fiş üretimi: sayfa, server action ve sohbet (G6) AYNI işlevi çağırır. Depodan fikri, planı ve dayanak videoları okur,
 * `buildTicket` (SAF) ile fişi kurar, `repo.createStudioOrder` ile kaydeder. Dosya yazmaz. Aynı fikrin etkin fişi varsa yenisi yazılmaz,
 * mevcut döner. Fikir bir plan öğesiyse slot / saat plandan gelir; plansız (elle) fikirde hafta ve slot şimdiden türetilir.
 * Fişi istemek seçmektir: `new` fikir (fiş yeni yazılsa da zaten olsa da) `saved` olur; akışın "Seç" adımı fişle tutarlı kalır.
 */
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { Idea } from "@/lib/domain/intel";
import { isActiveOrderStatus, type StudioOrder } from "@/lib/domain/studio-order";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { resolveOrderAccount } from "@/lib/studio-order/account-mode";
import { panelSlugOfStudio } from "@/lib/studio-order/accounts";
import { buildTicket, type BuildInput, type EvidenceVideo } from "@/lib/studio-order/build";
import { loadEvidence, ownDurationGroups } from "@/lib/studio-order/run";
import type { ORDER_KINDS, Ticket } from "@/lib/studio-order/schema";

export type OrderKind = (typeof ORDER_KINDS)[number];

export interface CreateOrderInput {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  ideaId: string;
  kind?: OrderKind;
  note?: string;
  /** Çalışma alanı slug'ı (kayıt); yoksa kendi hesabın @handle'ı kullanılır. */
  panelSlug?: string;
}

export interface CreateOrderResult {
  order: StudioOrder;
  /** false: fikrin etkin fişi zaten vardı, o döndü. */
  created: boolean;
}

async function activeOrderOf(repo: PanelRepository, wsId: string, ideaId: string): Promise<StudioOrder | undefined> {
  return (await repo.listStudioOrders(wsId, { ideaIds: [ideaId] })).find((o) => isActiveOrderStatus(o.status));
}

async function selectIfNew(repo: PanelRepository, wsId: string, idea: { id: string; status: string }): Promise<void> {
  if (idea.status === "new") await repo.updateIdeaStatus(wsId, idea.id, "saved");
}

interface BuiltOrder {
  ticket: Ticket;
  /** Kurucunun kendi notu (ör. açılış senaryoyla eşleşmedi); kullanıcı notu değildir. */
  autoNote?: string;
  planWeek: string;
  slot?: number;
}

/** Fikirden fişi kurar (SAF kurucu `buildTicket` + depodan okunan plan, dayanak ve hesap). Yazmaz. Yeni fiş ve yenileme AYNI yolu kullanır. */
async function buildOrderFor(repo: PanelRepository, wsId: string, now: Date, idea: Idea, panelSlug: string | undefined): Promise<BuiltOrder> {
  const workspace = await repo.getWorkspace(wsId);
  const handle = (await repo.listOwnAccounts(wsId))[0]?.handle;
  const account = resolveOrderAccount({ panelSlug, handle, hasScript: (idea.details.script ?? "").trim() !== "" });
  if (account === undefined) throw new RepositoryError("invalid_input", "Hesap kimliği çıkarılamadı (çalışma alanı adı ya da kullanıcı adı yok).");

  const plan = idea.weeklyPlan ? await repo.getWeeklyPlan(wsId, idea.weeklyPlan.weekStart) : null;
  const item = plan?.items.find((i) => i.ideaId === idea.id && i.position !== undefined);
  const dayKey = toDayKey(now, workspace?.timezone) ?? now.toISOString().slice(0, 10);
  const planWeek = plan && item ? plan.weekStart : (weekStartOf(dayKey) ?? dayKey);
  const planned: Pick<BuildInput, "position" | "slotAt" | "briefSlot" | "brief"> =
    plan && item
      ? { position: item.position, slotAt: item.slotAt ?? now.toISOString(), ...(item.briefSlot ? { briefSlot: item.briefSlot } : {}), ...(plan.brief ? { brief: plan.brief } : {}) }
      : { briefSlot: `f${idea.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`, slotAt: now.toISOString() };

  const evidence: EvidenceVideo[] = await loadEvidence(repo, wsId, idea.evidence.map((e) => e.contentItemId), new Map());
  const built = buildTicket({
    panelSlug: account.slug,
    account: { studioSlug: account.slug, mode: account.mode },
    planWeek,
    idea,
    ...planned,
    evidence,
    ownDurationGroups: await ownDurationGroups(repo, wsId),
  });
  if (!built.ok) throw new RepositoryError("invalid_input", built.reason);
  return { ticket: built.ticket, ...(built.note ? { autoNote: built.note } : {}), planWeek, ...(item?.position !== undefined ? { slot: item.position } : {}) };
}

export async function createOrderForIdea(input: CreateOrderInput): Promise<CreateOrderResult> {
  const { repo, wsId, now, ideaId } = input;
  const idea = await repo.getIdea(wsId, ideaId);
  if (idea === null) throw new RepositoryError("not_found", "Fikir bulunamadı.");
  const existing = await activeOrderOf(repo, wsId, ideaId);
  if (existing) {
    await selectIfNew(repo, wsId, idea);
    return { order: existing, created: false };
  }

  const built = await buildOrderFor(repo, wsId, now, idea, input.panelSlug);
  const ticket = { ...built.ticket, ...(input.kind ? { tur: input.kind } : {}) };
  const note = [built.autoNote, input.note?.trim()].filter((part): part is string => part !== undefined && part !== "").join("\n\n");
  try {
    const order = await repo.createStudioOrder(wsId, { ideaId, ticket, note, weekStart: built.planWeek, ...(built.slot !== undefined ? { slot: built.slot } : {}) }, now);
    await selectIfNew(repo, wsId, idea);
    return { order, created: true };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "already_exists") {
      const raced = await activeOrderOf(repo, wsId, ideaId);
      if (raced) return { order: raced, created: false };
    }
    throw error;
  }
}

/** Fişin stüdyo slug'ından panel slug'ı; stüdyoda tanımsız hesapta (ör. `ornek`) fişin kendi slug'ı (yeni fişte de öyle yazılmıştı). */
function panelSlugOf(studioSlug: string): string {
  try {
    return panelSlugOfStudio(studioSlug);
  } catch {
    return studioSlug;
  }
}

/**
 * Fikrin TASLAK fişini fikrin güncel metniyle yeniden kurar (SPN-35 G6: sohbetle düzeltme sonrası). Fişin kimliği (`siparis_id`), hesabı,
 * üretim türü ve kullanıcı notu korunur; değişen yalnız fikirden gelen metin alanlarıdır. Etkin fiş yoksa ya da taslak değilse (üretime
 * gitmiş) dokunmaz ve `undefined` döner.
 */
export async function refreshDraftOrder(input: { repo: PanelRepository; wsId: string; now: Date; ideaId: string }): Promise<StudioOrder | undefined> {
  const { repo, wsId, now, ideaId } = input;
  const order = await activeOrderOf(repo, wsId, ideaId);
  if (order === undefined || order.status !== "taslak") return undefined;
  const idea = await repo.getIdea(wsId, ideaId);
  if (idea === null) return undefined;
  const built = await buildOrderFor(repo, wsId, now, idea, panelSlugOf(order.ticket.hesap));
  const ticket: Ticket = { ...built.ticket, siparis_id: order.ticket.siparis_id, hesap: order.ticket.hesap, tur: order.ticket.tur };
  return repo.updateStudioOrder(wsId, order.id, { ticket }, now);
}

export interface UpdateOrderInput {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  orderId: string;
  kind?: OrderKind;
  note?: string;
}

/** Taslak fişin üretim türünü ve/veya notunu değiştirir (kural depoda: yalnız `taslak`). */
export async function updateOrder(input: UpdateOrderInput): Promise<StudioOrder> {
  const patch = { ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(input.note !== undefined ? { note: input.note } : {}) };
  return input.repo.updateStudioOrder(input.wsId, input.orderId, patch, input.now);
}
