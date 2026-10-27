"use client";

import { useEffect, useState } from "react";

/** Odağı alınca ekran klavyesi açan alanlar: yazı kutuları (onay kutusu, düğme gibi türler hariç), metin alanı, düzenlenebilir içerik. */
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "range", "color", "file", "image", "reset", "submit"]);

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return target.isContentEditable === true;
}

/**
 * Şu an bir yazı alanında odak var mı. Telefonda ekran klavyesi açılınca sabit sohbet düğmesi klavyenin üstüne çıkıp yazılan alanı
 * örter; düğmeyi çizen bileşen bu değerle (yalnız dar ekranda) düğmeyi gizler. Sunucuda ve ilk çizimde `false`.
 *
 * Odaktaki alan DOM'dan kaldırılırsa (kapanan pencerenin yazı kutusu) tarayıcıların hepsi `focusout` göndermez; bu yüzden alan
 * odaktayken belge değişimleri izlenir ve odak artık bir yazı alanında değilse değer `false`'a döner. İzleme yalnız yazı alanı
 * odaktayken açıktır.
 */
export function useTextEntryFocus(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setFocused(isTextEntry(event.target));
    const onFocusOut = () => setFocused(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  useEffect(() => {
    if (!focused) return;
    const observer = new MutationObserver(() => {
      if (!isTextEntry(document.activeElement)) setFocused(false);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [focused]);
  return focused;
}
