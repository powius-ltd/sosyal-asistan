/**
 * Geçerli çalışma alanı kararı (saf; ağ/çerez yok): çerez → geçerliyse ve kayıtta varsa o; değilse varsayılan (`LOCAL_WORKSPACE_ID`).
 * Operatör modu kapalıysa çerez hiç okunmuş sayılmaz. Çerez yalnız kimlik taşır: her istekte `exists` ile doğrulanır
 * (silinmiş/uydurma kimlik varsayılana düşer, hata vermez).
 */
import { isUuid } from "@/lib/data/supabase/errors";

export interface ChooseWorkspaceInput {
  /** `LOCAL_WORKSPACE_ID`. */
  defaultId: string;
  /** `sp_ws` çerezinin ham değeri (yoksa undefined). */
  cookieValue: string | undefined;
  /** `isOperatorMode()`. */
  operatorMode: boolean;
  /** Kayıtta var mı (yalnız UUID biçimli kimlikler için çağrılır). */
  exists: (workspaceId: string) => Promise<boolean>;
}

export async function chooseWorkspaceId({ defaultId, cookieValue, operatorMode, exists }: ChooseWorkspaceInput): Promise<string> {
  if (!operatorMode) return defaultId;
  const candidate = cookieValue?.trim().toLowerCase();
  if (!candidate || candidate === defaultId.toLowerCase() || !isUuid(candidate)) return defaultId;
  return (await exists(candidate)) ? candidate : defaultId;
}
