-- Veri bütünlüğü testi: kısıtlar, bileşik FK'lar, skor önbelleği, görünüm, transcript saklama süresi, cascade.
-- Kimlikler için bkz. _fixture.sql (postgres rolüyle çalışır; RLS bu dosyanın konusu değil).

-- ── İçerik sahibi + kiracı tutarlılığı ─────────────────────────────────────────
select tap.throws('23514', $$insert into public.content_items (workspace_id, platform, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'x1', 'image')$$,
  'sahibi olmayan içerik reddedilir', 'content_items_owner_xor');
select tap.throws('23514', $$insert into public.content_items (workspace_id, platform, social_account_id, competitor_id, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'x2', 'image')$$,
  'hem kendi hesap hem rakip sahipli içerik reddedilir', 'content_items_owner_xor');
select tap.throws('23503', $$insert into public.content_items (workspace_id, platform, social_account_id, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'x3', 'image')$$,
  'içerik platformu sahibinin platformuyla aynı olmalı (bileşik FK)');
select tap.throws('23503', $$insert into public.content_items (workspace_id, platform, social_account_id, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'x4', 'image')$$,
  'içerik başka çalışma alanının hesabına bağlanamaz (bileşik FK)');
select tap.throws('23505', $$insert into public.content_items (workspace_id, platform, competitor_id, external_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'ig_own_1', 'image')$$,
  'aynı platform + external_id ikinci kez yazılamaz', 'content_items_external_key');
select tap.throws('23503', $$insert into public.metric_snapshots (workspace_id, content_item_id, source) values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'apify')$$,
  'ölçüm başka çalışma alanının içeriğine yazılamaz (bileşik FK)');

-- ── Skor önbelleği: ölçülemedi = NULL; tutarsız/sonsuz değer yok ────────────────
select tap.throws('23514', $$update public.content_items set lift_tier = null where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'lift varken kademe NULL olamaz', 'content_items_lift_tier_pair');
select tap.throws('23514', $$update public.content_items set lift = 'NaN', lift_tier = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'NaN lift reddedilir', 'content_items_lift_check');
select tap.throws('23514', $$update public.content_items set lift = 'Infinity', lift_tier = 4 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'sonsuz lift reddedilir', 'content_items_lift_check');
select tap.throws('23514', $$update public.content_items set baseline_views = null where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'baz çizgisi olmadan lift olamaz', 'content_items_lift_needs_baseline');
select tap.throws('23514', $$update public.content_items set baseline_excluded = '{"self": 1}' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'baseline_excluded 7 sayacın hepsini taşımalı', 'content_items_baseline_excluded_check');
select tap.throws('23514', $$update public.content_items set baseline_basis = '{"contentItemId": "x"}' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'baseline_basis JSON dizi olmalı', 'content_items_baseline_basis_check');
select tap.affects(1, $$update public.content_items set baseline_basis = '[{"contentItemId": "aaaaaaaa-0000-4000-8000-0000000000d2", "views": 20000}]' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'baseline_basis baz çizgisi içeriklerini saklar');
select tap.throws('23514', $$update public.content_items set lift_tier = 5 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'kademe 0..4 dışı reddedilir', 'content_items_lift_tier_check');
select tap.affects(1, $$update public.content_items set lift = null, lift_tier = null, cross_score = null where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  'ölçülemeyen skor NULL yazılabilir (0 değil)');
select tap.throws('23514', $$update public.metric_snapshots set views = -1 where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$,
  'negatif izlenme reddedilir', 'metric_snapshots_views_check');
