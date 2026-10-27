-- panel — RLS politikaları + yetki matrisi + kullanıcı bootstrap'i.
--
-- Model: "iki kapı". Faz 1'de sunucu service role ile çalışır (RLS'yi aşar) ve giriş ekranı yoktur; bu dosya
-- ileride açılacak kapıyı (authenticated + üyelik) hazırlar ve test eder (supabase/tests/*.sql).
--   Kapı 1 — GRANT/REVOKE: anon hiçbir tabloya erişemez; authenticated yalnız aşağıdaki tablo/SÜTUN yetkilerine sahiptir.
--   Kapı 2 — RLS: yetkili sütunlarda bile satır, çalışma alanı üyeliğine (viewer/editor/owner) göre süzülür.
-- Yayın onayı, onaya gönderme, draft dışı insert, status/onay/yayın sütunları, bütçe rezervasyonu ve token'lar
-- authenticated'a KAPALIDIR (yalnız service role); 0004'teki trigger ikinci savunma hattıdır.
-- Yeni tablo eklenince: RLS aç + burada GRANT/politika ekle (varsayılan yetkiler 0001'de kapatıldı).

-- ── Sıfırdan başla: istemci rollerinin tüm tablo/sequence yetkilerini geri al ──
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- service role: tüm tablolar (auto_expose_new_tables kapalı olsa da çalışsın diye açıkça).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ── RLS yardımcısı ─────────────────────────────────────────
-- Kullanıcının bu çalışma alanındaki rolü en az `min_role` mı? Roller: viewer < editor < owner; bilinmeyen rol → false.
-- Tek çalışma alanı sorusu içindir (security definer RPC'ler, trigger'lar, testler). Politikalar bunu satır başına
-- çağırmaz; küme biçimini kullanır (aşağıdaki member_workspace_ids).
-- Security definer: workspace_members'ın kendi RLS'ine takılmaz (özyineleme yok). (select auth.uid()) sorgu
-- başına bir kez değerlendirilir. `private` şemada: PostgREST'e açık değil (RPC olarak çağrılamaz).
create function private.is_member(ws uuid, min_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members m
     where m.workspace_id = ws
       and m.user_id = (select auth.uid())
       and case min_role
             when 'viewer' then true
             when 'editor' then m.role in ('owner', 'editor')
             when 'owner' then m.role = 'owner'
             else false
           end
  );
$$;
revoke all on function private.is_member(uuid, text) from public, anon;
grant execute on function private.is_member(uuid, text) to authenticated, service_role;

-- Politikaların kullandığı küme biçimi: kullanıcının en az `min_role` olduğu çalışma alanı kimlikleri.
-- Neden ayrı? `is_member(workspace_id)` politika içinde SATIR BAŞINA çağrılır (20k satırlık okumada ~120 ms, 100k
-- satırda >1 sn: bkz. EXPLAIN ANALYZE ölçümü). `workspace_id in (select …member_workspace_ids())` ise ilişkisiz alt
-- sorgudur: sorgu başına BİR kez çalışır, satır başına yalnız hash araması yapılır (aynı okumalar 10-25x hızlı).
-- Anlamı is_member ile aynıdır (bilinmeyen rol → boş küme = erişim yok).
create function private.member_workspace_ids(min_role text default 'viewer')
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
    from public.workspace_members m
   where m.user_id = (select auth.uid())
     and case min_role
           when 'viewer' then true
           when 'editor' then m.role in ('owner', 'editor')
           when 'owner' then m.role = 'owner'
           else false
         end;
$$;
revoke all on function private.member_workspace_ids(text) from public, anon;
grant execute on function private.member_workspace_ids(text) to authenticated, service_role;

-- ── Yeni kullanıcı → profil ────────────────────────────────
-- Otomatik üyelik YOK (kayıt olan herkes bir çalışma alanına girmemeli): üyelik davetle/yönetici işiyle eklenir.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(btrim(new.email), ''), 'Kullanıcı'), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
-- Trigger fonksiyonu RPC olarak sızmasın: PUBLIC + istemci rollerinden EXECUTE'u geri al (trigger yine çalışır).
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Okuma yetkisi (authenticated) ──────────────────────────
-- social_account_tokens HARİÇ: RLS açık, politika yok, yetki yok → yalnız service role.
grant select on
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.social_accounts,
  public.competitors,
  public.collection_runs,
  public.content_items,
  public.metric_snapshots,
  public.content_latest_metrics,
  public.account_snapshots,
  public.transcripts,
  public.content_analyses,
  public.ideas,
  public.idea_evidence,
  public.publish_jobs,
  public.collections,
  public.collection_items,
  public.alert_settings,
  public.notifications
to authenticated;

-- ── Yazma yetkisi (authenticated): yalnız kullanıcı düzenlenebilir alanlar, SÜTUN bazında ──
grant update (display_name) on public.profiles to authenticated;
grant update (name, timezone, niche_brief, apify_monthly_cap_usd, llm_monthly_cap_usd, compliance_region, settings)
  on public.workspaces to authenticated;
-- Rakip: yalnız durum (candidate/tracked/ignored; private/not_found toplama sonucudur).
grant update (status) on public.competitors to authenticated;
-- Fikir: yalnız durum (geçiş kuralları depo katmanında).
grant update (status) on public.ideas to authenticated;
-- Yayın işi: status, onay, container, yayın, hata, sayaç sütunları YOK → onaya gönderme/onay/draft dışı insert
-- yalnız service role. Taslak açılır/düzenlenir; iptal/silme dışında durum ilerletilemez.
grant insert (
  workspace_id, social_account_id, platform, idea_id, caption, media_path, cover_path, share_to_feed,
  scheduled_at, paid_partnership, ai_generated, advertiser_name, trial_enabled, trial_graduation
) on public.publish_jobs to authenticated;
grant update (
  idea_id, caption, media_path, cover_path, share_to_feed, scheduled_at, paid_partnership, ai_generated,
  advertiser_name, trial_enabled, trial_graduation
) on public.publish_jobs to authenticated;
grant delete on public.publish_jobs to authenticated;
grant insert (workspace_id, name, name_key, description), update (name, name_key, description), delete
  on public.collections to authenticated;
grant insert (collection_id, content_item_id, workspace_id, note), update (note), delete
  on public.collection_items to authenticated;
grant insert (
  workspace_id, competitor_outlier_enabled, competitor_outlier_min_tier, own_outlier_enabled, own_outlier_min_tier,
  weekly_digest_enabled, weekly_digest_weekday, weekly_digest_hour, email_enabled, email_address, telegram_enabled
) on public.alert_settings to authenticated;
grant update (
  competitor_outlier_enabled, competitor_outlier_min_tier, own_outlier_enabled, own_outlier_min_tier,
  weekly_digest_enabled, weekly_digest_weekday, weekly_digest_hour, email_enabled, email_address, telegram_enabled
) on public.alert_settings to authenticated;
-- Bildirim: kullanıcı yalnız read_at günceller (üretimi sunucu yapar).
grant update (read_at) on public.notifications to authenticated;

-- ── Politikalar (tablo tablo, işlem başına; hepsi `to authenticated`, anon'a politika yok) ──

-- profiles: kendi profili.
create policy "profiles: kendini okur" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: kendini günceller" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces: üyeler okur; ayarları (tavan, uyum bölgesi, niş) yalnız sahip günceller. Oluşturma/silme sunucuda.
create policy "workspaces: üye okur" on public.workspaces
  for select to authenticated using (id in (select private.member_workspace_ids()));
create policy "workspaces: sahip günceller" on public.workspaces
  for update to authenticated
  using (id in (select private.member_workspace_ids('owner'))) with check (id in (select private.member_workspace_ids('owner')));

-- workspace_members: aynı çalışma alanının üyeleri birbirini görür. Üyelik yönetimi (davet) sunucuda (F5).
create policy "workspace_members: üye okur" on public.workspace_members
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));

-- social_accounts / collection_runs / ingest tabloları: üyeler okur, yazan sunucu.
create policy "social_accounts: üye okur" on public.social_accounts
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "collection_runs: üye okur" on public.collection_runs
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "content_items: üye okur" on public.content_items
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "metric_snapshots: üye okur" on public.metric_snapshots
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "account_snapshots: üye okur" on public.account_snapshots
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "transcripts: üye okur" on public.transcripts
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "content_analyses: üye okur" on public.content_analyses
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "idea_evidence: üye okur" on public.idea_evidence
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));

-- competitors: üyeler okur; editör yalnız kullanıcı durumlarını (candidate/tracked/ignored) değiştirir
-- (private/not_found satırlarına dokunamaz). Ekleme (Apify rezervesiyle) sunucuda.
create policy "competitors: üye okur" on public.competitors
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "competitors: editör durumu günceller" on public.competitors
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor')) and status in ('candidate', 'tracked', 'ignored'))
  with check (workspace_id in (select private.member_workspace_ids('editor')) and status in ('candidate', 'tracked', 'ignored'));

-- ideas: üyeler okur; editör durumu değiştirir. Üretim sunucuda.
create policy "ideas: üye okur" on public.ideas
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "ideas: editör durumu günceller" on public.ideas
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));

-- publish_jobs: üyeler okur; editör taslak açar/düzenler, taslak/iptal edilmiş işi siler.
-- Durum ilerletme yetkisi (sütun) ve trigger zaten kapalı; politika yalnız çalışma alanı sınırını çizer.
create policy "publish_jobs: üye okur" on public.publish_jobs
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "publish_jobs: editör taslak açar" on public.publish_jobs
  for insert to authenticated with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "publish_jobs: editör günceller" on public.publish_jobs
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "publish_jobs: editör taslağı siler" on public.publish_jobs
  for delete to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor')) and status in ('draft', 'cancelled'));

-- collections + collection_items: üyeler okur, editör yazar.
create policy "collections: üye okur" on public.collections
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "collections: editör ekler" on public.collections
  for insert to authenticated with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "collections: editör günceller" on public.collections
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "collections: editör siler" on public.collections
  for delete to authenticated using (workspace_id in (select private.member_workspace_ids('editor')));

create policy "collection_items: üye okur" on public.collection_items
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "collection_items: editör ekler" on public.collection_items
  for insert to authenticated with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "collection_items: editör günceller" on public.collection_items
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "collection_items: editör siler" on public.collection_items
  for delete to authenticated using (workspace_id in (select private.member_workspace_ids('editor')));

-- alert_settings: üyeler okur; editör yazar (satır yoksa ilk kaydı da o açar).
create policy "alert_settings: üye okur" on public.alert_settings
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "alert_settings: editör ekler" on public.alert_settings
  for insert to authenticated with check (workspace_id in (select private.member_workspace_ids('editor')));
create policy "alert_settings: editör günceller" on public.alert_settings
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));

-- notifications: üyeler okur; editör yalnız read_at günceller (sütun yetkisi). Üretim/silme sunucuda.
create policy "notifications: üye okur" on public.notifications
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
create policy "notifications: editör okundu işaretler" on public.notifications
  for update to authenticated
  using (workspace_id in (select private.member_workspace_ids('editor'))) with check (workspace_id in (select private.member_workspace_ids('editor')));

-- social_account_tokens: BİLİNÇLİ olarak politika YOK (RLS açık + yetki yok → yalnız service role).
