-- panel — Faz 2 kapanış: döngüyü kapat (fikir ↔ yayınlanan Reels ↔ ölçüm).
-- Şema ↔ domain eşlemesi: src/lib/domain/{intel,outcomes,notification,run}.ts. Plan: docs/FAZ2-KAPANIS-PLAN.md §2.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo/sütun/index; tek
-- istisna notifications.kind check'i, aynı adla GENİŞLETİLİR, mevcut satırlar geçerli kalır). Mevcut satırlara dokunmaz.

-- ── Fikir ↔ Reels bağı ─────────────────────────────────────
-- Kullanıcı linki yapıştırır (manual_url) ya da toplama sonrası otomatik eşleşme önerilir (auto_match):
--   awaiting_content : link verildi, kendi içerikte henüz yok (content_item_id NULL; sonraki toplamada çözülür)
--   suggested        : otomatik öneri (yalnız auto_match); sessiz bağ YOK, onay kullanıcıda
--   confirmed        : bağ onaylı → fikir `published` olur (prev_idea_status eski durumu saklar)
--   rejected         : öneri reddedildi ya da onaylı bağ kaldırıldı (aynı çift tekrar önerilmesin diye satır kalır)
-- Yazan yalnız sunucu (service role); kullanıcı okur. İki trigger kuralı DB'de tutar (hangi yoldan yazılırsa yazılsın):
--   guard (before)  : yalnız KENDİ hesap içeriği, shortcode ve platform tutarlı, onaylanırken fikrin durumu `prev_idea_status`'a
--                     yazılır; reddedilmiş (dismissed) fikir onaylanamaz; kimlik alanları değişmez.
--   sync (after)    : confirmed olunca fikir → published; confirmed'dan çıkınca (rejected/silme) fikir hâlâ published ise
--                     prev_idea_status'a döner. Böylece bağ + fikir durumu TEK deyimde atomik değişir (PostgREST'ten de).
create table public.idea_content_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  idea_id uuid not null,
  -- Instagram kısa kodu (büyük/küçük harf duyarlı); link yapıştırmada URL'den ayrıştırılır.
  shortcode text not null check (shortcode ~ '^[A-Za-z0-9_-]{1,40}$'),
  content_item_id uuid,
  status text not null default 'awaiting_content'
    check (status in ('awaiting_content', 'suggested', 'confirmed', 'rejected')),
  origin text not null check (origin in ('manual_url', 'auto_match')),
  -- Otomatik eşleşme skoru 0..1 (0,6·metin + 0,4·zaman); elle linkte NULL (ölçülmedi, 0 değil).
  score double precision check (score is null or (score >= 0 and score <= 1)),
  -- Eşleşme gerekçeleri (kısa Türkçe metinler dizisi).
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  -- Onay anındaki fikir durumu (yalnız confirmed'da dolu; bağ kalkınca fikir buna döner). Trigger yazar.
  prev_idea_status text check (prev_idea_status in ('new', 'saved', 'scripted', 'scheduled', 'published', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idea_content_links_tenant_key unique (id, workspace_id),
  constraint idea_content_links_idea_shortcode_key unique (idea_id, shortcode),
  constraint idea_content_links_idea_fkey foreign key (idea_id, workspace_id)
    references public.ideas (id, workspace_id) on delete cascade,
  constraint idea_content_links_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade,
  constraint idea_content_links_content_by_status check ((status = 'awaiting_content') = (content_item_id is null)),
  constraint idea_content_links_awaiting_manual check (status <> 'awaiting_content' or origin = 'manual_url'),
  constraint idea_content_links_suggested_auto check (status <> 'suggested' or (origin = 'auto_match' and score is not null)),
  constraint idea_content_links_prev_status check ((status = 'confirmed') = (prev_idea_status is not null))
);
comment on table public.idea_content_links is 'Fikir ↔ yayınlanan Reels bağı. Otomatik eşleşme yalnız öneri yazar (suggested); onay kullanıcıda.';
comment on column public.idea_content_links.score is 'NULL = elle link (skor yok), 0 değil.';

-- Fikir başına tek AKTİF bağ (bekleyen ya da onaylı) ve içerik başına en çok bir onaylı bağ.
create unique index idea_content_links_idea_active_key on public.idea_content_links (idea_id)
  where status in ('awaiting_content', 'confirmed');
create unique index idea_content_links_content_confirmed_key on public.idea_content_links (content_item_id)
  where status = 'confirmed';
-- Toplama sonrası çözüm: workspace'in bekleyen linkleri shortcode ile aranır.
create index idea_content_links_awaiting_idx on public.idea_content_links (workspace_id, shortcode)
  where status = 'awaiting_content';
create index idea_content_links_workspace_status_idx on public.idea_content_links (workspace_id, status);
-- content_item_id ON DELETE CASCADE FK araması.
create index idea_content_links_content_idx on public.idea_content_links (content_item_id) where content_item_id is not null;
alter table public.idea_content_links enable row level security;
create trigger idea_content_links_set_updated_at before update on public.idea_content_links
  for each row execute function private.set_updated_at();

create function private.idea_content_links_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_idea record;
  v_content record;
  v_becoming boolean;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.idea_id <> old.idea_id or new.shortcode <> old.shortcode then
      raise exception 'idea_content_links: fikir, çalışma alanı ve shortcode sonradan değişmez' using errcode = '23514';
    end if;
  end if;

  -- Fikir aynı çalışma alanında olmalı (bileşik FK'dan önce temiz hata; onay anında satırı kilitler).
  select i.status, i.platform into v_idea
    from public.ideas i where i.id = new.idea_id and i.workspace_id = new.workspace_id for update;
  if not found then
    raise exception 'idea_content_links: fikir bu çalışma alanında yok' using errcode = '23503', constraint = 'idea_content_links_idea_fkey';
  end if;

  if new.content_item_id is not null then
    select c.social_account_id, c.platform, c.shortcode into v_content
      from public.content_items c where c.id = new.content_item_id and c.workspace_id = new.workspace_id;
    if not found then
      raise exception 'idea_content_links: içerik bu çalışma alanında yok' using errcode = '23503', constraint = 'idea_content_links_content_fkey';
    end if;
    if v_content.social_account_id is null then
      raise exception 'idea_content_links: yalnız kendi hesabın içeriğine bağlanabilir (rakip içeriği olamaz)' using errcode = '23514';
    end if;
    if v_content.shortcode is distinct from new.shortcode then
      raise exception 'idea_content_links: shortcode içeriğin shortcode''uyla aynı olmalı' using errcode = '23514';
    end if;
    if v_content.platform <> v_idea.platform then
      raise exception 'idea_content_links: fikir ve içerik aynı platformda olmalı' using errcode = '23514';
    end if;
  end if;

  if new.status = 'confirmed' then
    -- Yeni onay (INSERT ya da başka durumdan geçiş); zaten onaylı satırın başka alanı güncellenirse prev_idea_status korunur.
    v_becoming := true;
    if tg_op = 'UPDATE' then
      v_becoming := old.status <> 'confirmed';
    end if;
    if v_becoming then
      if v_idea.status = 'dismissed' then
        raise exception 'idea_content_links: reddedilmiş fikre Reels bağlanamaz' using errcode = '23514';
      end if;
      new.prev_idea_status := v_idea.status;
    end if;
  else
    new.prev_idea_status := null;
  end if;
  return new;
end;
$$;
revoke all on function private.idea_content_links_guard() from public, anon, authenticated;
create trigger idea_content_links_guard before insert or update on public.idea_content_links
  for each row execute function private.idea_content_links_guard();

create function private.idea_content_links_sync_idea()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- NEW yalnız INSERT/UPDATE'te, OLD yalnız UPDATE/DELETE'te atanmıştır: erişim dala göre ayrılır.
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' then
      update public.ideas set status = 'published'
       where id = new.idea_id and workspace_id = new.workspace_id and status <> 'published';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'confirmed' and old.status <> 'confirmed' then
      update public.ideas set status = 'published'
       where id = new.idea_id and workspace_id = new.workspace_id and status <> 'published';
    elsif old.status = 'confirmed' and new.status <> 'confirmed' then
      -- Fikir hâlâ bu bağın yayınladığı durumdaysa eski durumuna döner (başka yoldan değiştiyse dokunulmaz).
      update public.ideas set status = old.prev_idea_status
       where id = old.idea_id and workspace_id = old.workspace_id and status = 'published' and old.prev_idea_status <> 'published';
    end if;
  elsif old.status = 'confirmed' then
    update public.ideas set status = old.prev_idea_status
     where id = old.idea_id and workspace_id = old.workspace_id and status = 'published' and old.prev_idea_status <> 'published';
  end if;
  return null;
end;
$$;
revoke all on function private.idea_content_links_sync_idea() from public, anon, authenticated;
create trigger idea_content_links_sync_idea after insert or update or delete on public.idea_content_links
  for each row execute function private.idea_content_links_sync_idea();

-- 0006/0007 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.idea_content_links to service_role;
grant select on public.idea_content_links to authenticated;
create policy "idea_content_links: üye okur" on public.idea_content_links
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));

-- ── Bildirimler: yeni türler + tekrarsızlık anahtarı ───────
-- measurement_due: bir Reels'in D+1/3/7 ölçümü geldi · idea_link_suggested: otomatik eşleşme önerisi var.
-- dedupe_key (NULL = tekilleştirme yok): aynı olay ikinci kez bildirim üretmesin (ör. 'measurement_due:<içerik>:d7').
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('competitor_outlier', 'own_outlier', 'weekly_digest', 'system', 'measurement_due', 'idea_link_suggested'));
alter table public.notifications
  add column dedupe_key text constraint notifications_dedupe_key_check check (dedupe_key is null or char_length(btrim(dedupe_key)) between 1 and 200);
