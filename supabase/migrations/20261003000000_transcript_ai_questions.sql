-- AI questions and answers are stored independently from comment threads.
create table public.transcript_ai_questions (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  highlight_id uuid not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 1200),
  answer text not null check (char_length(btrim(answer)) between 1 and 2700),
  created_at timestamptz not null default now(),
  foreign key (highlight_id, lecture_id)
    references public.transcript_highlights(id, lecture_id) on delete cascade
);
create index transcript_ai_questions_lecture_idx
  on public.transcript_ai_questions (lecture_id, created_at desc);
create index transcript_ai_questions_highlight_idx
  on public.transcript_ai_questions (highlight_id, created_at desc);

alter table public.transcript_ai_questions enable row level security;
revoke all on public.transcript_ai_questions from anon, authenticated;
grant select on public.transcript_ai_questions to authenticated;
create policy "Class members read transcript AI questions" on public.transcript_ai_questions
  for select to authenticated using ((select public.is_lecture_member(lecture_id)));

create or replace function public.create_transcript_ai_question(
  target_lecture uuid,
  selection_start_ms integer,
  selection_end_ms integer,
  selection_quote text,
  student_question text,
  ai_answer text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_highlight uuid;
  new_question uuid;
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
     or char_length(btrim(coalesce(student_question, ''))) not between 1 and 1200
     or char_length(btrim(coalesce(ai_answer, ''))) not between 1 and 2700 then
    raise exception 'The selected passage, question, or answer is not valid.' using errcode = '22023';
  end if;

  insert into public.transcript_highlights (lecture_id, user_id, start_ms, end_ms, quote)
  values (target_lecture, caller, selection_start_ms, selection_end_ms, btrim(selection_quote))
  returning id into new_highlight;
  insert into public.transcript_ai_questions (
    lecture_id, highlight_id, user_id, question, answer
  ) values (
    target_lecture, new_highlight, caller, btrim(student_question), btrim(ai_answer)
  ) returning id into new_question;
  return new_question;
end;
$$;

revoke all on function public.create_transcript_ai_question(uuid, integer, integer, text, text, text) from public;
grant execute on function public.create_transcript_ai_question(uuid, integer, integer, text, text, text) to authenticated;
