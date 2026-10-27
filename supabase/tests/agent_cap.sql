-- 0030_agent_cap testi: ajan tavanı kolonları, çift CHECK, `create_workspace` varsayılanı ve `monthly_cap` dayanağının DB'de zorlanması.
-- Fixture (_fixture.sql): A çalışma alanı (ajan tavanı NULL = onaysız), A-owner …a1. Dosya tek transaction'da koşup geri alınır.

-- ── Mevcut satır davranışı: tavan onaysız, ayar varsayılanları ─────────────────
select tap.eq($$select coalesce(agent_monthly_cap_usd::text, 'NULL') || '/' || coalesce(agent_cap_approved_at::text, 'NULL') from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'NULL/NULL', 'mevcut hesapta ajan tavanı onaysız (NULL)');
select tap.eq($$select collect_every_days || '/' || collect_video_limit || '/' || rival_target from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '14/25/3', 'ayar varsayılanları 14 gün / 25 video / 3 rakip');

-- ── Tavan ve onay zamanı çifttir; aralıklar ────────────────────────────────────
select tap.throws('23514', $$update public.workspaces set agent_monthly_cap_usd = 3 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'tavan onay zamanı olmadan yazılamaz', 'workspaces_agent_cap_approved');
select tap.throws('23514', $$update public.workspaces set agent_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'onay zamanı tavansız yazılamaz', 'workspaces_agent_cap_approved');
select tap.throws('23514', $$update public.workspaces set agent_monthly_cap_usd = 1001, agent_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'tavan üst sınırı 1000', 'workspaces_agent_cap_range');
select tap.throws('23514', $$update public.workspaces set agent_monthly_cap_usd = -1, agent_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'tavan eksi olamaz', 'workspaces_agent_cap_range');
select tap.throws('23514', $$update public.workspaces set collect_every_days = 0 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'sıklık en az 1 gün', 'workspaces_collect_every_range');
select tap.throws('23514', $$update public.workspaces set collect_every_days = 61 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'sıklık en çok 60 gün', 'workspaces_collect_every_range');
select tap.throws('23514', $$update public.workspaces set collect_video_limit = 4 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'video sayısı en az 5', 'workspaces_collect_limit_range');
select tap.throws('23514', $$update public.workspaces set collect_video_limit = 51 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'video sayısı en çok 50', 'workspaces_collect_limit_range');
select tap.throws('23514', $$update public.workspaces set rival_target = 11 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'hedef rakip en çok 10', 'workspaces_rival_target_range');

-- ── create_workspace: yeni hesaba 3 USD + onay damgası (sahip) ─────────────────
create temp table _created on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Ajan Hesabı', 'ajan-hesabi', '', '', '', '', 'instagram', 'ajan.hesabi', null, null);
select tap.eq($$select agent_monthly_cap_usd::text from _created$$, '3.000000', 'yeni hesaba 3 USD ajan tavanı');
select tap.ok((select agent_cap_approved_at is not null and agent_cap_approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a1' from _created), 'onay damgası sahip kullanıcıyla yazıldı');

-- ── monthly_cap dayanağı (collect / discover): tavan onaysızken DB reddeder ────
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', '{"source":"agent"}', 'monthly_cap', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onaysız tavanla toplama monthly_cap işi reddedilir', 'panel_job_agent_cap_not_approved');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'discover', '{"source":"agent"}', 'monthly_cap', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onaysız tavanla rakip bulma monthly_cap işi reddedilir', 'panel_job_agent_cap_not_approved');
select tap.throws('23514', $$select public.request_panel_job('aaaaaaaa-0000-4000-8000-000000000001', 'test_q', 'collect', false, '{"source":"agent"}', 'monthly_cap', null, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$,
  'RPC yolu da aynı kapıdan geçer (onaysız tavan)', 'panel_job_agent_cap_not_approved');

-- Tavan 0 (onaylı ama kapalı) da harcatmaz.
update public.workspaces set agent_monthly_cap_usd = 0, agent_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', '{"source":"agent"}', 'monthly_cap', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'tavan 0 (kapalı) iken monthly_cap işi reddedilir', 'panel_job_agent_cap_not_approved');

-- Onaylı tavan: ajan işareti şart; işaretli iş yazılır.
update public.workspaces set agent_monthly_cap_usd = 3, agent_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, params, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', '{}', 'monthly_cap', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'ajan işareti olmayan iş aylık tavan dayanağını kullanamaz', 'panel_job_agent_cap_source');
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, queue, params, approval_basis, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'test_q', '{"source":"agent"}', 'monthly_cap', 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'onaylı tavan + ajan işareti: toplama işi yazılır');

-- Diğer dayanaklar etkilenmez: tek seferlik onay tavandan bağımsızdır; ölçüm monthly_cap'i bu kapıya girmez.
update public.workspaces set agent_monthly_cap_usd = null, agent_cap_approved_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.panel_jobs set status = 'cancelled', finished_at = now() where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and status = 'queued';
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, queue, approval_basis, approved_max_usd, approved_by, approved_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'collect', 'test_q', 'one_time', 0.2, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$,
  'one_time onay ajan tavanından bağımsız');
