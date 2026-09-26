-- Shared transcript highlights and comment threads for class members.
create table public.transcript_highlights (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms > start_ms),
  quote text not null check (char_length(btrim(quote)) between 1 and 600),
  created_at timestamptz not null default now(),
  unique (id, lecture_id)
);
create index transcript_highlights_lecture_idx
  on public.transcript_highlights (lecture_id, start_ms);

create table public.transcript_comments (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  highlight_id uuid,
  parent_id uuid,
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  start_ms integer,
  end_ms integer,
  created_at timestamptz not null default now(),
  unique (id, lecture_id),
  foreign key (highlight_id, lecture_id)
    references public.transcript_highlights(id, lecture_id) on delete cascade,
  foreign key (parent_id, lecture_id)
    references public.transcript_comments(id, lecture_id) on delete cascade,
  check (
    (parent_id is not null and highlight_id is null and start_ms is null and end_ms is null)
    or
    (parent_id is null and (highlight_id is not null or (start_ms is not null and end_ms > start_ms)))
  )
);
create index transcript_comments_thread_idx
  on public.transcript_comments (lecture_id, created_at);
create index transcript_comments_parent_idx
  on public.transcript_comments (parent_id, created_at) where parent_id is not null;

alter table public.transcript_highlights enable row level security;
alter table public.transcript_comments enable row level security;
revoke all on public.transcript_highlights from anon, authenticated;
revoke all on public.transcript_comments from anon, authenticated;
grant select on public.transcript_highlights to authenticated;
grant select, insert on public.transcript_comments to authenticated;

create policy "Class members read transcript highlights" on public.transcript_highlights
  for select to authenticated using ((select public.is_lecture_member(lecture_id)));
create policy "Class members add own transcript highlights" on public.transcript_highlights
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select public.is_lecture_member(lecture_id))
  );
create policy "Class members read transcript comments" on public.transcript_comments
  for select to authenticated using ((select public.is_lecture_member(lecture_id)));
create policy "Class members add own transcript comments" on public.transcript_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and (select public.is_lecture_member(lecture_id))
    and (
      highlight_id is null
      or exists (
        select 1 from public.transcript_highlights h
        where h.id = transcript_comments.highlight_id
          and h.lecture_id = transcript_comments.lecture_id
      )
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.transcript_comments parent
        where parent.id = transcript_comments.parent_id
          and parent.lecture_id = transcript_comments.lecture_id
          and parent.parent_id is null
      )
    )
  );

create or replace function public.create_transcript_thread(
  target_lecture uuid,
  selection_start_ms integer,
  selection_end_ms integer,
  selection_quote text,
  first_comment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_highlight uuid;
  new_comment uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not (select public.is_lecture_member(target_lecture)) then
    raise exception 'Class membership required' using errcode = '42501';
  end if;
  if selection_start_ms < 0 or selection_end_ms <= selection_start_ms
     or selection_end_ms > 86400000
     or char_length(btrim(coalesce(selection_quote, ''))) not between 1 and 600
     or char_length(btrim(coalesce(first_comment, ''))) not between 1 and 4000 then
    raise exception 'The selected passage or comment is not valid.' using errcode = '22023';
  end if;

  insert into public.transcript_highlights (lecture_id, user_id, start_ms, end_ms, quote)
  values (target_lecture, caller, selection_start_ms, selection_end_ms, btrim(selection_quote))
  returning id into new_highlight;
  insert into public.transcript_comments (lecture_id, highlight_id, author_id, body)
  values (target_lecture, new_highlight, caller, btrim(first_comment))
  returning id into new_comment;
  return new_comment;
end;
$$;

revoke all on function public.create_transcript_thread(uuid, integer, integer, text, text) from public;
grant execute on function public.create_transcript_thread(uuid, integer, integer, text, text) to authenticated;
