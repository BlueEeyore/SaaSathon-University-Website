-- A policy cannot query its own table without triggering recursive RLS.
-- Encapsulate the parent check in a SECURITY DEFINER helper instead.
create or replace function public.is_transcript_thread_root(
  target_comment uuid,
  target_lecture uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.transcript_comments parent
     where parent.id = target_comment
       and parent.lecture_id = target_lecture
       and parent.parent_id is null
  );
$$;

revoke all on function public.is_transcript_thread_root(uuid, uuid) from public;
grant execute on function public.is_transcript_thread_root(uuid, uuid) to authenticated;

drop policy "Class members add own transcript comments" on public.transcript_comments;
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
      or (select public.is_transcript_thread_root(
        transcript_comments.parent_id,
        transcript_comments.lecture_id
      ))
    )
  );
