-- 0024_candidate_screens testi: aday niş eleği tablosu (şekil kısıtları, bileşik FK kiracı tutarlılığı, cascade/set null, upsert, RLS).
-- Fixture (_fixture.sql): A'nın izlenen rakibi …c2 (instagram, elenmemiş), gizli rakibi …c3 (elenmiş: unsure); koşu …f1. B tarafı bbbbbbbb-…

select tap.eq($$select count(*)::text from public.competitor_screens where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: yalnız …c3 elenmiş; …c2 satırı yok (satır yok = elenmedi)');
select tap.throws('23514', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'maybe', 'p')$$,
  'fit yalnız fit/off/unsure', 'competitor_screens_fit_check');
select tap.throws('23514', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, reason, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', repeat('x', 301), 'p')$$,
  'reason ≤ 300 karakter', 'competitor_screens_reason_check');
select tap.throws('23514', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, quote, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', repeat('x', 301), 'p')$$,
  'quote ≤ 300 karakter', 'competitor_screens_quote_check');
select tap.throws('23514', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', ' ')$$,
  'prompt_version boş olamaz', 'competitor_screens_prompt_version_check');
select tap.throws('23503', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'fit', 'p')$$,
  'platform rakibin platformuyla aynı olmak zorunda (bileşik FK)', 'competitor_screens_competitor_fkey');
select tap.throws('23503', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'bbbbbbbb-0000-4000-8000-000000000001', 'instagram', 'fit', 'p')$$,
  'başka çalışma alanı üzerinden rakip elenemez (bileşik FK)', 'competitor_screens_competitor_fkey');
select tap.throws('23503', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version, run_id) values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', 'p', 'bbbbbbbb-0000-4000-8000-0000000000f1')$$,
  'eleme başka çalışma alanının koşusuna bağlanamaz (bileşik FK)', 'competitor_screens_run_fkey');

-- ── Service role: yazar (upsert = yeniden eleme üzerine yazar) ─────────────────
set local role service_role;
select tap.affects(1, $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, reason, quote, prompt_version, model, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'off', 'Biyografi yalnız kahve satışı anlatıyor.', 'taze kahve', 'screen-candidates-v1', 'claude-test', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'service role sonucu yazar');
select tap.affects(1, $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version, screened_at)
  values ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', 'screen-candidates-v2', now() + interval '1 minute')
  on conflict (competitor_id) do update set fit = excluded.fit, prompt_version = excluded.prompt_version, screened_at = excluded.screened_at$$,
  'yeniden eleme aynı satırın üzerine yazar');
select tap.eq($$select fit from public.competitor_screens where competitor_id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'fit', 'güncel sonuç yeni karar');
reset role;

-- ── Koşu silinince satır kalır, run_id NULL olur; rakip silinince eleme de gider ───────────────
select tap.affects(1, $$update public.competitor_screens set run_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' where competitor_id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'fixture: koşu bağlandı');
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select (run_id is null)::text from public.competitor_screens where competitor_id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, 'true', 'koşu silinince eleme kalır, run_id NULL');
delete from public.competitors where id = 'aaaaaaaa-0000-4000-8000-0000000000c2';
select tap.eq($$select count(*)::text from public.competitor_screens where competitor_id = 'aaaaaaaa-0000-4000-8000-0000000000c2'$$, '0', 'rakip silinince eleme sonucu da gider (cascade)');

-- ── RLS: üye okur, yazamaz; anon göremez ────────────────────────────────────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.competitor_screens where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'viewer kendi çalışma alanının eleme sonuçlarını okur');
select tap.throws('42501', $$insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, prompt_version) values ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'fit', 'p')$$, 'authenticated eleme yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.competitor_screens set fit = 'off'$$, 'authenticated eleme sonucunu değiştiremez');
select tap.throws('42501', $$delete from public.competitor_screens$$, 'authenticated eleme sonucunu silemez');
reset role;
set local role anon;
select tap.throws('42501', $$select count(*) from public.competitor_screens$$, 'anon eleme sonucunu okuyamaz (permission denied)');
reset role;
