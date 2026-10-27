/**
 * Metni panoya yazar. Pano API'si yoksa (güvenli olmayan bağlam: `http://` + localhost dışı) ya da tarayıcı izin
 * vermezse (kullanıcı hareketi geçmiş, izin reddi) `false` döner; çağıran metni elle kopyalanacak biçimde gösterir.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