create unique index notifications_dedupe_key on public.notifications (workspace_id, dedupe_key) where dedupe_key is not null;

-- ── Koşular: amaç ──────────────────────────────────────────
-- purpose = 'measurement': ölçüm koşusu (aylık ölçüm tavanı yalnız bunları sayar). NULL = normal toplama/LLM işi.
alter table public.collection_runs
  add column purpose text constraint collection_runs_purpose_check check (purpose is null or purpose in ('measurement'));
comment on column public.collection_runs.purpose is 'measurement = ölçüm koşusu (ölçüm tavanına sayılır). NULL = normal iş.';
create index collection_runs_purpose_idx on public.collection_runs (workspace_id, started_at desc) where purpose is not null;

-- ── Workspace: aylık ölçüm tavanı ──────────────────────────
-- NULL = ONAYSIZ: kullanıcı onaylayana kadar ölçüm harcaması yapılamaz (tek seferlik --max-usd ayrı yoldur). Tavan ve onay
-- zamanı birlikte yazılır (çift). Genel Apify aylık tavanı (reserve_budget) bunun üstünde aynen geçerlidir.
alter table public.workspaces
  add column measure_monthly_cap_usd numeric(12, 6) constraint workspaces_measure_cap_range check (measure_monthly_cap_usd between 0 and 1000),
  add column measure_cap_approved_at timestamptz,
  add constraint workspaces_measure_cap_approved check ((measure_monthly_cap_usd is null) = (measure_cap_approved_at is null));
