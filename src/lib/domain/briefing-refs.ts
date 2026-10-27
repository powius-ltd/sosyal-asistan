/**
 * Brifing kanıt ref'leri ve eylem hedefleri: üretim, ayrıştırma, doğrulama ve bağlantı (href) türetme — TEK yer. Olgu paketi
 * (`analyst/facts`) ref'leri buradan üretir; doğrulama (`analyst/verify`) gelen metni buradan süzer; kart bağlantıyı buradan alır.
 * Biçimler `BriefingEvidenceRef` (`briefing.ts`). Kimlikler (içerik/fikir) `[A-Za-z0-9_-]{1,64}` (UUID ve mock kimlikleri), hafta
 * Pazartesi gününün `YYYY-MM-DD`'si, hücre taksonomideki katman/açı; konu hücresi konu kümesi anahtarı (`CLUSTER_KEY_PATTERN`) + hook türü
 * (`HOOK_TYPES`). Kendi tutanlar için ayrı ref YOKTUR: kendi videosu `c:<contentId>` ile anılır. Bağlantı SAKLANMAZ: render'da `routes.ts`'ten türer; iç yol
 * olduğundan dış bağlantı denetimi (`safeExternalUrl`) gerekmez. Saf fonksiyonlar (veri okumaz).
 */
import {
  BRIEFING_COMMANDS,
  type BriefingAction,
  type BriefingCommand,
  type BriefingEvidenceRef,
} from "@/lib/domain/briefing";
import { CREATIVE_ANGLE_IDS, FUNNEL_STAGE_IDS, type CreativeAngle, type FunnelStage } from "@/lib/domain/creative-matrix";
import { HOOK_TYPES, type HookType } from "@/lib/domain/hook-types";
import { CHECKPOINT_DAYS, type CheckpointDay } from "@/lib/domain/outcomes";
import { CLUSTER_KEY_PATTERN } from "@/lib/domain/topic-hook-matrix";
import { isWeekStart } from "@/lib/domain/weekly-plan";
import { matrixCellHref } from "@/lib/matrix/cell-param";
import { topicCellHref } from "@/lib/matrix/topic-cell-param";
import { ROUTES, thisWeekFor } from "@/lib/routes";

/** İçerik/fikir kimliği: ":" ve boşluk içermez (ref ayracıyla çakışmaz). */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type ParsedBriefingRef =
  | { kind: "content"; contentId: string }
  | { kind: "cell"; stage: FunnelStage; angle: CreativeAngle }
  | { kind: "topic"; clusterKey: string; hookType: HookType }
  | { kind: "plan"; weekStart: string }
  | { kind: "idea"; ideaId: string }
  | { kind: "due"; contentId: string; day: CheckpointDay };

/**
 * Ref metnini ayrıştırır. Bilinmeyen önek, bozuk kimlik, taksonomide olmayan hücre, Pazartesi olmayan hafta, bilinmeyen ölçüm günü,
 * fazla/eksik parça → undefined (ref geçersizdir; çağıran reddeder).
 */
export function parseBriefingRef(ref: string): ParsedBriefingRef | undefined {
  const parts = ref.split(":");
  const [prefix, first, second, ...rest] = parts;
  if (first === undefined || rest.length > 0) return undefined;
  switch (prefix) {
    case "c":
      return second === undefined && ID_PATTERN.test(first) ? { kind: "content", contentId: first } : undefined;
    case "idea":
      return second === undefined && ID_PATTERN.test(first) ? { kind: "idea", ideaId: first } : undefined;
    case "plan":
      return second === undefined && isWeekStart(first) ? { kind: "plan", weekStart: first } : undefined;
    case "cell": {
      const stage = FUNNEL_STAGE_IDS.find((id) => id === first);
      const angle = CREATIVE_ANGLE_IDS.find((id) => id === second);
      return stage !== undefined && angle !== undefined ? { kind: "cell", stage, angle } : undefined;
    }
    case "topic": {
      const hookType = HOOK_TYPES.find((type) => type === second);
      return CLUSTER_KEY_PATTERN.test(first) && hookType !== undefined ? { kind: "topic", clusterKey: first, hookType } : undefined;
    }
    case "due": {
      const day = CHECKPOINT_DAYS.find((d) => `d${d}` === second);
      return day !== undefined && ID_PATTERN.test(first) ? { kind: "due", contentId: first, day } : undefined;
    }
    default:
      return undefined;
  }
}

/** Geçerli bir kanıt ref'i mi (`parseBriefingRef` çözebiliyor)? */
export function isBriefingRef(value: unknown): value is BriefingEvidenceRef {
  return typeof value === "string" && parseBriefingRef(value) !== undefined;
}

/** Ayrıştırılmış ref'i metne çevirir (`parseBriefingRef`'in tersi). */
export function formatBriefingRef(ref: ParsedBriefingRef): BriefingEvidenceRef {
  switch (ref.kind) {
    case "content":
      return `c:${ref.contentId}`;
    case "cell":
      return `cell:${ref.stage}:${ref.angle}`;
    case "topic":
      return `topic:${ref.clusterKey}:${ref.hookType}`;
    case "plan":
      return `plan:${ref.weekStart}`;
    case "idea":
      return `idea:${ref.ideaId}`;
    case "due":
      return `due:${ref.contentId}:d${ref.day}`;
  }
}

