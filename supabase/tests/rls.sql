-- RLS + yetki matrisi testi: çalışma alanları arası yalıtım, rol matrisi, sütun yetkileri, token tablosu, fonksiyon yetkileri.
-- Kimlikler için bkz. _fixture.sql. Kural: testler gerçek rolle (authenticated/anon) koşar, service role ile değil.

-- ── 1. Yapısal denetimler (postgres) ───────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'FAIL: public.% tablosunda RLS kapalı', r.relname;
  end loop;
  raise notice 'ok - public şemasındaki her tabloda RLS açık';

  if exists (select 1 from pg_policies where schemaname = 'public' and roles <> array['authenticated']::name[]) then
    raise exception 'FAIL: authenticated dışında bir role (anon/public) politika verilmiş';
  end if;
  raise notice 'ok - tüm politikalar yalnız authenticated rolüne';

  if exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public') then
    raise exception 'FAIL: anon rolünün public tablolarında yetkisi var';
  end if;
  raise notice 'ok - anon hiçbir public tabloya yetkili değil';
end $$;

select tap.eq($$select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'social_account_tokens'$$,
  '0', 'social_account_tokens: politika yok (RLS açık, kapı kapalı)');
select tap.eq($$select reloptions::text from pg_class where relname = 'content_latest_metrics'$$,
  '{security_invoker=true}', 'content_latest_metrics görünümü security_invoker');

do $$
declare
  t text;
begin
  -- Ingest / sunucu tabloları: authenticated için tablo düzeyinde de sütun düzeyinde de yazma yetkisi YOK.
  foreach t in array array[
    'content_items', 'metric_snapshots', 'account_snapshots', 'transcripts', 'content_analyses', 'idea_evidence',
    'collection_runs', 'social_accounts', 'social_account_tokens', 'workspace_members', 'panel_jobs'
  ] loop
    if has_any_column_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'FAIL: authenticated % tablosuna yazabiliyor', t;
    end if;
  end loop;
  raise notice 'ok - ingest/sunucu tablolarında authenticated yazma yetkisi yok';

  if has_any_column_privilege('authenticated', 'public.social_account_tokens', 'SELECT') then
    raise exception 'FAIL: authenticated token tablosunu okuyabiliyor';
  end if;
  raise notice 'ok - authenticated token tablosunu okuyamaz';

  -- Yayın işi: onay/durum/yayın sütunlarına INSERT ya da UPDATE yetkisi yok.
  foreach t in array array['status', 'approved_by', 'approved_at', 'container_id', 'published_external_id', 'attempt_count', 'last_error'] loop
    if has_column_privilege('authenticated', 'public.publish_jobs', t, 'INSERT, UPDATE') then
      raise exception 'FAIL: authenticated publish_jobs.% sütununa yazabiliyor', t;
    end if;
  end loop;
  raise notice 'ok - publish_jobs status/onay/yayın sütunlarına authenticated yazamaz';
end $$;

-- Fonksiyon yetkileri: yalnız service role bütçe/purge çağırır; trigger fonksiyonu kimseye açık değil.
select tap.ok(not has_function_privilege('authenticated', 'public.reserve_budget(uuid, text, numeric, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.reserve_budget(uuid, text, numeric, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.reserve_budget(uuid, text, numeric, jsonb)', 'execute'),
  'reserve_budget: yalnız service role EXECUTE');
select tap.ok(not has_function_privilege('authenticated', 'public.purge_expired_transcripts(timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.purge_expired_transcripts(timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.purge_expired_transcripts(timestamptz)', 'execute'),
  'purge_expired_transcripts: yalnız service role EXECUTE');
