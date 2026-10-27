-- Test fixture'ı: scripts/db-test.mjs her test dosyasının başına ekler (tek transaction; sonunda ROLLBACK).
-- Kimlikler: aaaaaaaa-… = çalışma alanı A tarafı, bbbbbbbb-… = B tarafı. Postgres rolüyle çalışır (RLS'yi aşar).
--   kullanıcılar: A-owner …a1, A-editor …a2, A-viewer …a3, B-owner (bbbbbbbb-…-b1)
--   çalışma alanları: A …0001, B …0001; kendi hesap …c1; rakip (A) …c2; içerik …d1 (kendi), …d2 (rakip)

insert into auth.users (
  instance_id, id, aud, role, email, confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'a-owner@test.local', '', '', '', '', '{"display_name": "A sahibi"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'a-editor@test.local', '', '', '', '', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'a-viewer@test.local', '', '', '', '', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'b-owner@test.local', '', '', '', '', '{}', now(), now());

insert into public.workspaces (id, name, slug, apify_monthly_cap_usd, llm_monthly_cap_usd) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a', 10, 10),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Test B', 'test-b', 10, 10);

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'editor'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a3', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'owner');

insert into public.social_accounts (id, workspace_id, platform, handle, external_id, connection, followers) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'test_a_own', 'ig-a-1', 'connected', 1500),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000001', 'instagram', 'test_b_own', 'ig-b-1', 'connected', 900);

insert into public.social_account_tokens (social_account_id, vault_secret_id)
values ('aaaaaaaa-0000-4000-8000-0000000000c1', gen_random_uuid());

insert into public.competitors (id, workspace_id, platform, handle, status, source, followers) values
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'test_a_rival', 'tracked', 'manual', 20000),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'test_a_private', 'private', 'related', null);

insert into public.collection_runs (id, workspace_id, provider, kind, status, reserved_usd, actual_usd) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'apify', 'content', 'ingested', 0.5, 0.4),
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000001', 'apify', 'content', 'ingested', 0.5, null);

insert into public.content_items (
  id, workspace_id, platform, social_account_id, competitor_id, external_id, shortcode, format, published_at,
  views_kind, baseline_views, baseline_n, baseline_excluded, lift, lift_tier, scored_at
) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram',
   'aaaaaaaa-0000-4000-8000-0000000000c1', null, 'ig_own_1', 'own1', 'short_video', now() - interval '10 days',
   'ig_play_count', 1000, 12,
   '{"self": 1, "otherFormat": 2, "pinned": 0, "noViews": 0, "differentViewsKind": 0, "noDate": 0, "tooYoung": 1}',
   2.4, 2, now()),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram',
   null, 'aaaaaaaa-0000-4000-8000-0000000000c2', 'ig_comp_1', 'comp1', 'short_video', now() - interval '5 days',
   'ig_play_count', 20000, 25,
   '{"self": 1, "otherFormat": 0, "pinned": 1, "noViews": 0, "differentViewsKind": 0, "noDate": 0, "tooYoung": 0}',
   3.5, 3, now()),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'instagram',
   'bbbbbbbb-0000-4000-8000-0000000000c1', null, 'ig_b_1', 'b1', 'short_video', now() - interval '3 days',
   null, null, null, null, null, null, null);

insert into public.metric_snapshots (id, workspace_id, content_item_id, captured_at, views, views_kind, likes, source, collection_run_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', now() - interval '2 days', 500, 'ig_play_count', 20, 'apify', null),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', now() - interval '1 day', 900, 'ig_play_count', 40, 'apify', 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d2', now() - interval '1 day', 70000, 'ig_play_count', null, 'apify', null),
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000d1', now() - interval '1 day', 300, 'ig_play_count', 10, 'apify', null);

insert into public.account_snapshots (workspace_id, platform, social_account_id, competitor_id, followers, source) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'aaaaaaaa-0000-4000-8000-0000000000c1', null, 1500, 'apify'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'instagram', null, 'aaaaaaaa-0000-4000-8000-0000000000c2', 20000, 'apify');

insert into public.transcripts (workspace_id, content_item_id, provider, language, text, word_count, is_meaningful, expires_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'manual', 'en', 'Own transcript that never expires because it is ours.', 9, true, null),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'apify', 'en', 'Rival transcript that expires after ninety days of storage.', 9, true, now() + interval '90 days');

insert into public.content_analyses (
  workspace_id, content_item_id, status, hook_text, hook_type, hook_type_evidence, evidence_verified,
  taxonomy_version, prompt_version, model, search_key
) values (
  'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'ok',
  'Rival transcript that expires', 'statement', 'Rival transcript that expires', true,
  'tax-1', 'prompt-1', 'test-model', 'rival transcript that expires test_a_rival statement'
);

insert into public.ideas (id, workspace_id, platform, format, title, rationale, hooks) values
  ('aaaaaaaa-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Fikir A', 'Çünkü tutuyor', '["h1","h2","h3"]'),
  ('bbbbbbbb-0000-4000-8000-0000000000a9', 'bbbbbbbb-0000-4000-8000-000000000001', 'instagram', 'short_video', 'Fikir B', 'Çünkü tutuyor', '["h1","h2","h3"]');

