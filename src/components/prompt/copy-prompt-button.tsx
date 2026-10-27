import { CopyPromptMenu, type CopyPromptSource } from "@/components/prompt/copy-prompt-menu";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export type { CopyPromptSource };

/**
 * "Prompt olarak kopyala" (fikir kartı, Video analizi): yalnız yönetici modunda çizilir; müşteri görünümünde hiç çizilmez
 * (D3-08: Dalga 2 kararı video sayfasında uygulanmamıştı). Kapı tek yerde, bu sarmalayıcıdadır: yeni yerleşimler de aynı
 * düğmeyi kullanır, kapıyı çağıran sayfaya bırakmaz. Sunucu bileşenidir (ortam değişkeni sunucuda okunur).
 */
export function CopyPromptButton({ source }: { source: CopyPromptSource }) {
  if (!isOperatorMode()) return null;
  return <CopyPromptMenu source={source} />;
}
