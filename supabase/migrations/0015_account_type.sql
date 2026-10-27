-- 0015: hesap türü (işletme / içerik üreticisi) + konu kümesi kalıcılığı. YALNIZ EKLEMELİ: yeni sütun, yeni tablo, yeni fonksiyon
-- aşırı yüklemesi; mevcut satırlara DOKUNULMAZ (tüm çalışma alanları varsayılan `business` olur; tür ataması ayrı bir karardır).
-- Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- account_type: `business` (işletme / koç: güven → müşteri → satış; açı × farkındalık matrisi) | `creator` (içerik üreticisi: erişim,
-- izlenme süresi, kaydet/paylaş, takipçi; konu × hook türü matrisi, açı etiketlemesi YOK) | `mixed` (karma: hem erişim hem satış; iki matris
-- birden, açı etiketlemesi VAR). Anlamı: src/lib/domain/account-type.ts.
-- Desteklenen türler uygulamada ve burada aynı listedir; yeni tür = kontrol + uygulama birlikte genişler.

alter table public.workspaces
  add column account_type text not null default 'business',
  add constraint workspaces_account_type_check check (account_type in ('business', 'creator', 'mixed'));

-- Kullanıcı düzenleyebilir alan (içerik dili gibi): sütun bazında yazma yetkisi.
grant update (account_type) on public.workspaces to authenticated;

-- create_workspace: 11. parametre p_account_type (boş dize/NULL = business). Yeni aşırı yükleme gerçek işi yapar; 10 parametreli (0014)
-- ve 9 parametreli (0013) eski imzalar AYNEN kalır ve ona devreder (eski çağrılar bozulmaz; imzaların ortak varsayılanı yok: PostgREST
-- belirsizliği yok). Yetkiler: yalnız service role.
create or replace function public.create_workspace(
  p_user uuid,
  p_name text,
  p_slug text,
  p_timezone text,
  p_audience_timezone text,
  p_niche_brief text,
  p_compliance_region text,
  p_platform public.platform,
  p_handle text,
  p_content_language text,
  p_account_type text
)
returns public.workspaces
language plpgsql
set search_path = ''
as $$
declare
  v_ws public.workspaces;
  v_slug text;
  v_n integer := 1;
begin
  if p_user is null or p_name is null or p_slug is null or p_platform is null or p_handle is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  v_slug := p_slug;
  while exists (select 1 from public.workspaces w where w.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(p_slug, 60) || '-' || v_n::text;
  end loop;

  insert into public.workspaces (name, slug, timezone, audience_timezone, niche_brief, compliance_region, content_language, account_type)
  values (
    btrim(p_name),
    v_slug,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'Europe/Istanbul'),
    nullif(btrim(coalesce(p_audience_timezone, '')), ''),
    nullif(btrim(coalesce(p_niche_brief, '')), ''),
    coalesce(nullif(btrim(coalesce(p_compliance_region, '')), ''), 'TR'),
    nullif(btrim(coalesce(p_content_language, '')), ''),
    coalesce(nullif(btrim(coalesce(p_account_type, '')), ''), 'business')
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user, 'owner');
  insert into public.social_accounts (workspace_id, platform, handle, connection) values (v_ws.id, p_platform, p_handle, 'scrape_only');
  insert into public.alert_settings (workspace_id) values (v_ws.id);

  return v_ws;
end;
$$;
revoke all on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text, text) to service_role;

-- Eski 10 parametreli imza (0014): aynı davranış (tür business), gövde yeni işleve devreder. Yetkiler 0014'teki gibi korunur (CREATE OR
-- REPLACE izinlere dokunmaz).
create or replace function public.create_workspace(
  p_user uuid,
  p_name text,
  p_slug text,
  p_timezone text,
  p_audience_timezone text,
  p_niche_brief text,
  p_compliance_region text,
  p_platform public.platform,
  p_handle text,
  p_content_language text
)
returns public.workspaces
language plpgsql
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  select * into v_ws from public.create_workspace(
    p_user, p_name, p_slug, p_timezone, p_audience_timezone, p_niche_brief, p_compliance_region, p_platform, p_handle, p_content_language, null::text
  );
  return v_ws;
end;
$$;

-- ── Konu kümeleri ──────────────────────────────────────────
-- İçerik başına GÜNCEL konu kümesi (yeniden kümeleme üzerine yazar). Kümeleme LLM işidir (`cluster-topics`, plan koşusu; yazan sunucu
-- görevi, service role); konu × hook türü matrisi (`getTopicHookMatrix`) bunu okur. Kümeye girmeyen içerik (model "uymuyor" dedi, metni
-- yok) için satır YAZILMAZ: satırın yokluğu "kümelenmedi" demektir, rastgele bir kümeye düşmez. Küme kimliği ayrı tablo DEĞİL, anahtardır
-- (`cluster_key`: taksonomi anahtar biçimi, ≤ 40; `cluster_label`: kısa ad, ≤ 80): aynı koşunun satırları aynı anahtar/etiketi taşır.
create table public.content_topic_clusters (
  content_item_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  cluster_key text not null check (cluster_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  cluster_label text not null check (char_length(btrim(cluster_label)) between 1 and 80),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- Kümelemeyi üreten koşu (abonelik çağrı sayacı); koşu silinirse satır kalır, run_id NULL olur.
  run_id uuid,
  clustered_at timestamptz not null default now(),
  constraint content_topic_clusters_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade,
  constraint content_topic_clusters_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
-- getTopicHookMatrix: workspace'in kümeleri (tek sorgu) ve küme başına içerik.
create index content_topic_clusters_key_idx on public.content_topic_clusters (workspace_id, cluster_key);
create index content_topic_clusters_run_idx on public.content_topic_clusters (run_id) where run_id is not null;
alter table public.content_topic_clusters enable row level security;

comment on table public.content_topic_clusters is 'Konu kümeleme (LLM): içerik başına güncel konu kümesi (anahtar + etiket). Satır yok = kümelenmedi. Konu × hook türü matrisi okur.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0006/0007/0008/0011 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.content_topic_clusters to service_role;
grant select on public.content_topic_clusters to authenticated;

create policy "content_topic_clusters: üye okur" on public.content_topic_clusters
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
