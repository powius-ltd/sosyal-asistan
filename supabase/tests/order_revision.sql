-- 0036_order_revision testi: `request_order_revision` yalnız üretilmiş + onay bekleyen videoda çalışır (tek işlem: yayın iptal, geçmiş, sürüm + 1, fiş taslak),
-- 3 revizeden sonra durur, onaylanmış / paylaşılmış video revize edilemez; tetikleyici RPC'yi atlayan doğrudan yazımı da reddeder; yetki yalnız service role.
-- Fixture (_fixture.sql): A çalışma alanı …0001 (fikir …a9, kendi hesap …c1, editör …a2), B çalışma alanı bbbbbbbb-…-0001.

set local role service_role;
insert into public.ideas (id, workspace_id, platform, format, title, rationale, hooks) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Revize fikri', 'x', '["h1","h2","h3"]'),
  ('aaaaaaaa-0000-4000-8000-0000000000e9', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Revize fikri 2', 'x', '["h1","h2","h3"]');
insert into public.studio_orders (id, workspace_id, idea_id, ticket, status) values
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   '{"siparis_id":"rev-a","durum":"taslak","onay":false,"mod":"senaryo"}', 'taslak');

-- Sütun varsayılanları
select tap.eq($$select revision::text || '/' || jsonb_array_length(revisions)::text from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, '1/0', 'yeni fiş 1. sürüm, geçmiş boş');
select tap.throws('23514', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status, revision, revisions) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', '{"durum":"hata"}', 'hata', 5, '[1,2,3,4]')$$, 'sürüm en çok 4', 'studio_orders_revision_check');
select tap.throws('23514', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status, revision, revisions) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', '{"durum":"hata"}', 'hata', 1, '[{"a":1}]')$$, 'geçmiş uzunluğu sürümle tutarlı olmak zorunda', 'studio_orders_revisions_count');

