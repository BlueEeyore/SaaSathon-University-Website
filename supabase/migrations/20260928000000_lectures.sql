-- Lecture uploads and asynchronous transcription.
-- Media stays on the app host. Postgres stores metadata and transcript data only.

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  source_format text not null check (source_format in ('mp4', 'mov', 'webm')),
  source_bytes bigint not null check (source_bytes between 1 and 2147483648),
  duration_ms integer not null check (duration_ms between 1 and 3600000),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'normalizing', 'transcribing', 'ready', 'failed')),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lectures_class_created_idx on public.lectures (class_id, created_at desc);

create table public.transcripts (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  language text not null default 'en',
  provider text not null,
  model text not null,
  text text not null,
  segments jsonb not null check (jsonb_typeof(segments) = 'array'),
  created_at timestamptz not null default now()
);

create table public.transcription_jobs (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  error text check (error is null or char_length(error) <= 1000),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transcription_jobs_pending_idx
  on public.transcription_jobs (created_at)
  where status = 'pending';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger lectures_touch_updated_at before update on public.lectures
  for each row execute function public.touch_updated_at();
create trigger transcription_jobs_touch_updated_at before update on public.transcription_jobs
  for each row execute function public.touch_updated_at();

-- RLS helper for both transcript and media access. The caller identity always
-- comes from auth.uid(), never from a caller-supplied user id.
create or replace function public.is_lecture_member(target_lecture uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.lectures l
      join public.class_members m on m.class_id = l.class_id
     where l.id = target_lecture
       and m.user_id = (select auth.uid())
  );
$$;

-- Called after the upload route has streamed and inspected the complete file.
-- The generated id lets disk paths be derived safely without storing or
-- accepting a user-controlled filesystem path.
create or replace function public.register_lecture_upload(
  upload_id uuid,
  target_class uuid,
  lecture_title text,
  lecture_description text,
  file_format text,
  file_bytes bigint,
  media_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.class_members
     where class_id = target_class and user_id = caller and role = 'lecturer'
  ) then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(lecture_title, ''))) not between 1 and 120 then
    raise exception 'Give the lecture a title.' using errcode = '22023';
  end if;
  if char_length(coalesce(lecture_description, '')) > 2000 then
    raise exception 'Keep the description under 2,001 characters.' using errcode = '22023';
  end if;
  if file_format not in ('mp4', 'mov', 'webm')
     or file_bytes not between 1 and 2147483648
     or media_duration_ms not between 1 and 3600000 then
    raise exception 'The uploaded video is outside the allowed limits.' using errcode = '22023';
  end if;

  insert into public.lectures (
    id, class_id, title, description, source_format, source_bytes, duration_ms
  ) values (
    upload_id, target_class, btrim(lecture_title), coalesce(lecture_description, ''),
    file_format, file_bytes, media_duration_ms
  );
  insert into public.transcription_jobs (lecture_id) values (upload_id);
  return upload_id;
end;
$$;

-- One worker claims one job at a time. SKIP LOCKED makes it safe to add a
-- second worker later; abandoned jobs become claimable after 30 minutes.
create or replace function public.claim_transcription_job()
returns table (lecture_id uuid, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transcription_jobs
     set status = 'failed', error = 'Worker stopped before finishing.', updated_at = now()
   where status = 'processing'
     and claimed_at < now() - interval '30 minutes'
     and attempts >= 3;

  update public.lectures l
     set status = 'failed', error_message = 'Worker stopped before finishing.', updated_at = now()
    where exists (
      select 1 from public.transcription_jobs j
       where j.lecture_id = l.id and j.status = 'failed'
         and j.error = 'Worker stopped before finishing.'
    );

  return query
  with next_job as (
    select j.lecture_id
      from public.transcription_jobs j
     where j.attempts < 3
       and (j.status = 'pending' or
            (j.status = 'processing' and j.claimed_at < now() - interval '30 minutes'))
     order by j.created_at
     for update skip locked
     limit 1
  )
  update public.transcription_jobs j
     set status = 'processing', attempts = j.attempts + 1,
         claimed_at = now(), error = null, updated_at = now()
    from next_job n
   where j.lecture_id = n.lecture_id
  returning j.lecture_id, j.attempts;
end;
$$;

alter table public.lectures enable row level security;
revoke all on public.lectures from anon, authenticated;
grant select on public.lectures to authenticated;
create policy "Class members read lectures" on public.lectures
  for select to authenticated using ((select public.is_class_member(class_id)));

alter table public.transcripts enable row level security;
revoke all on public.transcripts from anon, authenticated;
grant select on public.transcripts to authenticated;
create policy "Class members read transcripts" on public.transcripts
  for select to authenticated using ((select public.is_lecture_member(lecture_id)));

alter table public.transcription_jobs enable row level security;
revoke all on public.transcription_jobs from anon, authenticated;
grant all on public.transcription_jobs to service_role;
grant all on public.lectures to service_role;
grant all on public.transcripts to service_role;

revoke all on function public.is_lecture_member(uuid) from public;
revoke all on function public.register_lecture_upload(uuid, uuid, text, text, text, bigint, integer) from public;
revoke all on function public.claim_transcription_job() from public;
revoke all on function public.touch_updated_at() from public;
grant execute on function public.is_lecture_member(uuid) to authenticated;
grant execute on function public.register_lecture_upload(uuid, uuid, text, text, text, bigint, integer) to authenticated;
grant execute on function public.claim_transcription_job() to service_role;