select tap.throws('23505', $$insert into public.metric_snapshots (workspace_id, content_item_id, source, collection_run_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'apify', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'aynı koşu aynı içeriğe ikinci ölçüm yazamaz (ingest idempotency)', 'metric_snapshots_run_content_key');

-- ── content_latest_metrics: içerik başına EN SON ölçüm ─────────────────────────
select tap.eq($$select views::text from public.content_latest_metrics where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, '900', 'son ölçüm: en yeni snapshot (900, eski 500 değil)');
select tap.eq($$select likes::text from public.content_latest_metrics where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, '40', 'son ölçümün tüm alanları aynı snapshot''tan');
select tap.eq($$select snapshot_id::text from public.content_latest_metrics where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, 'aaaaaaaa-0000-4000-8000-0000000000e2', 'snapshot_id en yeni kayıt');
select tap.eq($$select count(*)::text from public.content_latest_metrics where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2', 'içerik başına tek satır');
insert into public.content_items (id, workspace_id, platform, competitor_id, external_id, format)
values ('aaaaaaaa-0000-4000-8000-0000000000d3', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'ig_comp_2', 'image');
select tap.eq($$select (captured_at is null and views is null)::text from public.content_latest_metrics where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d3'$$, 'true', 'hiç ölçülmemiş içerik görünümde: captured_at/views NULL (0 değil)');

-- ── Transcript saklama süresi ──────────────────────────────────────────────────
select tap.throws('23505', $$insert into public.transcripts (workspace_id, content_item_id, provider, text, is_meaningful) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'deepgram', 'ikinci', false)$$,
  'içerik başına tek transcript', 'transcripts_content_unique');
select tap.throws('23514', $$insert into public.transcripts (workspace_id, content_item_id, provider, is_meaningful) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d3', 'apify', false)$$,
  'metin yalnız süre dolumuyla kaybolabilir (text NULL + expires_at NULL reddedilir)', 'transcripts_text_only_expires');
update public.transcripts set expires_at = now() - interval '1 day' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
set local role service_role;
select tap.eq($$select public.purge_expired_transcripts()::text$$, '1', 'purge_expired_transcripts süresi dolan 1 transcript''i boşaltır');
select tap.eq($$select public.purge_expired_transcripts()::text$$, '0', 'purge idempotent (ikinci çağrı 0)');
reset role;
select tap.eq($$select (text is null and segments is null)::text from public.transcripts where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, 'true', 'süresi dolan transcript''in metni boşaldı (satır ve analiz kalır)');
select tap.eq($$select (text is not null)::text from public.transcripts where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, 'true', 'kendi içeriğin transcript''i (expires_at NULL) silinmez');
select tap.eq($$select count(*)::text from public.content_analyses where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '1', 'transcript süresi dolunca analiz (hook alıntısı) kalır');

-- ── İçerik analizi ─────────────────────────────────────────────────────────────
select tap.throws('23505', $$insert into public.content_analyses (workspace_id, content_item_id, status, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'failed', 't', 'p')$$,
  'içerik başına tek güncel analiz', 'content_analyses_content_unique');
select tap.throws('23514', $$insert into public.content_analyses (workspace_id, content_item_id, status, evidence_verified, taxonomy_version, prompt_version) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'failed', true, 't', 'p')$$,
  'başarısız analiz "kanıtı doğrulanmış" olamaz', 'content_analyses_verified_needs_ok');
select tap.eq($$select count(*)::text from public.content_analyses where search_key ilike '%rival%expires%'$$, '1', 'search_key alt dize araması (trigram) çalışır');
select tap.ok(exists (select 1 from pg_indexes where indexname = 'content_analyses_search_trgm_idx' and indexdef ilike '%gin_trgm_ops%'), 'search_key trigram GIN indeksi var');

-- ── Fikirler ───────────────────────────────────────────────────────────────────
select tap.throws('23514', $$update public.ideas set hooks = '"tek"' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'hooks JSON dizi olmalı', 'ideas_hooks_check');
select tap.throws('23503', $$insert into public.idea_evidence (idea_id, content_item_id, workspace_id, lift_at_creation) values ('aaaaaaaa-0000-4000-8000-0000000000a9', 'bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 3)$$,
  'fikir başka çalışma alanının içeriğini kanıt gösteremez (bileşik FK)');

-- ── Koleksiyonlar ──────────────────────────────────────────────────────────────
select tap.throws('23505', $$insert into public.collections (workspace_id, name, name_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'ILHAM', 'ilham')$$,
  'aynı katlanmış ad (name_key) çalışma alanında ikinci kez yazılamaz', 'collections_name_key_unique');
select tap.affects(1, $$insert into public.collections (workspace_id, name, name_key) values ('bbbbbbbb-0000-4000-8000-000000000001', 'İlham', 'ilham')$$, 'aynı ad başka çalışma alanında serbest');
-- updated_at: BEFORE UPDATE trigger'ını geçici kapatıp tarihi eskitiriz; yalnız collection_items trigger'ı düzeltebilmeli.
alter table public.collections disable trigger collections_set_updated_at;
update public.collections set updated_at = '2000-01-01' where id = 'aaaaaaaa-0000-4000-8000-0000000000c9';
insert into public.collection_items (collection_id, content_item_id, workspace_id) values ('aaaaaaaa-0000-4000-8000-0000000000c9', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001');
select tap.eq($$select (updated_at > now() - interval '1 minute')::text from public.collections where id = 'aaaaaaaa-0000-4000-8000-0000000000c9'$$, 'true', 'öğe eklenince koleksiyonun updated_at''ı güncellenir');
update public.collections set updated_at = '2000-01-01' where id = 'aaaaaaaa-0000-4000-8000-0000000000c9';
delete from public.collection_items where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d1';
select tap.eq($$select (updated_at > now() - interval '1 minute')::text from public.collections where id = 'aaaaaaaa-0000-4000-8000-0000000000c9'$$, 'true', 'öğe çıkarılınca koleksiyonun updated_at''ı güncellenir');
update public.collections set updated_at = '2000-01-01' where id = 'aaaaaaaa-0000-4000-8000-0000000000c9';
alter table public.collections enable trigger collections_set_updated_at;
update public.collections set description = 'düzenlendi' where id = 'aaaaaaaa-0000-4000-8000-0000000000c9';
select tap.eq($$select (updated_at > now() - interval '1 minute')::text from public.collections where id = 'aaaaaaaa-0000-4000-8000-0000000000c9'$$, 'true', 'yeniden adlandırma/düzenleme updated_at''ı günceller (set_updated_at)');
select tap.throws('23505', $$insert into public.collection_items (collection_id, content_item_id, workspace_id) values ('aaaaaaaa-0000-4000-8000-0000000000c9', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'aynı içerik aynı koleksiyona ikinci kez eklenemez (birincil anahtar)');

-- ── Bildirimler + uyarı ayarları ───────────────────────────────────────────────
select tap.throws('23505', $$insert into public.notifications (workspace_id, kind, title, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'competitor_outlier', 'tekrar', 'aaaaaaaa-0000-4000-8000-0000000000d2')$$,
  'aynı tutan içerik için ikinci bildirim yazılamaz (tick idempotency)', 'notifications_outlier_once_key');
select tap.affects(1, $$insert into public.notifications (workspace_id, kind, title, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'system', 'aynı içerik, farklı tür', 'aaaaaaaa-0000-4000-8000-0000000000d2')$$, 'sistem bildirimi tekilleştirmeye takılmaz');
select tap.throws('23514', $$update public.alert_settings set weekly_digest_hour = 24 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'özet saati 0..23', 'alert_settings_weekly_digest_hour_check');
select tap.throws('23514', $$update public.alert_settings set weekly_digest_weekday = 7 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'özet günü 0..6', 'alert_settings_weekly_digest_weekday_check');
select tap.throws('23514', $$update public.alert_settings set own_outlier_min_tier = 0 where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'uyarı kademesi 1..4', 'alert_settings_own_outlier_min_tier_check');

-- ── Workspace, hesaplar, rakipler, koşular ─────────────────────────────────────
select tap.throws('23514', $$insert into public.workspaces (name, slug) values ('X', 'Kötü Slug')$$, 'slug biçimi doğrulanır', 'workspaces_slug_check');
select tap.eq($$with w as (insert into public.workspaces (name, slug) values ('Varsayılan', 'varsayilan') returning *) select concat_ws('/', timezone, apify_monthly_cap_usd::numeric(10,2), llm_monthly_cap_usd::numeric(10,2), compliance_region) from w$$,
  'Europe/Istanbul/10.00/10.00/TR', 'workspace varsayılanları: tz Istanbul, tavanlar 10 USD, uyum bölgesi TR');
select tap.throws('23514', $$update public.workspaces set compliance_region = 'EU' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'uyum bölgesi TR/US/TR_US', 'workspaces_compliance_region_check');
select tap.throws('23514', $$insert into public.social_accounts (workspace_id, platform, handle, connection) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'baglanmis', 'connected')$$,
  'bağlı hesap external_id ister', 'social_accounts_connected_needs_external_id');
select tap.throws('23505', $$insert into public.social_accounts (workspace_id, platform, handle) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'test_a_own')$$, 'aynı platform+handle tekil', 'social_accounts_handle_unique');
select tap.throws('23514', $$insert into public.social_accounts (workspace_id, platform, handle) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'Buyuk.Harf')$$, 'handle küçük harf/biçim doğrulanır', 'social_accounts_handle_check');
select tap.throws('23505', $$insert into public.competitors (workspace_id, platform, handle) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'test_a_rival')$$, 'aynı rakip iki kez eklenemez', 'competitors_handle_unique');
select tap.throws('23514', $$insert into public.competitors (workspace_id, platform, handle, source, discovered_via) values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'yeni_rakip', 'manual', 'x')$$, 'elle eklenen rakipte discovered_via olamaz', 'competitors_discovered_via_needs_source');
select tap.eq($$with r as (insert into public.collection_runs (workspace_id, provider, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'profile') returning actual_usd) select coalesce(actual_usd::text, 'NULL') from r$$, 'NULL', 'yeni koşuda actual_usd NULL (mutabakat yok ≠ 0)');
select tap.throws('23514', $$insert into public.collection_runs (workspace_id, provider, kind, reserved_usd) values ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'profile', -1)$$, 'negatif rezerve reddedilir', 'collection_runs_reserved_usd_check');
select tap.throws('23505', $$insert into public.collection_runs (workspace_id, provider, kind, external_run_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'content', 'dup-1'), ('bbbbbbbb-0000-4000-8000-000000000001', 'apify', 'content', 'dup-1')$$,
  'aynı sağlayıcı koşusu (external_run_id) iki satıra dönüşmez', 'collection_runs_external_run_key');

