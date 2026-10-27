-- 0032_studio_orders testi: şekil kısıtları, tek etkin fiş, bileşik anahtar, cascade, RLS.
-- Fixture: A çalışma alanı …0001 (fikir …a9, taslak fiş …f6), B çalışma alanı bbbbbbbb-…-0001 (fikir bbbbbbbb-…-a9, fiş …f6); A-viewer …a3.

set local role service_role;
insert into public.ideas (id, workspace_id, platform, format, title, rationale, hooks) values
  ('bbbbbbbb-0000-4000-8000-0000000000aa', 'bbbbbbbb-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Fikir B2', 'x', '["h1","h2","h3"]'),
  ('aaaaaaaa-0000-4000-8000-0000000000aa', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Fikir A2', 'x', '["h1","h2","h3"]');
select tap.affects(1, $$insert into public.studio_orders (id, workspace_id, idea_id, week_start, slot, ticket, status)
  values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000aa', '2026-10-26', 0, '{"durum":"taslak","onay":false}', 'taslak')$$, 'service role taslak fiş yazar');
select tap.throws('23505', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000aa', '{"durum":"taslak"}', 'taslak')$$, 'fikir başına ikinci etkin fiş yazılamaz', 'studio_orders_one_active_per_idea');
select tap.throws('23503', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000aa', '{"durum":"taslak"}', 'taslak')$$, 'başka çalışma alanının fikrine fiş bağlanamaz (bileşik anahtar)', 'studio_orders_idea_fkey');
select tap.throws('23514', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status) values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000aa', '{"durum":"taslak"}', 'bogus')$$, 'durum listede olmak zorunda', 'studio_orders_status_check');
select tap.throws('23514', $$update public.studio_orders set status = 'uretiliyor' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'durum sütunu fişin durum alanından ayrışamaz', 'studio_orders_status_matches_ticket');
select tap.throws('23514', $$insert into public.studio_orders (workspace_id, idea_id, ticket) values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000aa', '[1]')$$, 'ticket nesne olmak zorunda', 'studio_orders_ticket_check');
select tap.throws('23514', $$update public.studio_orders set slot = -1 where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'slot eksi olamaz', 'studio_orders_slot_check');
-- Hata ile biten fiş etkin sayılmaz: aynı fikre yeniden fiş yazılabilir.
select tap.affects(1, $$update public.studio_orders set status = 'hata', ticket = '{"durum":"hata"}' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'fiş hataya düşer');
select tap.affects(1, $$insert into public.studio_orders (id, workspace_id, idea_id, ticket, status) values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000aa', '{"durum":"taslak"}', 'taslak')$$, 'hatalı fişin yerine yeni fiş yazılır');
select tap.eq($$select (updated_at >= created_at)::text from public.studio_orders where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'true', 'güncelleme updated_at tetikleyicisini çalıştırır');
reset role;

-- ── RLS: üye yalnız kendi çalışma alanını okur, yazamaz; anon göremez ─────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.studio_orders$$, '3', 'viewer yalnız kendi çalışma alanının fişlerini görür (B fişi görünmez)');
select tap.throws('42501', $$insert into public.studio_orders (workspace_id, idea_id, ticket, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', '{"durum":"hata"}', 'hata')$$, 'üye fiş yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.studio_orders set note = 'x'$$, 'üye fiş değiştiremez');
select tap.throws('42501', $$delete from public.studio_orders$$, 'üye fiş silemez');
reset role;
set local role anon;
select tap.throws('42501', $$select count(*) from public.studio_orders$$, 'anon fişi okuyamaz (permission denied)');
reset role;

-- ── Cascade: fikir silinince fiş de gider ─────────────────────────────────
delete from public.ideas where id = 'bbbbbbbb-0000-4000-8000-0000000000a9';
select tap.eq($$select count(*)::text from public.studio_orders where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'fikir silinince fişi de gider (cascade)');
