-- panel — yayın işleri. Şema ↔ domain eşlemesi: src/lib/domain/publish.ts.
-- Kural: yalnız resmi Content Publishing API; HER yayın insan onaylı. Bu migration onayı üç katmanda taşır:
--   1) CHECK kısıtları: onay sonrası hiçbir durum onay kaydı (approved_at + approved_by) olmadan var olamaz;
--   2) trigger: onay yalnız awaiting_approval → approved geçişinde, editör/sahip bir üyeyle yazılabilir;
--      onaylı içerik (açıklama, medya, ibareler) değiştirilemez; authenticated/anon durum ilerletemez;
--   3) 0006_rls.sql: authenticated'ın status/onay/yayın sütunlarına UPDATE/INSERT yetkisi YOK (yalnız service role).
-- Uyum kuralları (lib/compliance: `fail` → engel) TypeScript'te çalışır ve onaya gönderme/onay yolunda depo
-- katmanında uygulanır; o yol yalnız service role'dedir.
-- Veri düzeltmesi gerekirse (elle) trigger yalnız transaction içinde kapatılır:
--   begin; alter table public.publish_jobs disable trigger publish_jobs_guard; … ; alter table … enable trigger …; commit;
-- CHECK kısıtları her durumda geçerlidir.
--
-- Durum makinesi: draft → awaiting_approval → approved → container_pending → ready → publishing → published;
-- herhangi bir aşamadan failed; container süresi dolarsa expired (yeniden kurulabilir); yayına çıkmadan cancelled.

create table public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Yayının çıkacağı kendi hesap. platform, hesabın platformuyla bileşik FK'yla tutarlı tutulur.
  social_account_id uuid not null,
  platform public.platform not null,
  idea_id uuid,
  status text not null default 'draft'
    check (status in (
      'draft', 'awaiting_approval', 'approved', 'container_pending', 'ready',
      'publishing', 'published', 'failed', 'expired', 'cancelled'
    )),
  -- 2200 karakter (kod noktası) Instagram sınırı; hashtag sayısı (30) uygulamada denetlenir.
  caption text check (char_length(caption) <= 2200),
  -- Özel Storage (publish-media) yolları; Storage Faz 3'te açılır.
  media_path text,
  cover_path text,
  share_to_feed boolean not null default true,
  scheduled_at timestamptz,
  -- Uyum alanları (lib/compliance): ücretli iş birliği ibaresi, YZ beyanı, reklam veren.
  paid_partnership boolean not null default false,
  ai_generated boolean not null default false,
  advertiser_name text check (char_length(advertiser_name) between 1 and 100),
  -- Trial Reels: mezuniyet stratejisi (API: MANUAL / SS_PERFORMANCE).
  trial_enabled boolean not null default false,
  trial_graduation text check (trial_graduation in ('manual', 'performance')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  -- İnsan onayı kaydı: onaylayan kullanıcı + an. Denetim izi için kullanıcı silinemez (RESTRICT).
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  container_id text,
  container_expires_at timestamptz,
  published_external_id text,
  published_permalink text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint publish_jobs_social_account_fkey foreign key (social_account_id, workspace_id, platform)
    references public.social_accounts (id, workspace_id, platform) on delete cascade,
  constraint publish_jobs_idea_fkey foreign key (idea_id, workspace_id)
    references public.ideas (id, workspace_id) on delete set null (idea_id),

  -- İNSAN ONAYI: onay sonrası durumlar onay kaydı olmadan var olamaz.
  constraint publish_jobs_human_approval check (
    status not in ('approved', 'container_pending', 'ready', 'publishing', 'published', 'expired')
    or (approved_at is not null and approved_by is not null)
  ),
  -- Onay kaydı ya tamdır ya yok (yarım kayıt olmaz).
  constraint publish_jobs_approval_pair check ((approved_at is null) = (approved_by is null)),
  -- Onaya gönderilmemiş iş onaylı görünemez.
  constraint publish_jobs_no_approval_before_submit check (
    status not in ('draft', 'awaiting_approval') or approved_at is null
  ),
  -- Onaya gönderme ve sonrası açıklama ister ("Onaya göndermek için açıklama yaz").
  constraint publish_jobs_caption_required check (
    status not in ('awaiting_approval', 'approved', 'container_pending', 'ready', 'publishing', 'published', 'expired')
    or nullif(btrim(caption), '') is not null
  ),
  constraint publish_jobs_trial_needs_graduation check (not trial_enabled or trial_graduation is not null)
);
comment on constraint publish_jobs_human_approval on public.publish_jobs
  is 'Her yayın insan onaylı: onay sonrası durumlar approved_at + approved_by ister.';

-- Takvim/liste: çalışma alanı + durum + planlanan zaman.
create index publish_jobs_workspace_status_idx on public.publish_jobs (workspace_id, status, scheduled_at);
-- Kota penceresi (hesap başına son 24 saat) ve hesap FK/cascade aramaları.
create index publish_jobs_account_status_idx on public.publish_jobs (social_account_id, status, published_at desc);
-- Worker: yayına yaklaşan onaylı işler (tüm çalışma alanları).
create index publish_jobs_due_idx on public.publish_jobs (scheduled_at)
  where status in ('approved', 'container_pending', 'ready', 'publishing');