-- ── Cascade: içerik silinince bağlı satırlar gider, bildirim kalır ─────────────
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select count(*)::text from public.metric_snapshots where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince ölçümleri gider');
select tap.eq($$select count(*)::text from public.transcripts where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince transcript''i gider');
select tap.eq($$select count(*)::text from public.idea_evidence where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince fikir kanıtı gider');
select tap.eq($$select count(*)::text from public.collection_items where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince koleksiyon üyeliği gider');
select tap.eq($$select concat_ws('/', (content_item_id is null)::text, (workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001')::text) from public.notifications where id = 'aaaaaaaa-0000-4000-8000-0000000000a8'$$,
  'true/true', 'içerik silinince bildirim kalır (content_item_id NULL, workspace_id korunur)');

-- Çalışma alanı silinince hepsi gider.
delete from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$
declare
  r record;
  n bigint;
begin
  for r in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I where workspace_id = %L', r.relname, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    if n <> 0 then raise exception 'FAIL: workspace silinince % tablosunda % yetim satır kaldı', r.relname, n; end if;
  end loop;
  select count(*) into n from public.social_account_tokens where social_account_id = 'aaaaaaaa-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'FAIL: token satırı yetim kaldı'; end if;
  raise notice 'ok - workspace silinince tüm bağlı satırlar (token dahil) cascade ile gider';
end $$;
