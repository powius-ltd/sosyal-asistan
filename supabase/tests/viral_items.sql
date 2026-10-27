-- 0027_viral_items testi: viral av havuzu (şekil kısıtları, tekillik, cascade, RLS).
-- Fixture (_fixture.sql): A çalışma alanı …0001, B çalışma alanı bbbbbbbb-…-0001; kullanıcılar A-viewer …a3.

-- ── Şekil kısıtları ─────────────────────────────────────────────
set local role service_role;
select tap.affects(1, $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, author_followers, views, views_kind, views_per_follower, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v1', 'yazar_a', 1000, 5000, 'tt_play_count', 5, now(), 'https://www.tiktok.com/@yazar_a/video/1', 'kahve')$$, 'service role viral satırı yazar');
select tap.affects(1, $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'ig1', 'yazar_b', 9000, 'ig_play_count', now(), 'https://www.instagram.com/reel/ig1/', 'kahve')$$, 'takipçi ve oran NULL olabilir (ölçülemeyen ≠ 0)');
select tap.throws('23505', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v1', 'yazar_a', 1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/1', 'kahve')$$, 'aynı içerik ikinci kez yazılamaz', 'viral_items_unique');
select tap.throws('23514', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v2', 'yazar_a', -1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/2', 'kahve')$$, 'izlenme eksi olamaz', 'viral_items_views_check');
select tap.throws('23514', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query, caption)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v3', 'yazar_a', 1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/3', 'kahve', repeat('x', 501))$$, 'açıklama ≤ 500 karakter', 'viral_items_caption_check');
select tap.throws('23514', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v4', 'yazar_a', 1, 'tt_play_count', now(), 'javascript:alert(1)', 'kahve')$$, 'içerik bağlantısı http(s) olmak zorunda', 'viral_items_content_url_check');
select tap.throws('23514', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, author_followers, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'v5', 'yazar_a', -5, 1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/5', 'kahve')$$, 'takipçi eksi olamaz', 'viral_items_author_followers_check');
select tap.throws('23503', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('cccccccc-0000-4000-8000-000000000001', 'tiktok', 'v6', 'yazar_a', 1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/6', 'kahve')$$, 'olmayan çalışma alanına yazılamaz', 'viral_items_workspace_id_fkey');
select tap.affects(1, $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('bbbbbbbb-0000-4000-8000-000000000001', 'tiktok', 'v1', 'yazar_a', 1, 'tt_play_count', now(), 'https://www.tiktok.com/@yazar_a/video/1', 'kahve')$$, 'aynı kimlik başka çalışma alanında ayrı satırdır');
reset role;

-- ── RLS: üye okur (yalnız kendi çalışma alanı), yazamaz; anon göremez ──────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.viral_items$$, '3', 'viewer yalnız kendi çalışma alanının viral satırlarını görür (B satırı görünmez)');
select tap.throws('42501', $$insert into public.viral_items (workspace_id, platform, external_id, author_handle, views, views_kind, published_at, content_url, query)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'x', 'y', 1, 'tt_play_count', now(), 'https://x.test/', 'q')$$, 'authenticated viral satırı yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.viral_items set views = 1$$, 'authenticated viral satırı değiştiremez');
select tap.throws('42501', $$delete from public.viral_items$$, 'authenticated viral satırı silemez');
reset role;
set local role anon;
select tap.throws('42501', $$select count(*) from public.viral_items$$, 'anon viral satırı okuyamaz (permission denied)');
reset role;

-- ── Çalışma alanı silinince satırları gider (cascade) ─────────────────────────
delete from public.workspaces where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select tap.eq($$select count(*)::text from public.viral_items where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'çalışma alanı silinince viral satırlar da gider (cascade)');
