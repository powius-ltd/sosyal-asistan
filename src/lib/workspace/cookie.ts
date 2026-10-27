/**
 * `sp_ws` çerezi (operatör modu): okuma sayfa/düzen bağlamında, yazma YALNIZ server action'da (`app/actions/workspace.ts`).
 * İstek bağlamı dışında (betik, birim test) çerez yoktur: `undefined` döner. Next'in kendi akış sinyalleri (dinamik render) yutulmaz.
 */
import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { WORKSPACE_COOKIE } from "@/lib/workspace/operator-mode";

export async function readWorkspaceCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(WORKSPACE_COOKIE)?.value;
  } catch (error) {
    unstable_rethrow(error);
    return undefined;
  }
}

/**
 * Seçimi kalıcılaştırır (1 yıl, yalnız sunucu okur, aynı site). Yalnız server action/route handler içinden çağrılır.
 * `secure` işaretlenmez: operatör modu yerel `http://` adresinde çalışır; çerez yalnız bir kimlik taşır, yetki vermez.
 */
export async function writeWorkspaceCookie(workspaceId: string): Promise<void> {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