select tap.ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'handle_new_user: RPC olarak çağrılamaz');
select tap.ok(has_function_privilege('authenticated', 'private.is_member(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'private.is_member(uuid, text)', 'execute'),
  'private.is_member: authenticated çağırır, anon çağıramaz');
select tap.ok(has_function_privilege('authenticated', 'private.member_workspace_ids(text)', 'execute')
  and not has_function_privilege('anon', 'private.member_workspace_ids(text)', 'execute'),
  'private.member_workspace_ids: authenticated çağırır, anon çağıramaz');
select tap.ok(not exists (
  select 1 from pg_namespace where nspname = 'private' and has_schema_privilege('anon', oid, 'usage')),
  'private şema anon için kapalı');

-- Profil trigger'ı (handle_new_user): kullanıcı eklenince profil oluşur.
select tap.eq($$select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'A sahibi', 'handle_new_user: display_name meta verisinden');
select tap.eq($$select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$, 'a-editor@test.local', 'handle_new_user: meta yoksa e-posta');

-- ── 2. Yalıtım: A görür, B ve anon görmez ─────────────────────────────────────
-- Kredi tabloları (`credit_*`) döngü DIŞIDIR: kredi çalışma alanı üyeliğine değil KULLANICIYA aittir (`workspace_id` yalnız harcamanın
-- yeridir, erişim anahtarı değil). Onların yalıtımı credits.sql'de sınanır (sahibi görür; aynı çalışma alanının başka üyesi ve B görmez).
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
do $$
declare
  r record;
  n bigint;
  seen int := 0;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not like 'credit\_%' order by 1
  loop
    execute format('select count(*) from public.%I where workspace_id = %L', r.relname, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    if n < 1 then raise exception 'FAIL: A kendi % satırlarını göremiyor', r.relname; end if;
    execute format('select count(*) from public.%I where workspace_id <> %L', r.relname, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    if n <> 0 then raise exception 'FAIL: A, başka çalışma alanının % satırlarını görüyor (%)', r.relname, n; end if;
    seen := seen + 1;
  end loop;
  if seen < 20 then raise exception 'FAIL: yalıtım döngüsü yalnız % ilişkiyi taradı (20 bekleniyordu)', seen; end if;
  raise notice 'ok - A: % ilişkide kendi verisini görür, başkasınınkini görmez', seen;
  select count(*) into n from public.workspaces where id <> 'aaaaaaaa-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL: A başka workspace satırı görüyor'; end if;
  select count(*) into n from public.profiles where id <> 'aaaaaaaa-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'FAIL: A başkalarının profilini görüyor'; end if;
  raise notice 'ok - A: workspaces ve profiles yalıtımı';
end $$;
select tap.throws('42501', 'select count(*) from public.social_account_tokens', 'A token tablosunu okuyamaz (permission denied)');
reset role;

select set_config('request.jwt.claims', tap.claims('bbbbbbbb-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
do $$
declare
  r record;
  n bigint;
  seen int := 0;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not like 'credit\_%' order by 1
  loop
    execute format('select count(*) from public.%I where workspace_id = %L', r.relname, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    if n <> 0 then raise exception 'FAIL: B, A''nın % satırlarını görüyor (%)', r.relname, n; end if;
    execute format('select count(*) from public.%I where workspace_id <> %L', r.relname, 'bbbbbbbb-0000-4000-8000-000000000001') into n;
    if n <> 0 then raise exception 'FAIL: B, kendi dışındaki çalışma alanlarının % satırlarını görüyor (%)', r.relname, n; end if;
    seen := seen + 1;
  end loop;
  raise notice 'ok - B: % ilişkide A''nın satırlarını 0 görür (seed workspace dahil hiçbir başka çalışma alanı yok)', seen;
  select count(*) into n from public.workspaces;
  if n <> 1 then raise exception 'FAIL: B yalnız kendi workspace''ini görmeli, görülen %', n; end if;
  select count(*) into n from public.content_items where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'FAIL: B kendi içeriğini görmeli (yalıtım kilitleme değil)'; end if;
  raise notice 'ok - B kendi verisini görür (kapı yalnız başkasına kapalı)';
end $$;
reset role;

set local role anon;
do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces', 'workspace_members', 'profiles', 'social_accounts', 'social_account_tokens', 'competitors',
    'collection_runs', 'content_items', 'metric_snapshots', 'content_latest_metrics', 'account_snapshots',
    'transcripts', 'content_analyses', 'ideas', 'idea_evidence', 'publish_jobs', 'collections',
    'collection_items', 'alert_settings', 'notifications', 'voice_profiles', 'weekly_plans', 'weekly_plan_items',
    'content_topic_screens', 'idea_content_links', 'content_creative_labels', 'agent_briefings', 'content_topic_clusters',
    'panel_jobs', 'credit_accounts', 'credit_ledger', 'credit_holds', 'credit_hold_allocations', 'credit_lots', 'competitor_screens', 'viral_items'
  ] loop
    begin
      execute format('select count(*) from public.%I', t);
      raise exception 'FAIL: anon public.% tablosunu okuyabildi', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'ok - anon 29 ilişkinin hiçbirini okuyamaz (permission denied)';
end $$;
reset role;

-- ── 3. Rol matrisi (A çalışma alanı): viewer < editor < owner ───────────────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.ok(private.is_member('aaaaaaaa-0000-4000-8000-000000000001') and not private.is_member('aaaaaaaa-0000-4000-8000-000000000001', 'editor'),
  'is_member: viewer viewer olarak evet, editor olarak hayır');
select tap.eq($$select count(*)::text from private.member_workspace_ids() where member_workspace_ids = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'member_workspace_ids: viewer kümesinde çalışma alanı var');
select tap.eq($$select count(*)::text from private.member_workspace_ids('editor')$$, '0', 'member_workspace_ids: viewer editor kümesinde yok');
select tap.throws('42501', $$insert into public.collections (workspace_id, name, name_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'V', 'v')$$,
  'viewer koleksiyon ekleyemez (RLS)');
select tap.affects(0, $$update public.notifications set read_at = now() where id = 'aaaaaaaa-0000-4000-8000-0000000000a8'$$,
  'viewer bildirimi okundu işaretleyemez (0 satır)');
select tap.affects(0, $$update public.alert_settings set competitor_outlier_min_tier = 2 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'viewer uyarı ayarını değiştiremez (0 satır)');
select tap.throws('42501', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'x')$$,
  'viewer taslak açamaz (RLS)');
reset role;

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a2'), true);
set local role authenticated;
select tap.ok(private.is_member('aaaaaaaa-0000-4000-8000-000000000001', 'editor') and not private.is_member('aaaaaaaa-0000-4000-8000-000000000001', 'owner')
  and not private.is_member('aaaaaaaa-0000-4000-8000-000000000001', 'garip-rol'), 'is_member: editor editor evet, owner hayır, bilinmeyen rol hayır');
select tap.eq($$select count(*)::text from private.member_workspace_ids('editor')$$, '1', 'member_workspace_ids: editor editor kümesinde');
select tap.eq($$select count(*)::text from private.member_workspace_ids('owner')$$, '0', 'member_workspace_ids: editor owner kümesinde değil');
select tap.eq($$select count(*)::text from private.member_workspace_ids('garip-rol')$$, '0', 'member_workspace_ids: bilinmeyen rol → boş küme (erişim yok)');
select tap.affects(1, $$insert into public.collections (workspace_id, name, name_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Yeni', 'yeni')$$, 'editor koleksiyon ekler');
select tap.affects(1, $$update public.notifications set read_at = now() where id = 'aaaaaaaa-0000-4000-8000-0000000000a8'$$, 'editor bildirimi okundu işaretler');
select tap.throws('42501', $$update public.notifications set title = 'x' where id = 'aaaaaaaa-0000-4000-8000-0000000000a8'$$, 'editor bildirim başlığını değiştiremez (sütun yetkisi)');
select tap.affects(1, $$update public.alert_settings set competitor_outlier_min_tier = 2 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'editor uyarı ayarını değiştirir');
select tap.throws('23514', $$update public.alert_settings set email_enabled = true where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'e-posta kanalı adres olmadan açılamaz (check)', 'alert_settings_email_needs_address');
select tap.affects(1, $$update public.competitors set status = 'ignored' where id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'editor rakibi yoksayar');
select tap.throws('42501', $$update public.competitors set status = 'private' where id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'editor rakibe private/not_found durumu veremez (with check)');
select tap.affects(0, $$update public.competitors set status = 'tracked' where id = 'aaaaaaaa-0000-4000-8000-0000000000c3'$$, 'editor private rakibin durumunu değiştiremez (using)');
select tap.throws('42501', $$update public.competitors set handle = 'baska' where id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'editor rakip handle''ını değiştiremez (sütun yetkisi)');
select tap.affects(1, $$update public.ideas set status = 'saved' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'editor fikir durumunu değiştirir');
select tap.throws('42501', $$update public.ideas set title = 'x' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'editor fikir başlığını değiştiremez (sütun yetkisi)');
select tap.affects(0, $$update public.workspaces set name = 'Yeni ad' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'editor workspace ayarını değiştiremez (yalnız sahip)');
select tap.throws('42501', $$insert into public.content_items (workspace_id, platform, competitor_id, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'x', 'image')$$, 'editor içerik ekleyemez (ingest = sunucu)');
select tap.throws('42501', $$insert into public.collection_runs (workspace_id, provider, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'content')$$, 'editor koşu kaydı ekleyemez');
select tap.throws('42501', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 1, '{"kind":"content"}')$$, 'authenticated reserve_budget çağıramaz');
reset role;

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
select tap.affects(1, $$update public.workspaces set name = 'Yeni ad', apify_monthly_cap_usd = 25 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'sahip workspace ayarını (ad, tavan) günceller');
select tap.throws('23514', $$update public.workspaces set apify_monthly_cap_usd = 5000 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'tavan 1000 USD üstü reddedilir (check)', 'workspaces_apify_cap_range');
select tap.throws('23502', $$update public.workspaces set llm_monthly_cap_usd = null where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'tavan kaldırılamaz (NOT NULL)');
select tap.throws('42501', $$update public.workspaces set slug = 'baska' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'sahip bile slug''ı değiştiremez (sütun yetkisi)');
select tap.throws('42501', $$insert into public.workspaces (name, slug) values ('Yeni', 'yeni')$$, 'authenticated workspace oluşturamaz');
select tap.throws('42501', $$insert into public.workspace_members (workspace_id, user_id, role) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'owner')$$, 'authenticated kendini/başkasını üye yapamaz');
reset role;

-- ── 4. Çapraz kiracı yazma: A editörü B'nin çalışma alanına yazamaz ────────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a2'), true);
set local role authenticated;
select tap.throws('42501', $$insert into public.collections (workspace_id, name, name_key) values ('bbbbbbbb-0000-4000-8000-000000000001', 'X', 'x')$$, 'A editörü B çalışma alanına koleksiyon ekleyemez');
select tap.affects(0, $$update public.notifications set read_at = now() where id = 'bbbbbbbb-0000-4000-8000-0000000000a8'$$, 'A editörü B bildirimini güncelleyemez (0 satır)');
select tap.affects(0, $$delete from public.collections where id = 'bbbbbbbb-0000-4000-8000-0000000000c9'$$, 'A editörü B koleksiyonunu silemez (0 satır)');
select tap.affects(0, $$update public.ideas set status = 'saved' where id = 'bbbbbbbb-0000-4000-8000-0000000000a9'$$, 'A editörü B fikrini güncelleyemez (0 satır)');
select tap.throws('42501', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption) values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'instagram', 'x')$$, 'A editörü B hesabına taslak açamaz');
-- Kendi çalışma alanında ama başkasının içeriğine bağlanamaz (bileşik FK kiracı tutarlılığı).
select tap.throws('23503', $$insert into public.collection_items (collection_id, content_item_id, workspace_id) values ('aaaaaaaa-0000-4000-8000-0000000000c9', 'bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001')$$, 'başka çalışma alanının içeriği koleksiyona eklenemez (FK)');
select tap.throws('23503', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'instagram', 'x')$$, 'başka çalışma alanının hesabına yayın işi açılamaz (FK)');
reset role;

-- ── 5. Service role: token tablosunu yalnız o okur/yazar ──────────────────────
set local role service_role;
select tap.eq($$select count(*)::text from public.social_account_tokens$$, '1', 'service role token tablosunu okur');
reset role;
