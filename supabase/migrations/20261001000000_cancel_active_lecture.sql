-- Cancellation can be requested after a worker claims the job. The worker
-- observes the cancelled status, stops its current stage, and removes media.
drop function public.cancel_queued_lecture(uuid);

alter table public.lectures drop constraint if exists lectures_status_check;
alter table public.lectures add constraint lectures_status_check
  check (status in ('uploaded', 'normalizing', 'transcribing', 'ready', 'failed', 'cancelled'));

alter table public.transcription_jobs drop constraint if exists transcription_jobs_status_check;
alter table public.transcription_jobs add constraint transcription_jobs_status_check
  check (status in ('pending', 'processing', 'complete', 'failed', 'cancelled'));

create or replace function public.cancel_lecture(target_lecture uuid)
returns table (lecture_id uuid, class_id uuid, source_format text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_row record;
begin
  select l.id, l.class_id, l.source_format
    into cancelled_row
    from public.lectures as l
    join public.transcription_jobs as j on j.lecture_id = l.id
   where l.id = target_lecture
     and l.status in ('uploaded', 'normalizing', 'transcribing')
     and j.status in ('pending', 'processing')
     and exists (
       select 1 from public.class_members as m
        where m.class_id = l.class_id
          and m.user_id = (select auth.uid())
          and m.role = 'lecturer'
     )
   for update of l, j;

  if not found then
    return;
  end if;

  update public.transcription_jobs as j
     set status = 'cancelled', error = null
   where j.lecture_id = cancelled_row.id;
  update public.lectures as l
     set status = 'cancelled', error_message = null
   where l.id = cancelled_row.id;

  return query
    select cancelled_row.id, cancelled_row.class_id, cancelled_row.source_format;
end;
$$;

-- Completion and cancellation lock the same lecture/job pair so one wins
-- atomically; a worker cannot mark a cancelled job ready afterward.
create or replace function public.complete_transcription_job(target_lecture uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_job boolean;
begin
  perform 1
    from public.lectures as l
    join public.transcription_jobs as j on j.lecture_id = l.id
   where l.id = target_lecture
     and l.status in ('uploaded', 'normalizing', 'transcribing')
     and j.status = 'processing'
   for update of l, j;
  found_job := found;
  if not found_job then
    return false;
  end if;

  update public.lectures as l
     set status = 'ready', error_message = null
   where l.id = target_lecture;
  update public.transcription_jobs as j
     set status = 'complete', error = null
   where j.lecture_id = target_lecture;
  return true;
end;
$$;

-- A queued job has no worker to finish its cleanup, so the authenticated
-- lecturer can finalize it after the app removes its local files.
create or replace function public.finalize_cancelled_lecture(target_lecture uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.lectures as l
   where l.id = target_lecture
     and l.status = 'cancelled'
     and exists (
       select 1 from public.transcription_jobs as j
        where j.lecture_id = l.id and j.status = 'cancelled'
     )
     and exists (
       select 1 from public.class_members as m
        where m.class_id = l.class_id
          and m.user_id = (select auth.uid())
          and m.role = 'lecturer'
     );
  return found;
end;
$$;

revoke all on function public.cancel_lecture(uuid) from public;
revoke all on function public.finalize_cancelled_lecture(uuid) from public;
revoke all on function public.complete_transcription_job(uuid) from public;
grant execute on function public.cancel_lecture(uuid) to authenticated;
grant execute on function public.finalize_cancelled_lecture(uuid) to authenticated;
grant execute on function public.complete_transcription_job(uuid) to service_role;
