-- 0010_outcomes testi: fikir ↔ Reels bağı (şekil kısıtları, guard/sync trigger'ları, tekillik, kiracı yalıtımı, RLS),
-- bildirim türleri + dedupe_key, collection_runs.purpose + reserve_budget, workspace ölçüm tavanı.
-- Fixture (_fixture.sql): A'da fikir …a9 (new), kendi içerik …d1 (shortcode own1), rakip içerik …d2 (comp1); B'de içerik …d1 (b1).
-- Her çalışma alanında fixture bir bekleyen link taşır (A: …aa 'fxawaitA' → fikir …a9).

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.idea_content_links where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: A''da tek bekleyen link');
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'new', 'bekleyen link fikir durumunu değiştirmez');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'bad code!', 'manual_url')$$,
  'shortcode yalnız A-Z a-z 0-9 _ -', 'idea_content_links_shortcode_check');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'awaiting_content', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'bekleyen link içerik taşımaz', 'idea_content_links_content_by_status');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'confirmed')$$,
  'içeriksiz link bekleyen olmak zorunda (confirmed içerik ister)', 'idea_content_links_content_by_status');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'auto_match', 'awaiting_content')$$,
  'bekleyen link yalnız elle (manual_url) olur', 'idea_content_links_awaiting_manual');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'öneri yalnız otomatik eşleşmeden gelir', 'idea_content_links_suggested_auto');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'öneri skorsuz olamaz (NULL skor = elle link)', 'idea_content_links_suggested_auto');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id, score) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1', 1.5)$$,
  'skor 0..1', 'idea_content_links_score_check');
select tap.throws('23505', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'fxawaitA', 'manual_url')$$,
  'aynı fikir + aynı shortcode tek satır', 'idea_content_links_idea_shortcode_key');
select tap.throws('23505', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'other1', 'manual_url')$$,
  'fikir başına tek aktif (bekleyen) bağ', 'idea_content_links_idea_active_key');

-- ── RLS ────────────────────────────────────────────────────────────────────────
select tap.ok(has_table_privilege('service_role', 'public.idea_content_links', 'insert') and has_table_privilege('authenticated', 'public.idea_content_links', 'select')
  and not has_table_privilege('authenticated', 'public.idea_content_links', 'insert')
  and not has_table_privilege('authenticated', 'public.idea_content_links', 'update')
  and not has_table_privilege('authenticated', 'public.idea_content_links', 'delete')
  and not has_table_privilege('anon', 'public.idea_content_links', 'select'),
  'yetki matrisi: service role yazar, authenticated yalnız okur, anon hiçbir şey');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.idea_content_links$$, '1', 'viewer yalnız kendi çalışma alanının bekleyen bağını okur');
select tap.eq($$select count(*)::text from public.idea_content_links where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin bağını görmez');
select tap.throws('42501', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'rlsx1', 'manual_url')$$, 'authenticated bağ yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.idea_content_links set status = 'confirmed'$$, 'authenticated bağ durumunu değiştiremez');
select tap.throws('42501', $$delete from public.idea_content_links$$, 'authenticated bağ silemez');
reset role;
set local role anon;
select tap.throws('42501', $$select count(*) from public.idea_content_links$$, 'anon bağları okuyamaz (permission denied)');
reset role;

-- B'nin bekleyen linki yalnız B üyesine görünür.
select set_config('request.jwt.claims', tap.claims('bbbbbbbb-0000-4000-8000-0000000000b1'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.idea_content_links$$, '1', 'B sahibi yalnız kendi bekleyen linkini görür');
reset role;


-- ── Guard: içerik kuralları ────────────────────────────────────────────────────
delete from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000aa';
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id, score) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'comp1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d2', 0.8)$$,
  'rakip içeriğine bağ kurulamaz (yalnız kendi hesap)', 'kendi hesabın içeriğine');
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id, score) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'wrong1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1', 0.8)$$,
  'shortcode içeriğinkiyle aynı olmalı', 'shortcode');
