import {
  Bell,
  Bookmark,
  CalendarDays,
  ChartNoAxesColumn,
  Compass,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Settings,
  SquarePlay,
  type LucideIcon,
} from "lucide-react";

import { ROUTES, TICKET_ROUTE_PREFIX } from "@/lib/routes";

/**
 * Gezinme haritası — TEK kaynak. Üst çubuk (web), alt çubuk (telefon), ikinci düzey sekme şeridi ve profil menüsü buradan türer;
 * hangi rotanın hangi ana maddeye / menü kümesine ait olduğu başka yerde yazılmaz.
 */

export type PrimaryId = "today" | "plan" | "videos" | "results";
export type MenuGroupId = "account" | "backstage";
/** Bir yolun ait olduğu yer: ana madde ya da profil menüsü. */
export type NavArea = PrimaryId | "menu";

/** Bir sayfaya giden bağlantı (ikinci düzey sekme ya da profil menüsü maddesi). */
export interface NavLeaf {
  href: string;
  label: string;
  /** Profil menüsünde çizilir; sekme şeridi ikonsuzdur. */
  icon?: LucideIcon;
  /** Sekme şeridinde bu maddeden önce ince ayraç + (geniş ekranda) küme adı çizilir. */
  groupLabel?: string;
  /** Yalnız yönetici modunda sekme şeridinde çizilir (müşteri görmez); adresle açılırsa sayfa kendi kapısını sorar. */
  operatorOnly?: boolean;
}

/** Ana madde. `sections`: madde içi sayfalar (ikinci düzey sekmeler); tek sayfalı maddede boş. */
export interface NavPrimary {
  id: PrimaryId;
  label: string;
  icon: LucideIcon;
  href: string;
  sections: readonly NavLeaf[];
}

/** Profil menüsündeki küme. `operatorOnly`: yalnız yönetici modunda çizilir (müşteri hiç görmez). */
export interface NavMenuGroup {
  id: MenuGroupId;
  label: string;
  operatorOnly?: boolean;
  items: readonly NavLeaf[];
}

export const NAV_PRIMARY: readonly NavPrimary[] = [
  { id: "today", label: "Bugün", icon: LayoutGrid, href: ROUTES.overview, sections: [] },
  {
    id: "plan",
    label: "Plan",
    icon: CalendarDays,
    href: ROUTES.thisWeek,
    sections: [
      { href: ROUTES.thisWeek, label: "Bu hafta" },
      { href: ROUTES.ideas, label: "Fikirler" },
    ],
  },
  {
    id: "videos",
    label: "Videolar",
    icon: SquarePlay,
    href: ROUTES.content,
    sections: [
      { href: ROUTES.content, label: "İçeriklerim" },
      { href: ROUTES.publish, label: "Yayın" },
    ],
  },
  {
    id: "results",
    label: "Sonuçlar",
    icon: ChartNoAxesColumn,
    href: ROUTES.results,
    sections: [
      { href: ROUTES.results, label: "Özet" },
      { href: ROUTES.outliers, label: "Tutanlar" },
      { href: ROUTES.competitors, label: "Rakipler" },
      { href: ROUTES.comparison, label: "Karşılaştırma" },
      { href: ROUTES.anatomy, label: "Kreatif anatomisi", groupLabel: "Neye dayanıyorum" },
      { href: ROUTES.hooks, label: "Açılış kütüphanesi" },
      { href: ROUTES.ads, label: "Reklamlar", operatorOnly: true },
    ],
  },
];

export const NAV_MENU_GROUPS: readonly NavMenuGroup[] = [
  {
    id: "account",
    label: "Hesap",
    items: [
      { href: ROUTES.notifications, label: "Bildirimler", icon: Bell },
      { href: ROUTES.settings, label: "Ayarlar", icon: Settings },
    ],
  },
  {
    id: "backstage",
    label: "Kulis",
    operatorOnly: true,
    items: [
      { href: ROUTES.jobs, label: "İşler", icon: ListChecks },
      { href: ROUTES.discover, label: "Keşfet", icon: Compass },
      { href: ROUTES.collections, label: "Koleksiyonlar", icon: Bookmark },
    ],
  },
];

/**
 * Haritada maddesi OLMAYAN akış sayfaları: gezinmeden değil bağlamdan açılır (başlangıç akışı: hesap seçicideki "Hesap ekle" ve Bugün
 * kartı). Sekme şeridi ve profil menüsü bunları çizmez.
 */
export const NAV_FLOW_ROUTES: readonly string[] = [ROUTES.onboarding];

/** Haritada maddesi olmayan ama bir ana maddeye ait yollar (ör. `/video/[id]` → Sonuçlar; başlangıç akışı → Bugün). */
const EXTRA_OWNERS: readonly { prefix: string; primary: PrimaryId }[] = [
  { prefix: "/video", primary: "results" },
  { prefix: ROUTES.onboarding, primary: "today" },
  { prefix: TICKET_ROUTE_PREFIX, primary: "plan" },
];

/** Ana maddenin çizilecek sekmeleri: yalnız yöneticiye açık olanlar müşteriden gizlenir. */
export function visibleSections(primary: NavPrimary, operatorMode: boolean, copyEdition = false): readonly NavLeaf[] {
  // Müşteri kopyasında reklam modülü yoktur (yönetici modu açık olsa da): sekme çizilmez.
  return primary.sections.filter((leaf) => (operatorMode || leaf.operatorOnly !== true) && !(copyEdition && leaf.href === ROUTES.ads));
}

