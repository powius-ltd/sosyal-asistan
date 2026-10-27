-- panel — 0022: başlangıç akışı cilası (bitiş bildirimi + yanlış açılan hesabı kaldırma).
-- Şema ↔ domain: src/lib/domain/notification.ts (`NOTIFICATION_KINDS`), src/lib/domain/onboarding-finish.ts (bitiş türleri, `dedupe_key`),
-- src/lib/data/supabase/onboarding.ts (`discardOnboardingWorkspace`).
-- YALNIZ EKLEMELİ: bir CHECK listesinin GENİŞLETİLMESİ (mevcut satırların hepsi yeni kuralı da sağlar) ve bir yeni işlev. Mevcut satırlara
-- dokunmaz, sütun düşürmez. Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- ── Tasarım ────────────────────────────────────────────────
-- 1) BİLDİRİM TÜRÜ `onboarding`: başlangıç işi (hesaba bakış / ilk inceleme) bitince işçi çalışma alanına TEK bildirim yazar. Aynı iş için bir
--    kez: `dedupe_key = 'onboarding:<iş kimliği>'` (0010'daki `notifications (workspace_id, dedupe_key)` kısmi benzersiz indeksi). Yeni tür
--    gerekti çünkü `system` türünün satırında tıklanacak bağlantı yoktur; `onboarding` türü `/baslangic`'a bağlanır.
-- 2) YANLIŞ AÇILAN HESABI KALDIRMA: "bu ben değilim" / "başka hesap dene" deyince eski çalışma alanı geride kalmasın. GÜVENLİ KURAL (DB tutar):
--    yalnız (a) çağıran kullanıcı sahibiyse, (b) hesap henüz ONAYLANMAMIŞSA (`account_confirmed_at` boş), (c) içinde ilk tur (`build`) hiç
--    açılmamışsa, (d) etkin iş yoksa, (e) hesaba bakıştan başka iş (haftalık tur, toplama, ölçüm…) hiç koşmamışsa, (f) aday dışı rakip (izlenen,
--    gizli…), video incelemesi, plan, fikir ya da yayın işi yoksa ve (g) tek kendi hesap varsa kaldırılır. Biri bile tutmazsa `workspace_not_discardable` (23514) ve HİÇBİR ŞEY silinmez: gerçek veri
--    taşıyan çalışma alanı bu yoldan silinmez. Silme çalışma alanına bağlı kayıtları zincirleme götürür (rakip adayları, ilk bakışın topladığı
--    videolar, koşu defteri); kredi defteri satırları kalır (çalışma alanı bağı kopar, tutar değişmez).

-- ── Bildirimler: yeni tür ──────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('competitor_outlier', 'own_outlier', 'weekly_digest', 'system', 'measurement_due', 'idea_link_suggested', 'onboarding'));

-- ── Onaylanmamış çalışma alanını kaldır ────────────────────
create function public.discard_unconfirmed_workspace(p_user uuid, p_ws uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_reason text;
begin
  if p_user is null or p_ws is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  -- Sahibin çalışma alanı satırı kilitlenir: kaldırma ile yeni iş isteği (request_panel_job) yarışmasın.
  perform 1
    from public.workspaces w
   where w.id = p_ws
     and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = p_user and m.role = 'owner')
     for update;
  if not found then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  select case
      when (select w.account_confirmed_at from public.workspaces w where w.id = p_ws) is not null then 'confirmed'
      when exists (select 1 from public.panel_jobs j where j.workspace_id = p_ws and j.kind = 'onboarding' and j.params ->> 'phase' = 'build') then 'build_started'
      when exists (select 1 from public.panel_jobs j where j.workspace_id = p_ws and j.status in ('queued', 'running')) then 'job_active'
      when exists (select 1 from public.panel_jobs j where j.workspace_id = p_ws and not (j.kind = 'onboarding' and j.params ->> 'phase' = 'probe')) then 'other_jobs'
      when exists (select 1 from public.competitors c where c.workspace_id = p_ws and c.status <> 'candidate') then 'has_rivals'
      when exists (select 1 from public.content_analyses a where a.workspace_id = p_ws) then 'has_analyses'
      when exists (select 1 from public.weekly_plans p where p.workspace_id = p_ws) then 'has_plan'
      when exists (select 1 from public.ideas i where i.workspace_id = p_ws) then 'has_ideas'
      when exists (select 1 from public.publish_jobs pj where pj.workspace_id = p_ws) then 'has_publish'
      when (select count(*) from public.social_accounts sa where sa.workspace_id = p_ws) > 1 then 'many_accounts'
      else null
    end
    into v_reason;
  if v_reason is not null then
    raise exception 'workspace_not_discardable' using errcode = '23514',
      detail = format('reason=%s', v_reason),
      hint = 'Yalnız onaylanmamış, ilk turu açılmamış, gerçek veri taşımayan çalışma alanı kaldırılabilir.';
  end if;

  delete from public.workspaces where id = p_ws;
end;
$$;
revoke all on function public.discard_unconfirmed_workspace(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discard_unconfirmed_workspace(uuid, uuid) to service_role;
comment on function public.discard_unconfirmed_workspace(uuid, uuid)
  is 'Başlangıçta yanlış açılan (onaylanmamış, ilk turu açılmamış, gerçek veri taşımayan) çalışma alanını kaldırır; aksi workspace_not_discardable. Yalnız service role.';
