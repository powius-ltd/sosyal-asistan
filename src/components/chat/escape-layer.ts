/** Sohbet penceresinin kök elemanındaki işaret (`PopoverContent`): Esc'in bu pencereden mi geldiğini ayırt eder. */
export const CHAT_WINDOW_ATTRIBUTE = "data-chat-window";

/** Esc'i kendi başına ele alan açık katmanlar (modal pencere, menü, açılır liste). */
const OTHER_LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Basılan Esc sohbet penceresinden başka bir katmana mı ait? Sohbet belge düzeyinde Esc dinler (odak sayfadayken de kapansın), ama
 * üstte başka bir katman açıkken onu ezmemeli: olay zaten ele alınmışsa (`defaultPrevented`) ya da odak sohbet dışındaki bir
 * pencere/menü/listenin içindeyse true. Saf: yalnız olaya bakar.
 */
export function isEscapeForAnotherLayer(event: Event | undefined): boolean {
  if (event === undefined) return false;
  if (event.defaultPrevented) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(`[${CHAT_WINDOW_ATTRIBUTE}]`) !== null) return false;
  return target.closest(OTHER_LAYER_SELECTOR) !== null;
}