select tap.throws('23503', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id, score) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'b1', 'auto_match', 'suggested', 'bbbbbbbb-0000-4000-8000-0000000000d1', 0.8)$$,
  'başka çalışma alanının içeriğine bağ kurulamaz', 'idea_content_links_content_fkey');
select tap.throws('23503', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a9', 'xtenant1', 'manual_url')$$,
  'başka çalışma alanının fikrine bağ kurulamaz', 'idea_content_links_idea_fkey');
select tap.throws('23503', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'confirmed', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'başka çalışma alanının fikri onaylanamaz (onay yolunda da temiz FK hatası)', 'idea_content_links_idea_fkey');

-- ── Öneri: sessiz bağ yok, fikir durumu değişmez ───────────────────────────────
insert into public.idea_content_links (id, workspace_id, idea_id, shortcode, origin, status, content_item_id, score, reasons)
  values ('aaaaaaaa-0000-4000-8000-0000000000ab', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1', 0.72, '["Açıklama fikirle örtüşüyor"]');
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'new', 'öneri (suggested) fikir durumunu değiştirmez');
select tap.eq($$select coalesce(prev_idea_status, 'NULL') from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$, 'NULL', 'öneride prev_idea_status yok');

-- ── Sync: onay → fikir published; geri alma → önceki durum ─────────────────────
update public.ideas set status = 'scripted' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9';
update public.idea_content_links set status = 'confirmed' where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'published', 'onay: fikir published olur');
select tap.eq($$select prev_idea_status from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$, 'scripted', 'onay anındaki fikir durumu saklanır');

-- İçerik başına tek onaylı bağ: aynı içeriği başka fikre onaylamak reddedilir.
insert into public.ideas (id, workspace_id, platform, format, title, rationale, hooks) values
  ('aaaaaaaa-0000-4000-8000-0000000000a7', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Fikir A2', 'ikinci', '["h1","h2","h3"]');
select tap.throws('23505', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a7', 'own1', 'manual_url', 'confirmed', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'aynı içerik iki fikre onaylanamaz', 'idea_content_links_content_confirmed_key');
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$, 'new', 'reddedilen onay ikinci fikrin durumunu değiştirmedi (atomik)');
-- Fikir başına tek onaylı bağ: onaylı fikre ikinci aktif bağ eklenemez.
select tap.throws('23505', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'second1', 'manual_url')$$,
  'onaylı fikre ikinci aktif bağ eklenemez', 'idea_content_links_idea_active_key');

-- Kimlik alanları değişmez.
select tap.throws('23514', $$update public.idea_content_links set idea_id = 'aaaaaaaa-0000-4000-8000-0000000000a7' where id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$,
  'bağın fikri sonradan değişmez', 'sonradan değişmez');

-- Zaten onaylı satırın başka alanı güncellenirse prev_idea_status korunur.
update public.idea_content_links set reasons = '["güncel"]' where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select prev_idea_status from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$, 'scripted', 'onaylı satır güncellenince prev_idea_status korunur');

-- Geri alma (rejected): fikir önceki duruma döner, prev temizlenir, satır kalır (aynı çift tekrar önerilmesin).
update public.idea_content_links set status = 'rejected' where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'scripted', 'geri alma: fikir önceki duruma (scripted) döner');
select tap.eq($$select coalesce(prev_idea_status, 'NULL') from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$, 'NULL', 'bağ onaylı değilken prev_idea_status temizlenir');
select tap.eq($$select count(*)::text from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab' and status = 'rejected'$$, '1', 'reddedilen/kaldırılan bağ satır olarak kalır');

-- Reddedilmiş satır tekrar onaylanabilir (kullanıcı fikrini değiştirdi); fikir scheduled iken prev = scheduled.
update public.ideas set status = 'scheduled' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9';
update public.idea_content_links set status = 'confirmed' where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select concat_ws('/', i.status, l.prev_idea_status) from public.ideas i, public.idea_content_links l where i.id = 'aaaaaaaa-0000-4000-8000-0000000000a9' and l.id = 'aaaaaaaa-0000-4000-8000-0000000000ab'$$,
  'published/scheduled', 'yeniden onay: scheduled → published, prev = scheduled');