create index publish_jobs_idea_idx on public.publish_jobs (idea_id) where idea_id is not null;
create index publish_jobs_approved_by_idx on public.publish_jobs (approved_by) where approved_by is not null;
alter table public.publish_jobs enable row level security;

-- ── Yayın koruma trigger'ı ─────────────────────────────────
-- Security INVOKER: `current_user` çağıran roldür. Doğrudan istemci rolleri (authenticated/anon) kısıtlanır;
-- ileride onay yolu bir security definer RPC'den geçerse (current_user = sahip rol) o kısıt uygulanmaz,
-- ama aşağıdaki bütünlük kuralları HER rol için geçerlidir (service role dahil).
create function private.publish_jobs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'awaiting_approval') or new.approved_at is not null or new.approved_by is not null then
      raise exception 'publish_invalid_insert' using errcode = '23514',
        detail = 'Yeni iş yalnız draft ya da awaiting_approval ile ve onaysız açılır.';
    end if;
    if v_client and new.status <> 'draft' then
      raise exception 'publish_status_forbidden' using errcode = '42501',
        detail = 'authenticated/anon yalnız draft açabilir; onaya gönderme yalnız service role.';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.workspace_id <> old.workspace_id then
    raise exception 'publish_workspace_immutable' using errcode = '23514';
  end if;
  if new.status <> old.status and old.status in ('published', 'cancelled') then
    raise exception 'publish_invalid_transition' using errcode = '23514',
      detail = format('%s durumundan çıkılamaz', old.status);
  end if;
  if new.status = 'awaiting_approval' and old.status not in ('draft', 'awaiting_approval') then
    raise exception 'publish_invalid_transition' using errcode = '23514',
      detail = 'Onaya gönderme yalnız draft durumundan yapılır.';
  end if;

  -- İnsan onayı: kayıt yalnız awaiting_approval → approved geçişinde, editör/sahip bir üyeyle yazılır ve sonra değişmez.
  if old.approved_at is not null then
    if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by then
      raise exception 'publish_approval_immutable' using errcode = '23514';
    end if;
  elsif new.approved_at is not null then
    if not (old.status = 'awaiting_approval' and new.status = 'approved') then
      raise exception 'publish_approval_transition' using errcode = '23514',
        detail = 'Onay yalnız awaiting_approval → approved geçişinde yazılır.';
    end if;
    if not exists (
      select 1
        from public.workspace_members m
       where m.workspace_id = new.workspace_id
         and m.user_id = new.approved_by
         and m.role in ('owner', 'editor')
    ) then
      raise exception 'publish_approver_not_editor' using errcode = '23514',
        detail = 'Onaylayan bu çalışma alanının editör/sahip üyesi olmalı.';
    end if;
  end if;

  -- Onaylanan = yayınlanan: taslaktan sonra içerik alanları değişmez.
  if old.status <> 'draft' and (
       new.social_account_id is distinct from old.social_account_id
    or new.platform is distinct from old.platform
    or new.caption is distinct from old.caption
    or new.media_path is distinct from old.media_path
    or new.cover_path is distinct from old.cover_path
    or new.share_to_feed is distinct from old.share_to_feed
    or new.paid_partnership is distinct from old.paid_partnership
    or new.ai_generated is distinct from old.ai_generated
    or new.advertiser_name is distinct from old.advertiser_name
    or new.trial_enabled is distinct from old.trial_enabled
    or new.trial_graduation is distinct from old.trial_graduation
  ) then
    raise exception 'publish_content_frozen' using errcode = '23514',
      detail = 'Onaya gönderilmiş işin içeriği değiştirilemez.';
  end if;

  -- Doğrudan istemci rolleri: yalnız iptal edebilir; yayın/onay/container alanlarına dokunamaz.
  if v_client then
    if new.status is distinct from old.status
       and not (new.status = 'cancelled' and old.status not in ('publishing', 'published', 'cancelled')) then
      raise exception 'publish_status_forbidden' using errcode = '42501',
        detail = 'authenticated/anon yayın durumunu ilerletemez; yalnız iptal edebilir.';
    end if;
    if new.container_id is distinct from old.container_id
       or new.container_expires_at is distinct from old.container_expires_at
       or new.published_external_id is distinct from old.published_external_id
       or new.published_permalink is distinct from old.published_permalink
       or new.published_at is distinct from old.published_at
       or new.last_error is distinct from old.last_error
       or new.attempt_count is distinct from old.attempt_count then
      raise exception 'publish_status_forbidden' using errcode = '42501',
        detail = 'Yayın alanlarını yalnız sunucu (service role) yazar.';
    end if;
  end if;

  return new;
end;
$$;

create trigger publish_jobs_guard before insert or update on public.publish_jobs
  for each row execute function private.publish_jobs_guard();
create trigger publish_jobs_set_updated_at before update on public.publish_jobs
  for each row execute function private.set_updated_at();
