-- 0008_topic_screen testi: konu eleği tablosu (şekil kısıtları, bileşik FK kiracı tutarlılığı, cascade/set null, upsert, RLS).
-- Fixture (_fixture.sql): A'nın kendi içeriği …d1 ve B'nin …d1 elenmiş (niş içi); A'nın rakip içeriği …d2 henüz elenmemiş.
-- Kimlikler için bkz. _fixture.sql (A: …0001, içerik …d1 (kendi) / …d2 (rakip), koşu …f1; B tarafı bbbbbbbb-…).

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.content_topic_screens where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: A''da tek eleme sonucu var; rakip içerik (…d2) elenmemiş = satır yok');
select tap.throws('23505', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', false, 'p')$$,
  'içerik başına tek eleme sonucu (PK)', 'content_topic_screens_pkey');
select tap.throws('23502', $$insert into public.content_topic_screens (content_item_id, workspace_id, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'p')$$,
  'in_niche zorunlu: karar yoksa satır yok (elenmemiş niş içi sayılmaz)');
select tap.throws('23514', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, reason, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, repeat('x', 301), 'p')$$,
  'reason ≤ 300 karakter', 'content_topic_screens_reason_check');
select tap.affects(1, $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, reason, topic, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, repeat('x', 300), repeat('t', 80), 'p')$$,
  'reason 300 ve topic 80 karakter sınırda kabul edilir');
delete from public.content_topic_screens where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.throws('23514', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, '   ', 'p')$$,
  'topic boşluktan ibaret olamaz', 'content_topic_screens_topic_check');
select tap.throws('23514', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, repeat('t', 81), 'p')$$,
  'topic ≤ 80 karakter', 'content_topic_screens_topic_check');
select tap.throws('23514', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, ' ')$$,
  'prompt_version boş olamaz', 'content_topic_screens_prompt_version_check');

-- ── Kiracı tutarlılığı (bileşik FK) ────────────────────────────────────────────
-- B'nin fixture satırı PK çakışması yaratmasın diye geçici kaldırılır (sonda aynen geri konur).
delete from public.content_topic_screens where content_item_id = 'bbbbbbbb-0000-4000-8000-0000000000d1';
select tap.throws('23503', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, prompt_version) values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', false, 'p')$$,
  'başka çalışma alanının içeriği elenemez (bileşik FK)', 'content_topic_screens_content_fkey');
insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, prompt_version, model)
  values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', true, 'B konusu', 'screen-topics-v1', 'claude-test');
select tap.throws('23503', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, prompt_version, run_id) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, 'p', 'bbbbbbbb-0000-4000-8000-0000000000f1')$$,
  'eleme başka çalışma alanının koşusuna bağlanamaz (bileşik FK)', 'content_topic_screens_run_fkey');

-- ── Service role: yazar (upsert = yeniden eleme üzerine yazar) ─────────────────
set local role service_role;
select tap.affects(1, $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, reason, prompt_version, model, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', false, 'Kahve tarifi', 'Açıklama yalnız kahve tarifi anlatıyor.', 'screen-topics-v1', 'claude-test', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'service role niş dışı sonucu yazar');
select tap.affects(1, $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, reason, prompt_version, model, screened_at)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', true, 'Hizalanma', 'Yeniden eleme: hizalanma çalışması.', 'screen-topics-v2', 'claude-test', now() + interval '1 minute')
  on conflict (content_item_id) do update set in_niche = excluded.in_niche, topic = excluded.topic, reason = excluded.reason,
    prompt_version = excluded.prompt_version, model = excluded.model, run_id = excluded.run_id, screened_at = excluded.screened_at$$,
  'yeniden eleme (upsert) aynı satırı günceller');
reset role;
select tap.eq($$select concat_ws('/', in_niche::text, topic, prompt_version, coalesce(run_id::text, 'NULL')) from public.content_topic_screens where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'true/Hizalanma/screen-topics-v2/NULL', 'upsert sonucu: niş içi, yeni konu ve sürüm; run_id yeni eleme koşusuz NULL');
select tap.eq($$select count(*)::text from public.content_topic_screens where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2', 'upsert satır çoğaltmaz (A''da 2 içerik elenmiş)');

-- Niş dışı okuma yolu (getInsights): kısmi indeksle aynı koşul.
update public.content_topic_screens set in_niche = false where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select string_agg(content_item_id::text, ',') from public.content_topic_screens where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and not in_niche$$,
  'aaaaaaaa-0000-4000-8000-0000000000d2', 'niş dışı kimlik listesi: yalnız in_niche = false satırları');

-- ── Silme davranışı ────────────────────────────────────────────────────────────
update public.content_topic_screens set run_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select coalesce(run_id::text, 'NULL') from public.content_topic_screens where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, 'NULL',
  'koşu silinince eleme kalır, run_id NULL olur (set null)');
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select count(*)::text from public.content_topic_screens where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince eleme sonucu da gider (cascade)');

-- ── RLS ────────────────────────────────────────────────────────────────────────
select tap.ok(has_table_privilege('service_role', 'public.content_topic_screens', 'insert') and has_table_privilege('authenticated', 'public.content_topic_screens', 'select')
  and not has_table_privilege('authenticated', 'public.content_topic_screens', 'insert')
  and not has_table_privilege('authenticated', 'public.content_topic_screens', 'update')
  and not has_table_privilege('authenticated', 'public.content_topic_screens', 'delete')
  and not has_table_privilege('anon', 'public.content_topic_screens', 'select'),
  'yetki matrisi: service role yazar, authenticated yalnız okur, anon hiçbir şey');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.content_topic_screens$$, '1', 'viewer yalnız kendi çalışma alanının eleme sonuçlarını okur');
select tap.eq($$select count(*)::text from public.content_topic_screens where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin eleme sonucunu görmez');
select tap.throws('42501', $$insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', true, 'p')$$, 'authenticated eleme sonucu yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.content_topic_screens set in_niche = false$$, 'authenticated eleme sonucunu değiştiremez');
select tap.throws('42501', $$delete from public.content_topic_screens$$, 'authenticated eleme sonucunu silemez');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.content_topic_screens$$, 'anon eleme sonucunu okuyamaz (permission denied)');
reset role;
