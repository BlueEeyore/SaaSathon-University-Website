-- Qualify attempts in the PL/pgSQL function because it is also an output field.
create or replace function public.claim_transcription_job()
returns table (lecture_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transcription_jobs as tj
     set status = 'failed', error = 'Worker stopped before finishing.', updated_at = now()
   where tj.status = 'processing'
     and tj.claimed_at < now() - interval '30 minutes'
     and tj.attempts >= 3;

  update public.lectures as l
     set status = 'failed', error_message = 'Worker stopped before finishing.', updated_at = now()
    where exists (
      select 1 from public.transcription_jobs as j
       where j.lecture_id = l.id and j.status = 'failed'
         and j.error = 'Worker stopped before finishing.'
    );

  return query
  with next_job as (
    select j.lecture_id
      from public.transcription_jobs as j
     where j.attempts < 3
       and (j.status = 'pending' or
            (j.status = 'processing' and j.claimed_at < now() - interval '30 minutes'))
     order by j.created_at
     for update skip locked
     limit 1
  )
  update public.transcription_jobs as j
     set status = 'processing', attempts = j.attempts + 1,
         claimed_at = now(), error = null, updated_at = now()
    from next_job as n
   where j.lecture_id = n.lecture_id
  returning j.lecture_id, j.attempts;
end;
$$;
