/**
 * Çalışma alanları (yerel, operatör modu): `npm run workspace -- list`,
 * `npm run workspace -- create --name=<ad> --handle=<kullanıcı adı> [--type=business|creator|mixed] [--niche=…] [--tz=…] [--audience-tz=…] [--region=TR|US|TR_US] [--lang=tr|en] [--platform=instagram]` ve
 * `npm run workspace -- set --workspace=<id|slug|ad> [--type=business|creator|mixed] [--lang=tr|en] [--agent-cap=<usd>] [--collect-every=<gün>] [--videos=<sayı>] [--rivals=<sayı>]`
 * (yönetici ajan ayarları; `--agent-cap` vermek tavanı ONAYLAMAKTIR: ajan o tutara kadar toplama / rakip bulmayı kendisi açar).
 *
 * `create`: çalışma alanı + `LOCAL_USER_ID` için `owner` üyelik + kendi hesap + uyarı ayarı TEK işlemde (`public.create_workspace`). Para
 * harcamaz ve toplama BAŞLATMAZ; yeni çalışma alanı boş doğar (sonraki adımlar çıktıda). `set`: var olan çalışma alanının YALNIZ hesap türünü
 * ve/veya içerik dilini günceller (başka alana, veriye dokunmaz; `--workspace` zorunlu: örtük varsayılan yok). `.env.local` Node'un
 * `--env-file`'ıyla yüklenir; gizli değerler yazdırılmaz. Çıkış kodu: 0 tamam · 1 hata/geçersiz girdi.
 */
import { missingEnv } from "@/lib/intel/context";
import { parseCreateArgs, parseSetArgs, WORKSPACE_USAGE } from "@/lib/workspace/create-args";
import { createSupabaseWorkspace, listSupabaseWorkspaces, updateSupabaseWorkspaceSettings } from "@/lib/workspace/registry-db";
import { resolveWorkspaceArg, splitWorkspaceArg, workspaceBanner } from "@/lib/workspace/resolve-arg";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_USER_ID"] as const;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "list" && command !== "create" && command !== "set") {
    console.error(WORKSPACE_USAGE);
    return 1;
  }
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }

  if (command === "list") {
    if (rest.length > 0) throw new Error(`list argüman almaz.\n${WORKSPACE_USAGE}`);
    const list = await listSupabaseWorkspaces();
    console.log(`${list.length} çalışma alanı (slug · ad · kendi hesap · kimlik):`);
    for (const item of list) {
      const accounts = item.accounts.map((a) => `${a.platform} @${a.handle}`).join(", ") || "kendi hesap yok";
      console.log(`  ${item.slug ?? item.id.slice(0, 8)} · ${item.name} · ${accounts} · ${item.id}`);
    }
    return 0;
  }

  if (command === "set") {
    const { workspace: ref, rest: flags } = splitWorkspaceArg(rest);
    if (ref === undefined) throw new Error(`set için --workspace=<id|slug|ad> zorunlu.\n${WORKSPACE_USAGE}`);
    const target = await resolveWorkspaceArg(ref);
    const updated = await updateSupabaseWorkspaceSettings(target.id, parseSetArgs(flags));
    console.log(`Güncellendi. ${workspaceBanner(updated)}`);
    console.log(`  hesap türü ${updated.accountType} · içerik dili ${updated.contentLanguage ?? "otomatik"} · ajan tavanı ${updated.agentMonthlyCapUsd === undefined ? "onaysız" : `${updated.agentMonthlyCapUsd} USD`}`);
    return 0;
  }

  const created = await createSupabaseWorkspace(parseCreateArgs(rest));
  const ref = created.slug ?? created.id;
  console.log(`Oluşturuldu. ${workspaceBanner(created)}`);
  console.log(`  kimlik ${created.id} · kendi hesap ${created.accounts.map((a) => `${a.platform} @${a.handle}`).join(", ")}`);
  console.log("Toplama BAŞLATILMADI (Apify parası senin onayına bağlı). Sonraki adımlar:");
  console.log("  1. Panelde bu çalışma alanına geç, Rakipler sayfasından rakip ekle.");
  console.log(`  2. Kuru koşu (ücretsiz):    npm run rutin -- --workspace=${ref} --dry-run`);
  console.log(`  3. Toplama (PARA HARCAR):   npm run rutin -- --workspace=${ref} --apify-max=<usd>`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Çalışma alanı işlemi başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
