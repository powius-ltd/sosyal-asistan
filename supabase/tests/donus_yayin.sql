-- 0028_donus_yayin testi: `publish_jobs.order_id` + kısmi benzersiz indeks; `publish_jobs_guard` / onay CHECK'leri aynen (onaysız satır
-- approved olamaz); panel_jobs'a `order_return` ve `publish` türleri ($0, onaysız, önizlemesiz).
-- Fixture (_fixture.sql): A çalışma alanı …0001, kendi hesap …c1, editör …a2, sahip …a1.

set local role service_role;

-- order_id sütunu: boş / aşırı uzun reddedilir
select tap.throws('23514', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', '   ')$$, 'boş sipariş kimliği reddedilir', 'publish_jobs_order_id_check');

insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, order_id, ai_generated, media_path)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'Deneme #ai', 'siparis-a', true, 'siparis:ornek-studyo/2026-10-19/siparis-a/final.mp4');
select tap.eq($$select status from public.publish_jobs where order_id = 'siparis-a'$$, 'awaiting_approval', 'dönüş satırı onay bekler olarak açılır');

-- aynı sipariş ikinci aktif satır açamaz
select tap.throws('23505', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', 'siparis-a')$$, 'aynı sipariş ikinci aktif satır açamaz', 'publish_jobs_workspace_order_idx');
-- fişsiz (NULL) satırlar tekilliğe girmez
insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'draft', 'a'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'draft', 'b');
select tap.eq($$select count(*)::text from public.publish_jobs where order_id is null and caption in ('a','b')$$, '2', 'order_id NULL satırlar tekil değil');

-- onay kuralı aynen: onaysız approved / publishing olamaz; onay yalnız editör/sahip
select tap.throws('23514', $$update public.publish_jobs set status = 'approved' where order_id = 'siparis-a'$$, 'onay kaydı olmadan approved olamaz', 'publish_jobs_human_approval');
select tap.throws('23514', $$update public.publish_jobs set status = 'publishing' where order_id = 'siparis-a'$$, 'onay kaydı olmadan publishing olamaz', 'publish_jobs_human_approval');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a3' where order_id = 'siparis-a'$$, 'viewer onaylayamaz', 'publish_approver_not_editor');
select tap.affects(1, $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where order_id = 'siparis-a'$$, 'editör onayı yazılır');
select tap.throws('23514', $$update public.publish_jobs set media_path = 'siparis:x/y/z/final.mp4' where order_id = 'siparis-a'$$, 'onaylı işin medyası değişmez', 'publish_content_frozen');
-- onaydan sonra işçi yolu: approved → publishing → ready → published
select tap.affects(1, $$update public.publish_jobs set status = 'publishing', attempt_count = 1 where order_id = 'siparis-a'$$, 'approved → publishing');
select tap.affects(1, $$update public.publish_jobs set status = 'ready', container_id = 'zernio-1' where order_id = 'siparis-a'$$, 'publishing → ready');
select tap.affects(1, $$update public.publish_jobs set status = 'published', published_permalink = 'https://www.instagram.com/reel/X/', published_at = now() where order_id = 'siparis-a'$$, 'ready → published');

-- başarısız satır tekilliğe girmez (elle yeniden açma yolu)
insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, order_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'draft', 'f', 'siparis-f');
select tap.affects(1, $$update public.publish_jobs set status = 'failed', last_error = 'schedule_in_past' where order_id = 'siparis-f'$$, 'draft → failed');
insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, order_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'f2', 'siparis-f');
select tap.eq($$select count(*)::text from public.publish_jobs where order_id = 'siparis-f'$$, '2', 'başarısız sipariş yeniden açılabilir');

-- panel_jobs: order_return ve publish — $0, onaysız, önizlemesiz
insert into public.panel_jobs (workspace_id, kind, status, finished_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'order_return', 'cancelled', now()),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'publish', 'cancelled', now());
select tap.eq($$select count(*)::text from public.panel_jobs where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and kind in ('order_return', 'publish')$$, '2', 'order_return ve publish onaysız yazılır');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'order_return', true)$$, 'order_return önizlemesi yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, dry_run) values ('aaaaaaaa-0000-4000-8000-000000000001', 'publish', true)$$, 'publish önizlemesi yok', 'panel_jobs_dry_run_kind');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, approval_basis, approved_max_usd, approved_by, approved_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'publish', 'one_time', 0.5, 'aaaaaaaa-0000-4000-8000-0000000000a1', now())$$, 'publish USD onayı taşıyamaz');

reset role;
