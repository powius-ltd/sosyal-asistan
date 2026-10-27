/**
 * Mock depo: fikir ↔ Reels bağı (gerçek durum makinesi; Supabase'de aynı kuralları `0010_outcomes.sql` trigger'ları ve
 * `supabase/idea-links.ts` uygular). Durum mock bağlamında DEĞİL bu modülün kapanışında tutulur; fikre yansıması
 * `Idea.reelLink` ve `Idea.status` üzerinden olur (`state.ideas` tek kaynak: liste/plan/getIdea aynı fikri görür).
 *
 * Kurallar (`PanelRepository` belgeleriyle aynı): onaylı bağ fikri `published` yapar ve önceki durumu saklar; kaldırılınca fikir
 * (hâlâ `published` ise) önceki duruma döner; fikir başına tek aktif bağ, içerik başına tek onaylı bağ; yalnız KENDİ hesap
 * içeriğine bağlanır; `dismissed` fikre bağlanamaz.
 */
import { parseLinkIdeaToReelInput, parseReelShortcode, parseResolveIdeaLinkInput } from "@/lib/data/idea-link-input";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { ContentItem } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import { canConfirmIdeaLink, type Idea, type IdeaStatus } from "@/lib/domain/intel";
import { toIdeaReelLink, type IdeaLink } from "@/lib/domain/outcomes";

export type IdeaLinkMethods = Pick<PanelRepository, "listIdeaLinks" | "linkIdeaToReel" | "resolveIdeaLink" | "unlinkIdea">;

/** Saklanan bağ: `IdeaLink` + bağ onaylanırken fikrin durumu (geri alma için). İçerik özeti okuma anında türetilir. */
type StoredLink = Omit<IdeaLink, "content"> & { prevIdeaStatus?: IdeaStatus };

const isActive = (link: StoredLink) => link.status === "confirmed" || link.status === "awaiting_content";

export interface MockIdeaLinks {
  methods: IdeaLinkMethods;
  /**
   * SUNUCU tarafı otomatik öneri (gerçekte toplama sonrası `afterCollect` yazar): yalnız sözleşme testleri için `testing` kancası.
   * `suggested` + `auto_match` + skor 0,7 bağ yazar; fikre dokunmaz (sessiz bağ yok). Yeni bağın kimliğini döndürür.
   */
  suggest(input: { ideaId: string; contentItemId: string }): string;
}