comment on column public.workspaces.measure_monthly_cap_usd is 'NULL = ölçüm tavanı onaysız (ölçüm harcaması yok). 0 = ölçüm kapalı.';

-- ── Bütçe rezervasyonu: purpose anahtarı ───────────────────
-- 0007'deki reserve_budget ile AYNI imza ve tavan kuralları; tek fark p_run.purpose ('measurement' | yok). Ölçüm tavanı
-- uygulama katmanında (measure:now) denetlenir; burada yalnız koşu işaretlenir ki tavan hesabı ve maliyet ekranı ayırt edebilsin.
create or replace function public.reserve_budget(
  p_ws uuid,
  p_provider text,
  p_amount numeric,
  p_run jsonb default '{}'::jsonb
)
returns public.collection_runs
language plpgsql
set search_path = ''
as $$
declare
  v_providers text[];
  v_cap numeric;
  v_tz text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_committed numeric := 0;
  v_billing text;
  v_purpose text;
  v_run public.collection_runs;
begin
  if p_ws is null or p_provider is null or p_amount is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if p_amount < 0 or p_amount = 'NaN'::numeric or p_amount = 'Infinity'::numeric then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'invalid_argument' using errcode = '22023', detail = 'p_run bir JSON nesnesi olmalı';
  end if;
  if nullif(btrim(p_run ->> 'kind'), '') is null then
    raise exception 'run_kind_required' using errcode = '22023';
  end if;
  v_billing := coalesce(nullif(btrim(p_run ->> 'billing'), ''), 'metered');
  if v_billing not in ('metered', 'subscription') then
    raise exception 'invalid_billing' using errcode = '22023', detail = v_billing;
  end if;
  v_purpose := nullif(btrim(p_run ->> 'purpose'), '');
  if v_purpose is not null and v_purpose <> 'measurement' then
    raise exception 'invalid_purpose' using errcode = '22023', detail = v_purpose;
  end if;

  if p_provider not in ('apify', 'anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli', 'graph_api') then
    raise exception 'unknown_provider' using errcode = '22023', detail = p_provider;
  end if;
  -- Aynı tavanı paylaşan sağlayıcılar (NULL = tavansız: graph_api).
  v_providers := case
    when p_provider = 'apify' then array['apify']
    when p_provider <> 'graph_api' then array['anthropic', 'openai', 'deepgram', 'gemini', 'claude_cli']
  end;

  if v_providers is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('reserve_budget:' || p_ws::text || ':' || v_providers[1], 0)
    );
  end if;

  select w.timezone,
         case when p_provider = 'apify' then w.apify_monthly_cap_usd else w.llm_monthly_cap_usd end
    into v_tz, v_cap
    from public.workspaces w
   where w.id = p_ws;
  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  if v_providers is not null then
    v_month_start := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
    v_month_end := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

    select coalesce(sum(greatest(coalesce(r.actual_usd, 0), r.reserved_usd)), 0)
      into v_committed
      from public.collection_runs r
     where r.workspace_id = p_ws
       and r.provider = any (v_providers)
       and r.started_at >= v_month_start
       and r.started_at < v_month_end;

    if p_amount > 0 and v_committed + p_amount > v_cap then
      raise exception 'budget_exceeded'
        using detail = format('cap=%s committed=%s requested=%s', v_cap, v_committed, p_amount),
              hint = 'Aylık tavanı Ayarlar ekranından artır ya da ay başını bekle.';
    end if;
  end if;

  insert into public.collection_runs (
    workspace_id, provider, kind, status, target_label, external_run_id, dataset_id,
    reserved_usd, price_unknown, expected_results, billing, purpose
  )
  values (
    p_ws, p_provider, btrim(p_run ->> 'kind'), 'reserved', p_run ->> 'target_label',
    p_run ->> 'external_run_id', p_run ->> 'dataset_id',
    p_amount, coalesce((p_run ->> 'price_unknown')::boolean, false), (p_run ->> 'expected_results')::integer,
    v_billing, v_purpose
  )
  returning * into v_run;

  return v_run;
end;
$$;
revoke all on function public.reserve_budget(uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_budget(uuid, text, numeric, jsonb) to service_role;
