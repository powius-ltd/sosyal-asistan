/**
 * Tek bir Reel'i Zernio üzerinden Instagram'a gönderir: `npm run zernio:paylas -- --video=<mp4> --aciklama=<md|txt> [--saat=…] [--kapak-ms=…] [--onay=<dosya adı>]`.
 *
 *   --video=<yol>        MP4 (Reel sınırı: 3 sn – 15 dk, ≤300 MB, 9:16)
 *   --aciklama=<yol>     açıklama dosyası; içinde "## Açıklama" başlığı varsa yalnız o bölüm, yoksa dosyanın tamamı
 *   --saat="YYYY-AA-GG SS:DD"  Europe/Istanbul saatiyle zamanla; verilmezse hemen yayınla
 *   --kapak-ms=<ms>      kapak karesi (thumbOffset), videonun başından milisaniye; varsayılan 0
 *   --onay=<dosya adı>   GERÇEK gönderim. Değer videonun dosya adı olmalı (ör. claudemd-v1.mp4): onay o videoya bağlı kalır
 *
 *   --siparis=<fiş.md>  stüdyo sipariş fişinden paylaşır (video fişin yanından, açıklama stüdyonun aciklama.txt'sinden ya da fikrin
 *                        taslağından, saat ve CTA fişten); yalnız `durum: uretildi` + `onay: evet` fiş gerçekten gönderilir.
 *                        Gerçek gönderimde `--onay=<video dosya adı>` yine şart; paylaşınca fişe `paylasildi` + `zernio_post_id` + `yayin_url`
 *                        yazılır ve fikir yayınlanan Reels'e bağlanır (`idea_content_links`). `--video/--aciklama/--saat` ile birlikte verilmez.
 *   --dry-run            (yalnız --siparis ile) hiçbir şey göndermez; engeller varsa listeler ve gönderilecek isteği yine de basar
 *   --bagla              (yalnız --siparis ile) Zernio'ya dokunmadan: `paylasildi` fişin `yayin_url`'sini fikre bağlar
 *
 * Varsayılan deneme modudur: yalnız hesapları okur (GET) ve ne gideceğini yazdırır; yükleme ve gönderi yok. Yayın katmanı
 * (`PublishProvider`, docs/YAYIN-ARASTIRMA.md) gelmeden önceki en küçük çekirdek. `.env.local` Node'un `--env-file`'ıyla yüklenir;
 * `ZERNIO_API_KEY` yazdırılmaz. Çıkış kodu: 0 tamam · 1 hata / geçersiz girdi / gönderim başarısız · 2 Instagram hesabı bağlı değil.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { buildReelPost, createZernioPublishClient } from "@/lib/zernio/publish-client";
import { createSupabaseRepositoryFromEnv } from "@/lib/data/supabase/from-env";
import { panelSlugOfStudio } from "@/lib/studio-order/accounts";
import { linkPublishedOrder, markTicketPublished, planOrderPublish, type OrderPublishPlan } from "@/lib/studio-order/publish";
import { MAX_TARGET_SEC, MIN_TARGET_SEC } from "@/lib/studio-order/schema";
import { readTicket } from "@/lib/studio-order/ticket-file";
import { resolveWorkspaceArg } from "@/lib/workspace/resolve-arg";
import { orderVideoProblem } from "@/lib/publish/order-media";
import { chooseZernioAccount } from "@/lib/outcomes/measure-zernio";
import { pickZernioKey } from "@/lib/zernio/api-key";
import type { ZernioAccount } from "@/lib/zernio/schema";

const API = "https://zernio.com/api/v1";
const TIMEZONE = "Europe/Istanbul";
const CAPTION_MAX = 2200;
const HASHTAG_MAX = 30;

type Account = { _id: string; platform: string; username?: string; isActive: boolean };

function fail(message: string, code = 1): never {
  console.error(`HATA: ${message}`);
  process.exit(code);
}

function readCaption(path: string): string {
  const text = readFileSync(path, "utf8");
  const section = /^##\s*Açıklama[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
  return (section ? section[1] : text).trim();
}

/** "YYYY-AA-GG SS:DD" → Zernio'nun ofsetsiz `scheduledFor` biçimi (timezone ile yorumlanır). */
function parseSchedule(value: string, allowPast = false): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) fail(`--saat biçimi "YYYY-AA-GG SS:DD" olmalı (${TIMEZONE}); gelen: ${value}`);
  const local = `${m[1]}T${m[2]}:${m[3]}:00`;
  const nowIstanbul = new Date().toLocaleString("sv-SE", { timeZone: TIMEZONE }).replace(" ", "T");
  if (local <= nowIstanbul && allowPast) console.warn(`UYARI: saat geçmişte (${value}); gerçek gönderimde reddedilir`);
  else if (local <= nowIstanbul) fail(`--saat geçmişte (${TIMEZONE} şimdi ${nowIstanbul.slice(0, 16)}); geçmiş saat Zernio'da hemen yayın demektir`);
  return local;
}