-- Silme de geri alma sayılır.
delete from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'scheduled', 'onaylı bağ silinince fikir önceki duruma döner');

-- Fikir bağ varken başka yoldan değiştiyse geri alma dokunmaz.
insert into public.idea_content_links (id, workspace_id, idea_id, shortcode, origin, status, content_item_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000ab', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'confirmed', 'aaaaaaaa-0000-4000-8000-0000000000d1');
update public.ideas set status = 'dismissed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a9';
delete from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ab';
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$, 'dismissed', 'fikir bağdan bağımsız değiştiyse (published değil) geri alma dokunmaz');

-- Reddedilmiş (dismissed) fikir onaylanamaz.
select tap.throws('23514', $$insert into public.idea_content_links (workspace_id, idea_id, shortcode, origin, status, content_item_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'manual_url', 'confirmed', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$,
  'dismissed fikre Reels bağlanamaz', 'reddedilmiş fikre');

-- Zaten published fikre onay serbest: durum aynı kalır, prev = published, geri alma published'ı bozmaz.
update public.ideas set status = 'published' where id = 'aaaaaaaa-0000-4000-8000-0000000000a7';
insert into public.idea_content_links (id, workspace_id, idea_id, shortcode, origin, status, content_item_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000ac', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a7', 'own1', 'manual_url', 'confirmed', 'aaaaaaaa-0000-4000-8000-0000000000d1');
select tap.eq($$select prev_idea_status from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ac'$$, 'published', 'published fikir onaylanabilir (prev = published)');
update public.idea_content_links set status = 'rejected' where id = 'aaaaaaaa-0000-4000-8000-0000000000ac';
select tap.eq($$select status from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$, 'published', 'önceden published fikir geri almada published kalır');

-- ── Cascade ────────────────────────────────────────────────────────────────────
delete from public.ideas where id = 'aaaaaaaa-0000-4000-8000-0000000000a7';
select tap.eq($$select count(*)::text from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ac'$$, '0', 'fikir silinince bağları da gider (cascade)');
insert into public.idea_content_links (id, workspace_id, idea_id, shortcode, origin, status, content_item_id, score)
  values ('aaaaaaaa-0000-4000-8000-0000000000ad', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'own1', 'auto_match', 'suggested', 'aaaaaaaa-0000-4000-8000-0000000000d1', 0.6);
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';
select tap.eq($$select count(*)::text from public.idea_content_links where id = 'aaaaaaaa-0000-4000-8000-0000000000ad'$$, '0', 'içerik silinince bağı da gider (cascade)');

-- ── Bildirimler: yeni türler + dedupe_key ──────────────────────────────────────
select tap.affects(1, $$insert into public.notifications (workspace_id, kind, title, dedupe_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measurement_due', 'Ölçüm zamanı geldi', 'measurement_due:own1:d7')$$,
  'measurement_due türü kabul edilir');
select tap.affects(1, $$insert into public.notifications (workspace_id, kind, title, dedupe_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'idea_link_suggested', 'Eşleşme önerisi', 'idea_link_suggested:x')$$,
  'idea_link_suggested türü kabul edilir');
select tap.throws('23514', $$insert into public.notifications (workspace_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'bilinmeyen', 'x')$$, 'bilinmeyen bildirim türü reddedilir', 'notifications_kind_check');
select tap.throws('23505', $$insert into public.notifications (workspace_id, kind, title, dedupe_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'measurement_due', 'tekrar', 'measurement_due:own1:d7')$$,
  'aynı dedupe_key ikinci bildirim üretmez', 'notifications_dedupe_key');
select tap.affects(1, $$insert into public.notifications (workspace_id, kind, title, dedupe_key) values ('bbbbbbbb-0000-4000-8000-000000000001', 'measurement_due', 'B', 'measurement_due:own1:d7')$$,
  'dedupe_key çalışma alanı başınadır (başka workspace aynı anahtarı kullanabilir)');
select tap.affects(2, $$insert into public.notifications (workspace_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'system', 'a'), ('aaaaaaaa-0000-4000-8000-000000000001', 'system', 'a')$$,
  'dedupe_key NULL ise tekilleştirme yok (eski satırlar etkilenmez)');
select tap.throws('23514', $$insert into public.notifications (workspace_id, kind, title, dedupe_key) values ('aaaaaaaa-0000-4000-8000-000000000001', 'system', 'x', '  ')$$, 'dedupe_key boşluktan ibaret olamaz', 'notifications_dedupe_key_check');

-- ── Koşular: purpose + reserve_budget ──────────────────────────────────────────
select tap.eq($$select coalesce(purpose, 'NULL') from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'NULL', 'mevcut koşular purpose NULL (normal iş)');
select tap.throws('23514', $$update public.collection_runs set purpose = 'ozel' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'purpose yalnız measurement ya da NULL', 'collection_runs_purpose_check');
set local role service_role;
do $$
declare
  r public.collection_runs;
begin
  r := public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.03, '{"kind": "content", "purpose": "measurement", "target_label": "@test_a_own"}');
  perform tap.ok(r.purpose = 'measurement' and r.status = 'reserved' and r.reserved_usd = 0.03 and r.actual_usd is null,
    'reserve_budget: p_run.purpose ölçüm koşusunu işaretler');
  r := public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "content"}');
  perform tap.ok(r.purpose is null, 'reserve_budget: purpose verilmezse NULL (mevcut davranış korunur)');
end $$;
select tap.throws('22023', $$select public.reserve_budget('aaaaaaaa-0000-4000-8000-000000000001', 'apify', 0.01, '{"kind": "content", "purpose": "baska"}')$$,
  'reserve_budget: bilinmeyen purpose reddedilir', 'baska');
reset role;

-- ── Workspace: ölçüm tavanı (varsayılan ONAYSIZ) ───────────────────────────────
select tap.eq($$select concat_ws('/', coalesce(measure_monthly_cap_usd::text, 'NULL'), coalesce(measure_cap_approved_at::text, 'NULL')) from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'NULL/NULL', 'varsayılan: ölçüm tavanı yok ve onaysız (harcama yapılamaz)');
select tap.throws('23514', $$update public.workspaces set measure_monthly_cap_usd = 0.5 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'tavan onay zamanı olmadan yazılamaz', 'workspaces_measure_cap_approved');
select tap.throws('23514', $$update public.workspaces set measure_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'onay zamanı tavansız yazılamaz', 'workspaces_measure_cap_approved');
select tap.throws('23514', $$update public.workspaces set measure_monthly_cap_usd = 1001, measure_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'ölçüm tavanı 0..1000', 'workspaces_measure_cap_range');
select tap.throws('23514', $$update public.workspaces set measure_monthly_cap_usd = -1, measure_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'ölçüm tavanı negatif olamaz', 'workspaces_measure_cap_range');
select tap.affects(1, $$update public.workspaces set measure_monthly_cap_usd = 0.5, measure_cap_approved_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'tavan + onay zamanı birlikte yazılır');
select tap.affects(1, $$update public.workspaces set measure_monthly_cap_usd = 0 where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '0 geçerli (ölçüm kapalı); onay zamanı korunur');
select tap.eq($$select count(*)::text from public.workspaces where measure_monthly_cap_usd is null and id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '1', 'B''nin tavanı etkilenmedi (hâlâ onaysız)');
select tap.ok(not has_column_privilege('authenticated', 'public.workspaces', 'measure_monthly_cap_usd', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.workspaces', 'measure_cap_approved_at', 'UPDATE'),
  'authenticated ölçüm tavanını yazamaz (yalnız sunucu: onay kararı)');
