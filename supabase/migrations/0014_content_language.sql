-- 0014: çok hesap uyumu — çalışma alanı içerik dili. YALNIZ EKLEMELİ: yeni sütun + yeni fonksiyon aşırı yüklemesi; mevcut satırlara
-- DOKUNULMAZ (gerçek çalışma alanlarının dili NULL kalır: dil çıkarımla bulunur, bkz. src/lib/workspace/content-language.ts).
-- Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- content_language: hesabın yayınladığı içeriğin dili (hook/script/açıklama taslağı bu dilde üretilir). NULL = ayarlanmadı (otomatik:
-- kendi transcript dillerinin çoğunluğu → uyum bölgesi → en). Desteklenen diller uygulamada ve burada aynı listedir; yeni dil =
-- kontrol + uygulama (istem kuralları) birlikte genişler.

alter table public.workspaces
  add column content_language text,
  add constraint workspaces_content_language_check check (content_language is null or content_language in ('tr', 'en'));

-- Kullanıcı düzenleyebilir alan (niş tanımı gibi): sütun bazında yazma yetkisi.
grant update (content_language) on public.workspaces to authenticated;

-- create_workspace: 10. parametre p_content_language (boş dize/NULL = ayarlanmadı). Yeni aşırı yükleme gerçek işi yapar; 9 parametreli
-- eski imza AYNEN kalır ve ona NULL ile devreder (eski çağrılar bozulmaz; iki imzanın da ortak varsayılanı yok: PostgREST belirsizliği yok).
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

  insert into public.workspaces (name, slug, timezone, audience_timezone, niche_brief, compliance_region, content_language)
  values (
    btrim(p_name),
    v_slug,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'Europe/Istanbul'),
    nullif(btrim(coalesce(p_audience_timezone, '')), ''),
    nullif(btrim(coalesce(p_niche_brief, '')), ''),
    coalesce(nullif(btrim(coalesce(p_compliance_region, '')), ''), 'TR'),
    nullif(btrim(coalesce(p_content_language, '')), '')
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user, 'owner');
  insert into public.social_accounts (workspace_id, platform, handle, connection) values (v_ws.id, p_platform, p_handle, 'scrape_only');
  insert into public.alert_settings (workspace_id) values (v_ws.id);

  return v_ws;
end;
$$;
revoke all on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text) to service_role;

-- Eski 9 parametreli imza: aynı davranış (içerik dili ayarlanmadı), gövde yeni işleve devreder. Yetkiler 0013'teki gibi (yalnız service role).
create or replace function public.create_workspace(
  p_user uuid,
  p_name text,
  p_slug text,
  p_timezone text,
  p_audience_timezone text,
  p_niche_brief text,
  p_compliance_region text,
  p_platform public.platform,
  p_handle text
)
returns public.workspaces
language plpgsql
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  select * into v_ws from public.create_workspace(
    p_user, p_name, p_slug, p_timezone, p_audience_timezone, p_niche_brief, p_compliance_region, p_platform, p_handle, null::text
  );
  return v_ws;
end;
$$;