function probe(path: string): { seconds: number; width: number; height: number } | undefined {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", path], { encoding: "utf8" });
    const json = JSON.parse(out) as { format: { duration: string }; streams: { width: number; height: number }[] };
    return { seconds: Number(json.format.duration), width: json.streams[0].width, height: json.streams[0].height };
  } catch {
    return undefined;
  }
}

async function api<T>(key: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

/** Fişin hesabına göre depo ve çalışma alanı (açıklama taslağı ve fikir bağı için). */
async function orderRepo(panelSlug: string) {
  const workspace = await resolveWorkspaceArg(panelSlug);
  return { repo: createSupabaseRepositoryFromEnv(), workspaceId: workspace.id };
}

const nodeFs = { exists: (path: string) => existsSync(path), read: (path: string) => readFileSync(path, "utf8") };

/** Fişten paylaşım planı; aciklama.txt yoksa ve fikir gerçekse açıklama taslağını DB'den (salt okuma) alıp planı yeniden kurar. */
async function planFromTicket(ticketPath: string, panelSlug: string): Promise<OrderPublishPlan> {
  const ticketText = readFileSync(ticketPath, "utf8");
  const first = planOrderPublish({ ticketPath, ticketText, fs: nodeFs });
  const ideaId = first.ticket.fikir_id;
  if (first.captionSource !== undefined || !ideaId || ideaId === "mock") return first;
  try {
    const { repo, workspaceId } = await orderRepo(panelSlug);
    const idea = await repo.getIdea(workspaceId, ideaId);
    return planOrderPublish({ ticketPath, ticketText, fs: nodeFs, ...(idea?.details.captionDraft ? { ideaCaption: idea.details.captionDraft } : {}) });
  } catch {
    return first; // açıklama okunamadı: engel olarak kalır
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      video: { type: "string" },
      aciklama: { type: "string" },
      saat: { type: "string" },
      "kapak-ms": { type: "string" },
      onay: { type: "string" },
      siparis: { type: "string" },
      "dry-run": { type: "boolean" },
      bagla: { type: "boolean" },
    },
  });
  const siparisPath = values.siparis;
  if (siparisPath === undefined && (values["dry-run"] || values.bagla)) fail("--dry-run ve --bagla yalnız --siparis ile kullanılır");

  let panelSlug: string | undefined;
  let plan: OrderPublishPlan | undefined;
  if (siparisPath !== undefined) {
    if (values.video || values.aciklama || values.saat) fail("--siparis ile --video / --aciklama / --saat birlikte verilmez (hepsi fişten okunur)");
    if (values["dry-run"] && values.onay !== undefined) fail("--dry-run ile --onay birlikte verilmez");
    if (!existsSync(siparisPath)) fail(`fiş bulunamadı: ${siparisPath}`);
    const ticket = readTicket(readFileSync(siparisPath, "utf8")).ticket;
    panelSlug = panelSlugOfStudio(ticket.hesap);
    if (values.bagla) {
      if (ticket.durum !== "paylasildi" || !ticket.yayin_url) fail('--bagla için fişte "durum: paylasildi" ve yayin_url olmalı');
      const { repo, workspaceId } = await orderRepo(panelSlug);
      const outcome = await linkPublishedOrder(repo, workspaceId, ticket, ticket.yayin_url);
      console.log(outcome.kind === "linked" ? `fikir ${ticket.fikir_id} → ${ticket.yayin_url} bağı: ${outcome.link.status}` : `bağ kurulmadı: ${outcome.reason}`);
      return;
    }
    plan = await planFromTicket(siparisPath, panelSlug);
  } else if (!values.video || !values.aciklama) fail("--video ve --aciklama (ya da --siparis) zorunlu");

  const dryRunOrder = plan !== undefined && values["dry-run"] === true;
  const picked = siparisPath !== undefined ? pickZernioKey(panelSlug, process.env) : undefined;
  const key = picked?.apiKey ?? (siparisPath === undefined ? process.env.ZERNIO_API_KEY : undefined);
  if (!key) fail(siparisPath !== undefined ? `Zernio anahtarı yok (.env.local: ZERNIO_API_KEY_${(panelSlug ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")})` : "ZERNIO_API_KEY yok (.env.local)");

  const videoPath = plan ? plan.videoPath : values.video;
  const real = values.onay !== undefined;
  const blockers = plan?.blockers ?? [];
  if (real && blockers.length > 0) fail(`fiş paylaşılamaz: ${blockers.join("; ")}`);
  for (const warning of plan?.warnings ?? []) console.warn(`UYARI: ${warning}`);

  // Girdi denetimi
  const fileName = videoPath ? basename(videoPath) : "<video yok>";
  const videoThere = videoPath !== undefined && existsSync(videoPath);
  const size = videoThere ? statSync(videoPath).size : (dryRunOrder ? 0 : fail(`video bulunamadı: ${videoPath}`));
  const videoProblem = videoThere ? orderVideoProblem(fileName, size) : undefined; // panel yoluyla ORTAK tür / boyut kuralı
  if (videoProblem) fail(videoProblem.message);
  const media = videoThere ? probe(videoPath) : undefined;
  if (media && (media.seconds < MIN_TARGET_SEC || media.seconds > MAX_TARGET_SEC)) fail(`süre ${media.seconds.toFixed(1)} sn; Reel ${MIN_TARGET_SEC} sn – ${MAX_TARGET_SEC / 60} dk olmalı`);
  if (media && Math.abs(media.width / media.height - 9 / 16) > 0.01) console.warn(`UYARI: en-boy ${media.width}x${media.height}, 9:16 değil`);
  const caption = plan ? (plan.caption ?? "") : readCaption(values.aciklama as string);
  if (!caption && !dryRunOrder) fail("açıklama boş");
  if (caption.length > CAPTION_MAX) fail(`açıklama ${caption.length} karakter; sınır ${CAPTION_MAX}`);
  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > HASHTAG_MAX) fail(`${hashtags} hashtag; sınır ${HASHTAG_MAX}`);
  const thumbOffset = Number(values["kapak-ms"] ?? 0);
  if (!Number.isInteger(thumbOffset) || thumbOffset < 0 || (media && thumbOffset > media.seconds * 1000)) fail("--kapak-ms video süresi içinde tam sayı olmalı");
  const saat = plan ? plan.scheduleStamp : values.saat;
  const scheduledFor = saat ? parseSchedule(saat, dryRunOrder) : undefined;
  if (real && values.onay !== fileName) fail(`--onay değeri videonun dosya adı olmalı (${fileName}); onay başka videoya taşınmaz`);

  // Hesap (yalnız okuma)
  const accounts = await api<{ accounts?: Account[]; error?: string }>(key, "GET", "/accounts?platform=instagram");
  if (accounts.status !== 200) fail(`GET /accounts ${accounts.status}: ${accounts.json.error ?? "bilinmeyen hata"}`);
  const ig = accounts.json.accounts?.filter((a) => a.platform === "instagram" && a.isActive) ?? [];
  let account: Account | undefined = ig[0];
  if (siparisPath !== undefined) {
    // Fiş yolu: Zernio hesabı çalışma alanının kendi hesabının tutamağıyla eşleşir (tek hesap yedeği YOK).
    const { repo, workspaceId } = await orderRepo(panelSlug as string);
    const handles = (await repo.listOwnAccounts(workspaceId)).filter((a) => a.platform === "instagram").map((a) => a.handle);
    const chosen = chooseZernioAccount(ig as ZernioAccount[], handles);
    if (chosen.account === undefined) fail(`Zernio hesabı seçilemedi: ${chosen.reason ?? "eşleşme yok"} (çalışma alanı: ${panelSlug})`);
    account = ig.find((a) => a._id === chosen.account?._id);
  } else if (ig.length > 1) fail(`birden çok etkin Instagram hesabı (${ig.map((a) => a.username).join(", ")}); hesap seçimi henüz yok`);

  const post = buildReelPost({ caption, mediaUrl: "<yüklemeden sonra publicUrl>", accountId: account?._id ?? "<bağlı değil>", thumbOffsetMs: thumbOffset, ...(scheduledFor ? { scheduledFor } : {}) });

  console.log(`${real ? "GERÇEK GÖNDERİM" : "DENEME (hiçbir şey gönderilmez)"}`);
  if (blockers.length > 0) console.log(`  ENGELLER (gerçek gönderimde durdurur):\n${blockers.map((b) => `    - ${b}`).join("\n")}`);
  console.log(`  hesap   : ${account ? `@${account.username} (${account._id})` : "Instagram bağlı değil"}`);
  console.log(`  video   : ${videoPath} · ${(size / 1048576).toFixed(1)} MB${media ? ` · ${media.seconds.toFixed(1)} sn · ${media.width}x${media.height}` : " · ffprobe yok, süre denetlenmedi"}`);
  console.log(`  yayın   : ${scheduledFor ? `${scheduledFor.replace("T", " ").slice(0, 16)} ${TIMEZONE}` : "hemen"} · kapak ${thumbOffset} ms`);
  console.log(`  açıklama: ${caption.length} karakter, ${hashtags} hashtag\n---\n${caption}\n---`);
  console.log(`  POST /v1/posts gövdesi:\n${JSON.stringify(post, null, 2)}`);
  console.log("HATIRLATMA: açıklama bir ManyChat anahtar kelimesi istiyorsa (ör. SEMİNER) kural yayından ÖNCE açık olmalı.");

  if (!account) {
    console.log("\nZernio panelinden Instagram'ı bağla (zernio.com → Accounts), sonra yeniden dene.");
    process.exit(2);
  }
  if (!real) {
    console.log(`\nGerçek gönderim için: --onay=${fileName}`);
    return;
  }

  // 1) presign → 2) PUT → 3) gönderi (ortak istemci: panelin yayın işiyle aynı yol, `src/lib/zernio/publish-client.ts`)
  const zernio = createZernioPublishClient({ apiKey: key });
  const slot = await zernio.presign({ filename: fileName, contentType: "video/mp4", size });
  await zernio.upload(slot.uploadUrl, readFileSync(videoPath as string), "video/mp4");
  console.log(`yüklendi: ${slot.publicUrl}`);
  const created = await zernio.createPost({ ...post, mediaItems: [{ type: "video", url: slot.publicUrl }] });
  if (created.kind === "duplicate") fail(`aynı içerik son 24 saatte bu hesaba gönderilmiş/zamanlanmış (post ${created.existingPostId ?? "?"})`);
  const result = { _id: created.state.postId, status: created.state.status, platforms: created.state.instagram ? [{ platform: "instagram", status: created.state.instagram.status, platformPostUrl: created.state.instagram.permalink, errorMessage: created.state.instagram.errorMessage }] : [] };
  console.log(`post ${result._id} · HTTP ${created.httpStatus} · status=${result.status}`);
  for (const p of result.platforms) console.log(`  ${p.platform}: ${p.status ?? "?"}${p.platformPostUrl ? ` · ${p.platformPostUrl}` : ""}${p.errorMessage ? ` · ${p.errorMessage}` : ""}`);
  const ok = scheduledFor ? result.status === "scheduled" : result.status === "published";
  if (!ok) fail(`beklenen durum ${scheduledFor ? "scheduled" : "published"}, gelen ${result.status}`);

  // Fiş akışı: gönderi başarılıysa fişe yalnız panelin alanlarını yaz (durum: paylasildi, zernio_post_id, yayin_url), sonra fikri bağla.
  if (plan && siparisPath !== undefined && panelSlug !== undefined && result._id) {
    const permalink = result.platforms?.find((p) => p.platform === "instagram")?.platformPostUrl;
    writeFileSync(siparisPath, markTicketPublished(readFileSync(siparisPath, "utf8"), result._id, permalink));
    console.log(`fiş güncellendi: ${siparisPath} (durum: paylasildi)`);
    if (permalink) {
      const { repo, workspaceId } = await orderRepo(panelSlug);
      const outcome = await linkPublishedOrder(repo, workspaceId, plan.ticket, permalink);
      console.log(outcome.kind === "linked" ? `fikir bağı: ${outcome.link.status}` : `fikir bağı kurulmadı: ${outcome.reason}`);
    } else console.log('yayın adresi henüz yok; adres gelince: --siparis=<fiş> --bagla');
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
