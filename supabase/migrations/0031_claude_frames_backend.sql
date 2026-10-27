-- Video analizi arka ucu `claude_frames`: ffmpeg kareleri + yerel Whisper konuşma metni → Claude CLI (müşterinin aboneliği).
-- Yalnız content_analyses.backend CHECK'i genişler (EKLEMELİ; veri değişmez). Kısıt adı 0007'de satır içi verildiği için varsayılan ad aranır.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.content_analyses'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%backend%'
    and pg_get_constraintdef(c.oid) ilike '%gemini-api%';
  if v_name is not null then
    execute format('alter table public.content_analyses drop constraint %I', v_name);
  end if;
end $$;

alter table public.content_analyses
  add constraint content_analyses_backend_check
  check (backend is null or backend in ('agy', 'gemini-api', 'claude_frames'));
