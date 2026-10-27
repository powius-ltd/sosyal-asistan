-- 0013: çok çalışma alanı (operatör modu) — atomik çalışma alanı oluşturma. YALNIZ EKLEMELİ: yeni fonksiyon, hiçbir tablo/veri değişmez.
-- Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- `create_workspace`: çalışma alanı + sahip üyelik + kendi hesap (scrape_only) + uyarı ayarı satırı TEK işlemde (fonksiyon = tek transaction:
-- biri düşerse hiçbiri kalmaz). Bütçe tavanları tablo varsayılanında kalır (Apify 10 USD); ölçüm tavanı NULL (onaysız). Slug çakışırsa
-- `-2`, `-3` … eklenir. Giriş/üyelik altyapısı yok: sahip `LOCAL_USER_ID`'dir; Supabase Auth gelince aynı satırlar üyeliğe bağlanır.
-- İsteğe bağlı metinler boş dize ya da NULL olabilir (= verilmedi; üretilmiş tipte parametreler `string`).
-- Yalnız service role çağırır (istemci rolleri çağıramaz).

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

  insert into public.workspaces (name, slug, timezone, audience_timezone, niche_brief, compliance_region)
  values (
    btrim(p_name),
    v_slug,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'Europe/Istanbul'),
    nullif(btrim(coalesce(p_audience_timezone, '')), ''),
    nullif(btrim(coalesce(p_niche_brief, '')), ''),
    coalesce(nullif(btrim(coalesce(p_compliance_region, '')), ''), 'TR')
  )
  returning * into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws.id, p_user, 'owner');
  insert into public.social_accounts (workspace_id, platform, handle, connection) values (v_ws.id, p_platform, p_handle, 'scrape_only');
  insert into public.alert_settings (workspace_id) values (v_ws.id);

  return v_ws;
end;
$$;
revoke all on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text) from public, anon, authenticated;
grant execute on function public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text) to service_role;
