-- A lecturer may remove one uploaded lecture only while its job is still
-- pending. Locking the job row serializes cancellation with worker claims.
create or replace function public.cancel_queued_lecture(target_lecture uuid)
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
     and l.status = 'uploaded'
     and j.status = 'pending'
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

  delete from public.lectures as l
   where l.id = cancelled_row.id;

  return query
    select cancelled_row.id, cancelled_row.class_id, cancelled_row.source_format;
end;
$$;

revoke all on function public.cancel_queued_lecture(uuid) from public;
grant execute on function public.cancel_queued_lecture(uuid) to authenticated;