insert into public.idea_evidence (idea_id, content_item_id, workspace_id, lift_at_creation) values
  ('aaaaaaaa-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 2.4),
  ('aaaaaaaa-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 3.5);

insert into public.publish_jobs (id, workspace_id, social_account_id, platform, caption, scheduled_at) values
  ('aaaaaaaa-0000-4000-8000-0000000000b9', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'Taslak açıklama #tanıtım', now() + interval '2 days'),
  ('bbbbbbbb-0000-4000-8000-0000000000b9', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'instagram', 'B taslağı', null);

insert into public.collections (id, workspace_id, name, name_key) values
  ('aaaaaaaa-0000-4000-8000-0000000000c9', 'aaaaaaaa-0000-4000-8000-000000000001', 'İlham', 'ilham'),
  ('bbbbbbbb-0000-4000-8000-0000000000c9', 'bbbbbbbb-0000-4000-8000-000000000001', 'B koleksiyonu', 'b koleksiyonu');
insert into public.collection_items (collection_id, content_item_id, workspace_id, note)
values ('aaaaaaaa-0000-4000-8000-0000000000c9', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kanıt');

insert into public.alert_settings (workspace_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000001');

insert into public.notifications (id, workspace_id, kind, title, content_item_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a8', 'aaaaaaaa-0000-4000-8000-000000000001', 'competitor_outlier', '@test_a_rival tuttu', 'aaaaaaaa-0000-4000-8000-0000000000d2'),
  ('bbbbbbbb-0000-4000-8000-0000000000a8', 'bbbbbbbb-0000-4000-8000-000000000001', 'system', 'B bildirimi', null);

-- Ses profili + haftalık plan (0007): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.voice_profiles (workspace_id, social_account_id, platform, language, summary, taxonomy_version, prompt_version) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'instagram', 'en', 'Sıcak ve doğrudan.', '2026-10-v1', 'voice-v1'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'instagram', 'en', 'B sesi.', '2026-10-v1', 'voice-v1');

insert into public.weekly_plans (id, workspace_id, week_start, sections, taxonomy_version, prompt_version) values
  ('aaaaaaaa-0000-4000-8000-0000000000e9', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-09-28', '{}', '2026-10-v1', 'plan-v1'),
  ('bbbbbbbb-0000-4000-8000-0000000000e9', 'bbbbbbbb-0000-4000-8000-000000000001', '2026-09-28', '{}', '2026-10-v1', 'plan-v1');

insert into public.weekly_plan_items (plan_id, idea_id, workspace_id, position) values
  ('aaaaaaaa-0000-4000-8000-0000000000e9', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-000000000001', 1),
  ('bbbbbbbb-0000-4000-8000-0000000000e9', 'bbbbbbbb-0000-4000-8000-0000000000a9', 'bbbbbbbb-0000-4000-8000-000000000001', 1);

-- Konu eleği (0008): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.content_topic_screens (content_item_id, workspace_id, in_niche, topic, reason, prompt_version, model) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', true, 'Yenilenme pratiği', 'Açıklama hizalanma ve nefes çalışmasından söz ediyor.', 'screen-topics-v1', 'claude-test'),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', true, 'B konusu', null, 'screen-topics-v1', 'claude-test');

-- Aday niş eleği (0024): A'nın gizli rakibi için bir satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler; B'nin rakibi yok).
insert into public.competitor_screens (competitor_id, workspace_id, platform, fit, reason, prompt_version, model) values
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'instagram', 'unsure', 'Biyografi yok.', 'screen-candidates-v1', 'claude-test');

-- Kreatif etiket (0011): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, model) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aci-korku', 'sorunu-biliyor', 'Yıllardır aynı yorgunlukla uyanıyorsan', 'ne yapacağını bilmiyorsun', true, 'label-angles-v1', 'claude-test'),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'kimlik', 'cozum-ariyor', 'B alıntısı', 'B alıntısı', true, 'label-angles-v1', 'claude-test');

-- Konu kümesi (0015): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version, model) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'sabah_rutini', 'Sabah rutini', 'cluster-topics-v1', 'claude-test'),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'b_kumesi', 'B kümesi', 'cluster-topics-v1', 'claude-test');

-- Ajan brifingi (0012): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.agent_briefings (id, workspace_id, agent, generated_at, payload, basis, prompt_version, persona_version, model) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'analyst', '2026-09-30T09:00:00Z',
   '{"schemaVersion":1,"items":[{"kind":"worked","headline":"A başlığı","body":"A gövdesi.","evidence":["c:aaaaaaaa-0000-4000-8000-0000000000d1"],"confidence":"low"}]}',
   '{"analyzedCount":3,"labeledCount":1}', 'briefing-v1', 'persona-v1', 'claude-test'),
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000001', 'analyst', '2026-09-30T09:00:00Z',
   '{"schemaVersion":1,"items":[{"kind":"worked","headline":"B başlığı","body":"B gövdesi.","evidence":["c:bbbbbbbb-0000-4000-8000-0000000000d1"],"confidence":"low"}]}',
   '{"analyzedCount":1,"labeledCount":1}', 'briefing-v1', 'persona-v1', 'claude-test');

