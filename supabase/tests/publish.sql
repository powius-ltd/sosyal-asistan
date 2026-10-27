-- Yayın işi testi: insan onayı check kısıtı, koruma trigger'ı, authenticated'ın durum ilerletememesi.
-- Kimlikler için bkz. _fixture.sql. Taslak iş: …b9 (A çalışma alanı, kendi hesap …c1). Onaylayan editör: …a2.

-- ── 1. CHECK kısıtları (trigger devre dışı: kısıt tek başına da tutmalı) ────────
alter table public.publish_jobs disable trigger publish_jobs_guard;
select tap.throws('23514', $$update public.publish_jobs set status = 'approved' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı olmadan approved olamaz (human_approval)', 'publish_jobs_human_approval');
select tap.throws('23514', $$update public.publish_jobs set status = 'publishing' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı olmadan publishing olamaz (human_approval)', 'publish_jobs_human_approval');
select tap.throws('23514', $$update public.publish_jobs set status = 'published', published_external_id = 'x' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı olmadan published olamaz (human_approval)', 'publish_jobs_human_approval');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved', approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'yarım onay kaydı (yalnız approved_at) reddedilir', 'publish_jobs_approval_pair');
select tap.throws('23514', $$update public.publish_jobs set approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'taslakta onay kaydı olamaz', 'publish_jobs_no_approval_before_submit');
select tap.throws('23514', $$update public.publish_jobs set status = 'awaiting_approval', caption = '   ' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'boş açıklamayla onaya gönderilemez', 'publish_jobs_caption_required');
select tap.throws('23514', $$update public.publish_jobs set trial_enabled = true where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'trial mezuniyet stratejisi olmadan açılamaz', 'publish_jobs_trial_needs_graduation');
alter table public.publish_jobs enable trigger publish_jobs_guard;

-- ── 2. Service role: geçerli akış + trigger bütünlük kuralları ──────────────────
set local role service_role;
select tap.throws('23514', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, approved_at, approved_by)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'approved', 'x', now(), 'aaaaaaaa-0000-4000-8000-0000000000a2')$$,
  'draft/awaiting_approval dışı durumla iş açılamaz (service role dahil)', 'publish_invalid_insert');
select tap.throws('23514', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, status, caption, approved_at, approved_by)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', now(), 'aaaaaaaa-0000-4000-8000-0000000000a2')$$,
  'iş onay kaydıyla açılamaz', 'publish_invalid_insert');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'draft → approved atlanamaz (onaya gönderme şart)', 'publish_approval_transition');