export function createIdeaLinks(ctx: MockContext): MockIdeaLinks {
  const { state, clock, inWs, requireWs, findOrThrow, out } = ctx;
  const links: StoredLink[] = [];
  let counter = 0;

  /** Fikrin platformundaki, aynı kısa kodlu KENDİ hesap içeriği. */
  const findOwnContent = (idea: Idea, shortcode: string): ContentItem | undefined =>
    state.content.find((c) => c.owner.kind === "own" && c.platform === idea.platform && c.shortcode === shortcode);

  const hydrate = (link: StoredLink): IdeaLink => {
    const item = link.contentItemId === undefined ? undefined : state.content.find((c) => c.id === link.contentItemId);
    const analysis = item === undefined ? undefined : state.analyses.find((a) => a.contentItemId === item.id);
    // `prevIdeaStatus` iç durumdur (geri alma için): dışarı verilen bağda yok.
    return {
      id: link.id,
      workspaceId: link.workspaceId,
      ideaId: link.ideaId,
      shortcode: link.shortcode,
      status: link.status,
      origin: link.origin,
      contentItemId: link.contentItemId,
      content: item === undefined ? undefined : summarizeContent(item, analysis),
      score: link.score,
      reasons: link.reasons,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    };
  };

  /** Fikrin kartındaki aktif bağı güncel duruma getirir (liste/plan/getIdea aynı nesneyi görür). */
  const syncIdea = (idea: Idea) => {
    const active = links.find((l) => l.ideaId === idea.id && isActive(l));
    idea.reelLink = active === undefined ? undefined : toIdeaReelLink(hydrate(active));
    idea.updatedAt = clock.tick();
  };

  const confirm = (link: StoredLink, idea: Idea, content: ContentItem) => {
    link.status = "confirmed";
    link.contentItemId = content.id;
    link.prevIdeaStatus = idea.status;
    link.updatedAt = clock.tick();
    idea.status = "published";
    syncIdea(idea);
  };

  const methods: IdeaLinkMethods = {
    async listIdeaLinks(wsId, filter = {}) {
      if (!inWs(wsId)) return [];
      const statuses = filter.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
      const limit = Math.min(Math.max(Math.floor(filter.limit ?? DEFAULT_PAGE_LIMIT), 1), MAX_PAGE_LIMIT);
      return out(
        links
          .filter((l) => (filter.ideaId === undefined || l.ideaId === filter.ideaId) && (statuses === undefined || statuses.includes(l.status)))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
          .slice(0, limit)
          .map(hydrate),
      );
    },

    async linkIdeaToReel(wsId, input) {
      requireWs(wsId);
      const valid = parseLinkIdeaToReelInput(input);
      const idea = findOrThrow(state.ideas, valid.ideaId, "Fikir");
      const shortcode = parseReelShortcode(idea.platform, valid.url);
      if (!canConfirmIdeaLink(idea.status)) throw new RepositoryError("invalid_state", "Reddedilmiş fikre Reels bağlanamaz; önce fikri geri al.");

      const active = links.find((l) => l.ideaId === idea.id && isActive(l));
      if (active?.status === "confirmed") {
        if (active.shortcode === shortcode) return out(hydrate(active)); // idempotent
        throw new RepositoryError("already_exists", "Bu fikir zaten başka bir Reels'e bağlı; önce bağı kaldır.");
      }
      const content = findOwnContent(idea, shortcode);
      if (content && links.some((l) => l.status === "confirmed" && l.contentItemId === content.id && l.ideaId !== idea.id)) {
        throw new RepositoryError("already_exists", "Bu Reels zaten başka bir fikre bağlı.");
      }

      const existing = links.find((l) => l.ideaId === idea.id && l.shortcode === shortcode);
      // Fikrin farklı kodlu bekleyen bağı yenisinin yerine geçer (aynı anda tek aktif bağ).
      if (active && active !== existing) links.splice(links.indexOf(active), 1);
      const now = clock.tick();
      const link: StoredLink =
        existing ??
        { id: `il_${String(++counter).padStart(2, "0")}`, workspaceId: wsId, ideaId: idea.id, shortcode, status: "awaiting_content", origin: "manual_url", reasons: [], createdAt: now, updatedAt: now };
      if (existing === undefined) links.push(link);

      if (content) {
        link.origin = "manual_url"; // kullanıcı linki verdi = onay
        confirm(link, idea, content);
      } else if (link.status !== "awaiting_content") {
        throw new RepositoryError("invalid_state", "Bu bağ içerik beklemiyor."); // içeriksiz satır yalnız bekleyen olur
      } else {
        syncIdea(idea);
      }
      return out(hydrate(link));
    },

    async resolveIdeaLink(wsId, linkId, decision) {
      requireWs(wsId);
      const valid = parseResolveIdeaLinkInput(linkId, decision);
      const link = findOrThrow(links, valid.linkId, "Bağ");
      if (link.status !== "suggested") throw new RepositoryError("invalid_state", "Yalnız bekleyen öneri onaylanır ya da reddedilir.");

      if (valid.decision === "reject") {
        link.status = "rejected";
        link.updatedAt = clock.tick();
        return out(hydrate(link));
      }
      const idea = findOrThrow(state.ideas, link.ideaId, "Fikir");
      const content = state.content.find((c) => c.id === link.contentItemId);
      if (!content) throw new RepositoryError("not_found", "Önerilen içerik bulunamadı.");
      if (!canConfirmIdeaLink(idea.status)) throw new RepositoryError("invalid_state", "Reddedilmiş fikre Reels bağlanamaz; önce fikri geri al.");
      if (links.some((l) => l !== link && l.ideaId === idea.id && isActive(l))) throw new RepositoryError("already_exists", "Bu fikir zaten bir Reels'e bağlı.");
      if (links.some((l) => l !== link && l.status === "confirmed" && l.contentItemId === content.id)) {
        throw new RepositoryError("already_exists", "Bu Reels zaten başka bir fikre bağlı.");
      }
      confirm(link, idea, content);
      return out(hydrate(link));
    },

    async unlinkIdea(wsId, ideaId) {
      requireWs(wsId);
      const idea = findOrThrow(state.ideas, ideaId, "Fikir");
      const active = links.find((l) => l.ideaId === idea.id && isActive(l));
      if (!active) throw new RepositoryError("not_found", "Bu fikrin Reels bağı yok.");
      if (active.status === "awaiting_content") {
        links.splice(links.indexOf(active), 1);
      } else {
        // Onaylı bağ kalkar (satır `rejected` olarak kalır: aynı çift tekrar önerilmez); fikir hâlâ bu bağın
        // yayınladığı durumdaysa önceki durumuna döner.
        if (idea.status === "published" && active.prevIdeaStatus !== undefined && active.prevIdeaStatus !== "published") idea.status = active.prevIdeaStatus;
        active.status = "rejected";
        active.prevIdeaStatus = undefined;
        active.updatedAt = clock.tick();
      }
      syncIdea(idea);
      return out(idea);
    },
  };

  const suggest: MockIdeaLinks["suggest"] = ({ ideaId, contentItemId }) => {
    const idea = findOrThrow(state.ideas, ideaId, "Fikir");
    const content = findOrThrow(state.content, contentItemId, "İçerik");
    if (content.shortcode === undefined || content.owner.kind !== "own") throw new RepositoryError("invalid_input", "Öneri yalnız kısa kodlu kendi içeriğe verilir.");
    if (links.some((l) => l.ideaId === idea.id && l.shortcode === content.shortcode)) throw new RepositoryError("already_exists", "Bu fikir ↔ içerik çifti için bağ zaten var.");
    const now = clock.tick();
    const link: StoredLink = {
      id: `il_${String(++counter).padStart(2, "0")}`,
      workspaceId: idea.workspaceId,
      ideaId: idea.id,
      shortcode: content.shortcode,
      status: "suggested",
      origin: "auto_match",
      contentItemId: content.id,
      score: 0.7,
      reasons: ["Test önerisi"],
      createdAt: now,
      updatedAt: now,
    };
    links.push(link);
    return link.id;
  };

  return { methods, suggest };
}
