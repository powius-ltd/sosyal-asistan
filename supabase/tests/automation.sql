-- 0037_automation testi: otomatik iş anahtarlarının varsayılanları ve null olamaması.
-- Fixture (_fixture.sql): A çalışma alanı. Dosya tek transaction'da koşup geri alınır.

select tap.eq($$select auto_weekly_plan::text || '/' || auto_measure::text || '/' || auto_produce::text from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'true/true/false', 'varsayılan: plan açık, ölçüm açık, üretim kapalı');

update public.workspaces set auto_weekly_plan = false, auto_measure = false, auto_produce = true where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select tap.eq($$select auto_weekly_plan::text || '/' || auto_measure::text || '/' || auto_produce::text from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'false/false/true', 'üç anahtar bağımsız değişir');

select tap.throws('23502', $$update public.workspaces set auto_produce = null where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'anahtar null olamaz (açık ya da kapalı)', 'auto_produce');
select tap.throws('23502', $$update public.workspaces set auto_weekly_plan = null where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'plan anahtarı null olamaz', 'auto_weekly_plan');

-- Yeni hesap (create_workspace) varsayılanları alır.
create temp table _created on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Otomatik Hesabı', 'otomatik-hesabi', '', '', '', '', 'instagram', 'otomatik.hesabi', null, null);
select tap.eq($$select auto_weekly_plan::text || '/' || auto_measure::text || '/' || auto_produce::text from _created$$, 'true/true/false', 'yeni hesap varsayılanları alır');