/** Çizilecek menü kümeleri: kulis yalnız yönetici modunda. */
export function visibleMenuGroups(operatorMode: boolean): readonly NavMenuGroup[] {
  return NAV_MENU_GROUPS.filter((group) => operatorMode || !group.operatorOnly);
}

export function primaryById(id: PrimaryId): NavPrimary {
  const found = NAV_PRIMARY.find((primary) => primary.id === id);
  if (!found) throw new Error(`Bilinmeyen ana madde: ${id}`);
  return found;
}

function owns(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavLocation {
  area: NavArea;
  /** Yolun ait olduğu madde (en uzun eşleşen adres); maddesi olmayan yolda (ör. `/video/…`, Bugün) yok. */
  leaf?: NavLeaf;
}

/**
 * Yol → ana madde (ya da profil menüsü) + (varsa) madde. En uzun eşleşen adres kazanır (`/rakipler/kesfet`, `/rakipler`'den önce).
 * Yönetici modundan bağımsızdır: gizli kümedeki bir sayfa adresle açılırsa yine menü etkin görünür.
 * Haritada olmayan yol → `undefined` (hiçbir madde etkin değil).
 */
export function locate(pathname: string): NavLocation | undefined {
  let best: (NavLocation & { length: number }) | undefined;
  const consider = (href: string, area: NavArea, leaf?: NavLeaf) => {
    if (owns(href, pathname) && (!best || href.length > best.length)) best = { area, leaf, length: href.length };
  };
  for (const primary of NAV_PRIMARY) {
    if (primary.sections.length === 0) consider(primary.href, primary.id);
    for (const leaf of primary.sections) consider(leaf.href, primary.id, leaf);
  }
  for (const group of NAV_MENU_GROUPS) for (const leaf of group.items) consider(leaf.href, "menu", leaf);
  for (const extra of EXTRA_OWNERS) consider(extra.prefix, extra.primary);
  if (!best) return undefined;
  const { area, leaf } = best;
  return { area, leaf };
}

/**
 * Ana maddenin `aria-current` değeri (üst ve alt çubuk AYNI kural): maddenin kendi adresindeyken `page`; alt sayfasındayken `true`
 * (sayfayı ikinci düzey sekme işaretler, ana madde "bu bölümdesin" der); başka yerde yok.
 */
export function primaryCurrent(primary: NavPrimary, pathname: string): "page" | "true" | undefined {
  if (locate(pathname)?.area !== primary.id) return undefined;
  return pathname === primary.href ? "page" : "true";
}

/** Kopya kabuğunun (müşteri kopyası, `PANEL_EDITION=kopya`) sol menü maddesi. Etkinlik `locate` ile bulunur: `area` bölge, `leafHref` bölge içi sayfa. */
export interface CopyNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Bölgenin tümü bu maddeyi etkin yapar (alt sayfalar dahil). */
  area?: PrimaryId;
  /** Yalnız bu sayfa (`locate(...).leaf.href`) bu maddeyi etkin yapar. */
  leafHref?: string;
  /** Madde etkin bölgedeyken altında girintili görünen bağlantılar. */
  children?: readonly NavLeaf[];
}

/** Kopya menüsü: Yayın, Karşılaştırma, Reklamlar ve Kulis YOK. Rotalar `ROUTES`'tan; Bildirimler + Ayarlar `NAV_MENU_GROUPS` "account"tan gelir. */
export const NAV_COPY: readonly CopyNavItem[] = [
  { label: "Bugün", href: ROUTES.overview, icon: LayoutGrid, area: "today" },
  { label: "Bu hafta", href: ROUTES.thisWeek, icon: CalendarDays, leafHref: ROUTES.thisWeek },
  { label: "Fikirler", href: ROUTES.ideas, icon: Lightbulb, leafHref: ROUTES.ideas },
  { label: "Videolarım", href: ROUTES.content, icon: SquarePlay, area: "videos" },
  {
    label: "Sonuçlar",
    href: ROUTES.results,
    icon: ChartNoAxesColumn,
    area: "results",
    children: [
      { href: ROUTES.outliers, label: "Tutanlar" },
      { href: ROUTES.competitors, label: "Rakipler" },
      { href: ROUTES.anatomy, label: "Neden tuttu" },
      { href: ROUTES.hooks, label: "Açılış kütüphanesi" },
    ],
  },
];

/** Kopya menüsünün altındaki sabit maddeler (Bildirimler, Ayarlar). */
export const NAV_COPY_FOOTER: readonly NavLeaf[] = NAV_MENU_GROUPS.find((group) => group.id === "account")?.items ?? [];

/** Kopya menü maddesi bu yolda etkin mi: `page` (kendi adresi) / `true` (bölgesinde) / yok. */
export function copyItemCurrent(item: CopyNavItem, pathname: string): "page" | "true" | undefined {
  const location = locate(pathname);
  if (!location) return undefined;
  const hit = item.leafHref !== undefined ? location.leaf?.href === item.leafHref : location.area === item.area;
  if (!hit) return undefined;
  return pathname === item.href ? "page" : "true";
}

/** Alt ya da alt çubuk maddesi (tek sayfa) bu yolda etkin mi: yolun ait olduğu madde bu adrestir. */
export function leafCurrent(leaf: NavLeaf, pathname: string): "page" | undefined {
  return locate(pathname)?.leaf?.href === leaf.href ? "page" : undefined;
}

/** Sonuçlar gibi alt bağlantılı maddenin alt bağlantıları görünür mü: yalnız kendi bölgesindeyken. */
export function copyChildrenVisible(item: CopyNavItem, pathname: string): boolean {
  return item.children !== undefined && copyItemCurrent(item, pathname) !== undefined;
}