-- Üretilmemiş fişte revize yok; not kuralı; bilinmeyen fiş
select tap.throws('23514', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Açılış kısa olsun', now())$$, 'taslak fiş revize edilmez', 'order_revision_not_produced');
select tap.throws('22023', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', '   ', now())$$, 'boş not reddedilir', 'order_revision_note_invalid');
select tap.throws('22023', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', repeat('x', 501), now())$$, '501 karakterlik not reddedilir', 'order_revision_note_invalid');
select tap.throws('P0002', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000ff', 'Not', now())$$, 'bilinmeyen fiş', 'studio_order_not_found');
select tap.throws('P0002', $$select public.request_order_revision('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Not', now())$$, 'başka çalışma alanının fişi görünmez', 'studio_order_not_found');

-- Üretildi ama yayın satırı yok → revize yok
update public.studio_orders set ticket = '{"siparis_id":"rev-a","durum":"uretildi","onay":true,"mod":"senaryo","video":"rev-a/final.mp4","kapak":"rev-a/kapak.jpg"}', status = 'uretildi' where id = 'aaaaaaaa-0000-4000-8000-0000000000e2';
select tap.throws('23514', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Not', now())$$, 'yayın satırı yoksa revize yok', 'order_revision_no_pending_publish');

-- Onay bekleyen satır var → revize olur
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', 'rev-a');
select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', '  Açılış kısa olsun  ', '2026-10-29T10:00:00Z');
select tap.eq($$select status from public.publish_jobs where id = 'aaaaaaaa-0000-4000-8000-0000000000e3'$$, 'cancelled', 'eski yayın satırı iptal edildi');
select tap.eq($$select status || '/' || revision::text || '/' || (ticket ->> 'siparis_id') || '/' || (ticket ->> 'durum') || '/' || (ticket ->> 'onay') from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'taslak/2/rev-a-r2/taslak/false', 'fiş taslak, sürüm 2, kimlik -r2 ekli, onaysız');
select tap.eq($$select (ticket ->> 'revize_notu') || '|' || (ticket ->> 'onceki_video') || '|' || coalesce(ticket ->> 'video', 'yok') || '|' || coalesce(ticket ->> 'kapak', 'yok') from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'Açılış kısa olsun|rev-a/final.mp4|yok|yok', 'not + önceki video yazıldı, eski video / kapak fişten kalktı');
select tap.eq($$select (revisions -> 0 ->> 'version') || '|' || (revisions -> 0 ->> 'orderId') || '|' || (revisions -> 0 ->> 'note') || '|' || (revisions -> 0 ->> 'video') || '|' || (revisions -> 0 ->> 'cover') || '|' || (revisions -> 0 ->> 'requestedAt') || '|' || (revisions -> 0 ->> 'publishJobId') from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$,
  '1|rev-a|Açılış kısa olsun|rev-a/final.mp4|rev-a/kapak.jpg|2026-10-29T10:00:00.000Z|aaaaaaaa-0000-4000-8000-0000000000e3', 'eski sürüm geçmişe yazıldı');
-- Fiş taslakta: ikinci revize yok
select tap.throws('23514', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Bir daha', now())$$, 'taslağa dönmüş fiş yeniden revize edilmez', 'order_revision_not_produced');

-- 2. ve 3. revize (taban -r<n> eki birikmez: rev-a-r3, rev-a-r4); 4. revize reddedilir
update public.studio_orders set ticket = ticket || '{"durum":"uretildi","onay":true,"video":"rev-a-r2/final.mp4"}', status = 'uretildi' where id = 'aaaaaaaa-0000-4000-8000-0000000000e2';
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'draft', 'x', 'rev-a-r2');
select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'İkinci not', now());
select tap.eq($$select (ticket ->> 'siparis_id') || '/' || revision::text from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'rev-a-r3/3', '3. sürüm kimliği tabandan kurulur');
update public.studio_orders set ticket = ticket || '{"durum":"uretildi","onay":true,"video":"rev-a-r3/final.mp4"}', status = 'uretildi' where id = 'aaaaaaaa-0000-4000-8000-0000000000e2';
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000e5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', 'rev-a-r3');
select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Üçüncü not', now());
select tap.eq($$select (ticket ->> 'siparis_id') || '/' || revision::text || '/' || jsonb_array_length(revisions)::text from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'rev-a-r4/4/3', '4. sürüm: 3 revize kullanıldı');
update public.studio_orders set ticket = ticket || '{"durum":"uretildi","onay":true,"video":"rev-a-r4/final.mp4"}', status = 'uretildi' where id = 'aaaaaaaa-0000-4000-8000-0000000000e2';
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, status, caption, order_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000e6', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'awaiting_approval', 'x', 'rev-a-r4');
select tap.throws('23514', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Dördüncü', now())$$, '4. revize reddedilir', 'order_revision_limit');

-- Onaylanmış video revize edilemez (RPC + tetikleyici): yayın satırı onaylı
-- RPC'yi atlayan doğrudan yazım: tetikleyici durdurur (sürüm artışı yalnız üretilmiş + onaylanmamış videoda)
insert into public.studio_orders (id, workspace_id, idea_id, ticket, status, revision, revisions)
  values ('aaaaaaaa-0000-4000-8000-0000000000e7', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e9', '{"siparis_id":"rev-b","durum":"uretildi","onay":true,"video":"rev-b/final.mp4"}', 'uretildi', 1, '[]');
insert into public.publish_jobs (id, workspace_id, social_account_id, platform, status, caption, order_id, approved_at, approved_by)
  values ('aaaaaaaa-0000-4000-8000-0000000000e8', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'draft', 'x', 'rev-b', null, null);
update public.publish_jobs set status = 'awaiting_approval' where id = 'aaaaaaaa-0000-4000-8000-0000000000e8';
update public.publish_jobs set status = 'approved', approved_at = now(), approved_by = 'aaaaaaaa-0000-4000-8000-0000000000a2' where id = 'aaaaaaaa-0000-4000-8000-0000000000e8';
select tap.throws('23514', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e7', 'Geç kaldın', now())$$, 'onaylanmış video RPC ile revize edilmez', 'order_revision_no_pending_publish');
select tap.throws('23514', $$update public.studio_orders set revision = 2, revisions = '[{"version":1}]' where id = 'aaaaaaaa-0000-4000-8000-0000000000e7'$$, 'onaylı videonun sürümü doğrudan artırılamaz', 'order_revision_published');
-- Paylaşılmış fiş: durum 'paylasildi' iken sürüm artışı reddedilir
update public.studio_orders set status = 'paylasildi', ticket = ticket || '{"durum":"paylasildi"}' where id = 'aaaaaaaa-0000-4000-8000-0000000000e7';
select tap.throws('23514', $$update public.studio_orders set revision = 2, revisions = '[{"version":1}]' where id = 'aaaaaaaa-0000-4000-8000-0000000000e7'$$, 'paylaşılmış fişin sürümü artırılamaz', 'order_revision_not_produced');
-- Geçmiş yalnız revize anında eklenir; sürüm atlaması olmaz
select tap.throws('23514', $$update public.studio_orders set revisions = revisions || '[{"x":1}]' where id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$, 'geçmiş sürüm artışı olmadan değişmez', 'order_revision_history_frozen');
reset role;

-- Yetki: üye RPC çağıramaz, fişi yazamaz
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a2'), true);
set local role authenticated;
select tap.throws('42501', $$select public.request_order_revision('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'Not', now())$$, 'üye revize RPC''sini çağıramaz (yalnız sunucu)');
reset role;