/** Ref üreticileri (olgu paketi için): geçersiz girdi PROGRAMLAMA hatasıdır → fırlatır (geçersiz ref hiç üretilmez). */
function build(parsed: ParsedBriefingRef): BriefingEvidenceRef {
  const text = formatBriefingRef(parsed);
  if (parseBriefingRef(text) === undefined) throw new RangeError(`Geçersiz brifing ref'i: ${text}`);
  return text;
}

export const contentRef = (contentId: string): BriefingEvidenceRef => build({ kind: "content", contentId });
export const cellRef = (stage: FunnelStage, angle: CreativeAngle): BriefingEvidenceRef => build({ kind: "cell", stage, angle });
export const topicRef = (clusterKey: string, hookType: HookType): BriefingEvidenceRef => build({ kind: "topic", clusterKey, hookType });
export const planRef = (weekStart: string): BriefingEvidenceRef => build({ kind: "plan", weekStart });
export const ideaRef = (ideaId: string): BriefingEvidenceRef => build({ kind: "idea", ideaId });
export const dueRef = (contentId: string, day: CheckpointDay): BriefingEvidenceRef => build({ kind: "due", contentId, day });

/**
 * Ref'in panel bağlantısı (iç yol, `routes.ts`): içerik ve ölçümü gelen Reels → video sayfası · hücre → `/anatomi?hucre=` · konu hücresi →
 * `/anatomi?konu=` · plan → `/bu-hafta?hafta=` · fikir → `/fikirler?id=`. Geçersiz ref → undefined (bağlantısız gösterilir).
 */
export function briefingRefHref(ref: string): string | undefined {
  const parsed = parseBriefingRef(ref);
  if (parsed === undefined) return undefined;
  switch (parsed.kind) {
    case "content":
    case "due":
      return ROUTES.video(parsed.contentId);
    case "cell":
      return matrixCellHref({ stage: parsed.stage, angle: parsed.angle });
    case "topic":
      return topicCellHref({ clusterKey: parsed.clusterKey, hookType: parsed.hookType });
    case "plan":
      return thisWeekFor(parsed.weekStart);
    case "idea":
      return `${ROUTES.ideas}?id=${encodeURIComponent(parsed.ideaId)}`;
  }
}

/** Ref'in insan okur kısa türü (kanıt bağlantısı etiketi için): "Video", "Matris hücresi", "Plan", "Fikir", "Ölçüm". */
export const BRIEFING_REF_KIND_LABEL: Record<ParsedBriefingRef["kind"], string> = {
  content: "Video",
  cell: "Matris hücresi",
  topic: "Konu hücresi",
  plan: "Haftalık plan",
  idea: "Fikir",
  due: "Ölçüm",
};

// ------------------------------------------------------------------- Eylem

/** Eylem türüne izin verilen hedef ref türleri (`run_cmd` hedef almaz; `open_matrix` hedefsiz da olabilir). */
const ACTION_TARGET_KINDS: Record<Exclude<BriefingAction["type"], "run_cmd">, readonly ParsedBriefingRef["kind"][]> = {
  open_video: ["content", "due"],
  open_plan: ["plan"],
  open_matrix: ["cell", "topic"],
  approve_link: ["idea"],
};

/**
 * Eylem tutarlılığı: sorun metinleri ([] = geçerli). `run_cmd` yalnız `commandId` (tablodan) taşır, hedef taşımaz ve `spendsMoney`
 * komut tablosuyla aynıdır; diğer eylemler komut taşımaz, `spendsMoney = false`, hedefi türüne uyan geçerli bir ref'tir
 * (`open_matrix` hedefsiz olabilir: matris sayfasını açar). Doğrulama (`analyst/verify`) ve zod şeması AYNI kuralı kullanır.
 */
export function briefingActionIssues(action: BriefingAction): string[] {
  const issues: string[] = [];
  if (action.type === "run_cmd") {
    if (action.commandId === undefined) issues.push("run_cmd eylemi komut kimliği ister");
    else if (action.spendsMoney !== BRIEFING_COMMANDS[action.commandId].spendsMoney) issues.push("spendsMoney komut tablosuyla uyuşmuyor");
    if (action.target !== undefined) issues.push("run_cmd eylemi hedef almaz");
    return issues;
  }
  if (action.commandId !== undefined) issues.push(`${action.type} eylemi komut taşımaz`);
  if (action.spendsMoney) issues.push(`${action.type} eylemi para harcamaz`);
  if (action.target === undefined) {
    if (action.type !== "open_matrix") issues.push(`${action.type} eylemi hedef ister`);
    return issues;
  }
  const parsed = parseBriefingRef(action.target);
  if (parsed === undefined) issues.push(`geçersiz eylem hedefi: ${action.target}`);
  else if (!ACTION_TARGET_KINDS[action.type].includes(parsed.kind)) issues.push(`${action.type} eylemi için uygun olmayan hedef: ${action.target}`);
  return issues;
}

/** Eylemin sayfa bağlantısı: hedefli eylem → hedefin yolu; hedefsiz `open_matrix` → matris sayfası; `run_cmd` → undefined (komut gösterilir). */
export function briefingActionHref(action: BriefingAction): string | undefined {
  if (action.type === "run_cmd") return undefined;
  if (action.target === undefined) return action.type === "open_matrix" ? ROUTES.anatomy : undefined;
  return briefingRefHref(action.target);
}

/** `run_cmd` eyleminin komutu (tablodan: kopyalanabilir metin + etiket + para). Başka eylem ya da kimliksiz → undefined. */
export function briefingActionCommand(action: BriefingAction): BriefingCommand | undefined {
  return action.type === "run_cmd" && action.commandId !== undefined ? BRIEFING_COMMANDS[action.commandId] : undefined;
}