select tap.affects(1, $$update public.publish_jobs set status = 'awaiting_approval' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'service role taslağı onaya gönderir');
select tap.throws('23514', $$update public.publish_jobs set caption = 'Onaydan sonra değişen metin' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onaya gönderilmiş işin açıklaması değişmez', 'publish_content_frozen');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a3' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'viewer onaylayan olamaz', 'publish_approver_not_editor');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'bbbbbbbb-0000-4000-8000-0000000000b1' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'başka çalışma alanının kullanıcısı onaylayan olamaz', 'publish_approver_not_editor');
select tap.throws('23514', $$update public.publish_jobs set status = 'approved' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı olmadan awaiting_approval → approved reddedilir', 'publish_jobs_human_approval');
select tap.affects(1, $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'editör onayı yazılır (awaiting_approval → approved)');
select tap.throws('23514', $$update public.publish_jobs set approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a1' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı sonradan değiştirilemez (approved_by)', 'publish_approval_immutable');
select tap.throws('23514', $$update public.publish_jobs set approved_at = null, approved_by = null where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onay kaydı silinemez', 'publish_approval_immutable');
select tap.throws('23514', $$update public.publish_jobs set caption = 'Onaydan sonra değişen metin' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onaylanan açıklama değişmez (onaylanan = yayınlanan)', 'publish_content_frozen');
select tap.throws('23514', $$update public.publish_jobs set paid_partnership = true where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onaylanan işin uyum ibareleri (paid_partnership) değişmez', 'publish_content_frozen');
select tap.affects(1, $$update public.publish_jobs set scheduled_at = now() + interval '3 days' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'onaylı işin yalnız planlanan zamanı değişebilir (yeniden zamanlama)');
select tap.affects(1, $$update public.publish_jobs set status = 'container_pending', attempt_count = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$, 'approved → container_pending');
select tap.affects(1, $$update public.publish_jobs set status = 'ready', container_id = 'c-1', container_expires_at = now() + interval '1 day' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$, 'container_pending → ready');
select tap.affects(1, $$update public.publish_jobs set status = 'publishing' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$, 'ready → publishing');
select tap.affects(1, $$update public.publish_jobs set status = 'published', published_external_id = 'ig-media-1', published_at = now() where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$, 'publishing → published');
select tap.throws('23514', $$update public.publish_jobs set status = 'failed' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'published durumundan çıkılamaz', 'publish_invalid_transition');
select tap.throws('23514', $$update public.publish_jobs set status = 'awaiting_approval' where id = 'aaaaaaaa-0000-4000-8000-0000000000b9'$$,
  'published iş yeniden onaya gönderilemez', 'publish_invalid_transition');

-- İptal: taslak → cancelled; cancelled uç durumdur.
select tap.affects(1, $$insert into public.publish_jobs (id, workspace_id, social_account_id, platform, caption) values ('aaaaaaaa-0000-4000-8000-0000000000b8', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'İptal edilecek')$$, 'service role taslak açar');
select tap.affects(1, $$update public.publish_jobs set status = 'cancelled' where id = 'aaaaaaaa-0000-4000-8000-0000000000b8'$$, 'taslak iptal edilir');
select tap.throws('23514', $$update public.publish_jobs set status = 'draft' where id = 'aaaaaaaa-0000-4000-8000-0000000000b8'$$, 'cancelled uç durumdur', 'publish_invalid_transition');
-- Onaya gönderme yalnız draft'tan: approved bir iş tekrar awaiting_approval olamaz.
select tap.affects(1, $$insert into public.publish_jobs (id, workspace_id, social_account_id, platform, caption, status) values ('aaaaaaaa-0000-4000-8000-0000000000b7', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'Onay bekleyen', 'awaiting_approval')$$, 'service role iş doğrudan awaiting_approval ile açabilir (compliance depoda)');
select tap.affects(1, $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a1' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'sahip de onaylayabilir');
select tap.throws('23514', $$update public.publish_jobs set status = 'awaiting_approval' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'approved → awaiting_approval geri dönüşü yok', 'publish_invalid_transition');
select tap.affects(1, $$update public.publish_jobs set status = 'publishing' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'approved → publishing (sunucu)');
reset role;

-- ── 3. authenticated (A editörü): taslak açar/düzenler; durum/onay alanlarına dokunamaz ──
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a2'), true);
set local role authenticated;
select tap.affects(1, $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'Editör taslağı')$$, 'editör taslak açar');
select tap.affects(1, $$update public.publish_jobs set paid_partnership = true, advertiser_name = 'Marka' where caption = 'Editör taslağı'$$, 'editör taslağın uyum alanlarını düzenler');
select tap.affects(1, $$update public.publish_jobs set caption = 'Düzenlenmiş taslak' where caption = 'Editör taslağı'$$, 'editör taslak açıklamasını düzenler');
select tap.throws('42501', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'x', 'awaiting_approval')$$, 'editör awaiting_approval ile iş açamaz (sütun yetkisi)');
select tap.throws('42501', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption, status, approved_at, approved_by) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'x', 'approved', now(), 'aaaaaaaa-0000-4000-8000-0000000000a2')$$, 'editör onaylı iş açamaz');
select tap.throws('42501', $$update public.publish_jobs set status = 'awaiting_approval' where caption = 'Düzenlenmiş taslak'$$, 'editör onaya gönderemez (yalnız service role)');
select tap.throws('42501', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'editör kendi onayını yazamaz');
select tap.throws('42501', $$update public.publish_jobs set status = 'publishing' where caption = 'Düzenlenmiş taslak'$$, 'editör publishing durumuna geçiremez');
select tap.throws('42501', $$update public.publish_jobs set approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where caption = 'Düzenlenmiş taslak'$$, 'editör approved_by yazamaz');
select tap.throws('42501', $$update public.publish_jobs set attempt_count = 0, last_error = 'x' where caption = 'Düzenlenmiş taslak'$$, 'editör sunucu alanlarını (attempt_count, last_error) yazamaz');
select tap.affects(0, $$delete from public.publish_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$, 'editör onaylı işi silemez (RLS using: yalnız draft/cancelled)');
select tap.affects(1, $$delete from public.publish_jobs where caption = 'Düzenlenmiş taslak'$$, 'editör kendi taslağını siler');
reset role;

-- ── 4. Savunma derinliği: sütun yetkisi yanlışlıkla genişletilse bile trigger engeller ──
grant update (status, approved_at, approved_by, container_id, attempt_count) on public.publish_jobs to authenticated;
grant insert (status, approved_at, approved_by) on public.publish_jobs to authenticated;
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, caption, status)
values ('aaaaaaaa-0000-4000-8000-0000000000b5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'Savunma testi', 'awaiting_approval');
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a2'), true);
set local role authenticated;
select tap.throws('42501', $$insert into public.publish_jobs (workspace_id, social_account_id, platform, caption, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'x', 'awaiting_approval')$$,
  'trigger: authenticated draft dışı iş açamaz (yetki genişlese bile)', 'publish_status_forbidden');
select tap.throws('42501', $$update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000b5'$$,
  'trigger: authenticated onay geçişini yapamaz (yetki genişlese bile)', 'publish_status_forbidden');
select tap.throws('42501', $$update public.publish_jobs set status = 'published' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$,
  'trigger: authenticated published yapamaz', 'publish_status_forbidden');
select tap.throws('42501', $$update public.publish_jobs set attempt_count = 5 where id = 'aaaaaaaa-0000-4000-8000-0000000000b5'$$,
  'trigger: authenticated sunucu alanı yazamaz', 'publish_status_forbidden');
select tap.throws('42501', $$update public.publish_jobs set status = 'cancelled' where id = 'aaaaaaaa-0000-4000-8000-0000000000b7'$$,
  'trigger: publishing durumundaki iş iptal edilemez', 'publish_status_forbidden');
select tap.affects(1, $$update public.publish_jobs set status = 'cancelled' where id = 'aaaaaaaa-0000-4000-8000-0000000000b5'$$,
  'trigger: authenticated yayına çıkmamış işi iptal edebilir');
reset role;

-- Denetim izi: onay kaydındaki kullanıcı silinemez (approved_by ON DELETE RESTRICT).
select tap.throws('23503', $$delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'onaylayan kullanıcı silinemez (approved_by RESTRICT)');