-- Panel işi (0016): her çalışma alanında BİTMİŞ birer iş (…b7; etkin iş yok: "tek etkin iş" testleri temiz başlar). rls.sql yalıtım
-- döngüsü her tabloda A'nın verisini bekler.
insert into public.panel_jobs (id, workspace_id, kind, status, steps, worker_id, started_at, heartbeat_at, finished_at, requested_by) values
  ('aaaaaaaa-0000-4000-8000-0000000000b7', 'aaaaaaaa-0000-4000-8000-000000000001', 'briefing', 'succeeded', '[{"id":"briefing","status":"ok"}]',
   'fixture-worker', now() - interval '2 hours', now() - interval '110 minutes', now() - interval '110 minutes', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('bbbbbbbb-0000-4000-8000-0000000000b7', 'bbbbbbbb-0000-4000-8000-000000000001', 'briefing', 'succeeded', '[{"id":"briefing","status":"ok"}]',
   'fixture-worker', now() - interval '2 hours', now() - interval '110 minutes', now() - interval '110 minutes', 'bbbbbbbb-0000-4000-8000-0000000000b1');

-- Fikir ↔ Reels bağı (0010): her çalışma alanında bekleyen (awaiting_content) birer link. Bekleyen link fikir durumunu
-- değiştirmez ve içerik gerektirmez; rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler.
insert into public.idea_content_links (id, workspace_id, idea_id, shortcode, status, origin) values
  ('aaaaaaaa-0000-4000-8000-0000000000aa', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'fxawaitA', 'awaiting_content', 'manual_url'),
  ('bbbbbbbb-0000-4000-8000-0000000000aa', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a9', 'fxawaitB', 'awaiting_content', 'manual_url');

-- Viral av (0027): her çalışma alanında birer satır (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler).
insert into public.viral_items (workspace_id, platform, external_id, author_handle, author_followers, views, views_kind, views_per_follower, published_at, content_url, query) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'tiktok', 'fx1', 'fixture_a', 100, 1000, 'tt_play_count', 10, now(), 'https://www.tiktok.com/@fixture_a/video/1', 'fixture'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'tiktok', 'fx1', 'fixture_b', 100, 1000, 'tt_play_count', 10, now(), 'https://www.tiktok.com/@fixture_b/video/1', 'fixture');

-- Reklam (0029): her çalışma alanında birer zincir (rls.sql yalıtım döngüsü her tabloda A'nın verisini bekler; ads.sql sayımları buna göredir).
insert into public.ad_accounts (id, workspace_id, external_account_id, currency) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'fx_a', 'TRY');
insert into public.ad_campaigns (id, workspace_id, account_id, external_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'fx', 'Fixture kampanya');
insert into public.ad_sets (id, workspace_id, campaign_id, external_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'fx', 'Fixture set');
insert into public.ad_creatives (id, workspace_id, account_id, format) values ('aaaaaaaa-0000-4000-8000-0000000000f4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'video');
insert into public.ads (id, workspace_id, ad_set_id, creative_id, external_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000f5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-0000000000f4', 'fx', 'Fixture reklam');
insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000f5', '2026-10-01', 'aaaaaaaa-0000-4000-8000-000000000001', 10, 100);
insert into public.ad_accounts (id, workspace_id, external_account_id, currency) values ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000001', 'fx_b', 'TRY');
insert into public.ad_campaigns (id, workspace_id, account_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000f2', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000f1', 'fx', 'Fixture kampanya');
insert into public.ad_sets (id, workspace_id, campaign_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000f3', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000f2', 'fx', 'Fixture set');
insert into public.ad_creatives (id, workspace_id, account_id, format) values ('bbbbbbbb-0000-4000-8000-0000000000f4', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000f1', 'video');
insert into public.ads (id, workspace_id, ad_set_id, creative_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000f5', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000f3', 'bbbbbbbb-0000-4000-8000-0000000000f4', 'fx', 'Fixture reklam');
insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('bbbbbbbb-0000-4000-8000-0000000000f5', '2026-10-01', 'bbbbbbbb-0000-4000-8000-000000000001', 10, 100);

-- 0032: fiş (stüdyo siparişi) — her çalışma alanının fikrine tek taslak fiş (rls.sql yalıtım döngüsü her çalışma alanı tablosunda satır ister).
insert into public.studio_orders (id, workspace_id, idea_id, ticket, status) values
  ('aaaaaaaa-0000-4000-8000-0000000000f6', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a9', '{"durum":"taslak","onay":false}', 'taslak'),
  ('bbbbbbbb-0000-4000-8000-0000000000f6', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a9', '{"durum":"taslak","onay":false}', 'taslak');
