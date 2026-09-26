-- Lecture-wide and class-wide questions share one private Q&A table.
create table public.scope_ai_questions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  lecture_id uuid references public.lectures(id) on delete cascade,
  scope text not null check (scope in ('lecture', 'class')),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 1200),
  answer text not null check (char_length(btrim(answer)) between 1 and 2700),
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) between 1 and 8),
  created_at timestamptz not null default now(),
  constraint scope_ai_questions_target_check check (
    (scope = 'class' and lecture_id is null) or (scope = 'lecture' and lecture_id is not null)
  )
);

create index scope_ai_questions_class_idx
  on public.scope_ai_questions (class_id, created_at desc) where scope = 'class';
create index scope_ai_questions_lecture_idx
  on public.scope_ai_questions (lecture_id, created_at desc) where scope = 'lecture';

alter table public.scope_ai_questions enable row level security;
revoke all on public.scope_ai_questions from anon, authenticated;
grant select on public.scope_ai_questions to authenticated;
create policy "Authors read their scope AI questions" on public.scope_ai_questions
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.create_scope_ai_question(
  target_class uuid,
  target_lecture uuid,
  target_scope text,
  student_question text,
  ai_answer text,
  answer_sources jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_question uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not (select public.is_class_member(target_class)) then
    raise exception 'Class membership required' using errcode = '42501';
  end if;
  if target_scope not in ('lecture', 'class')
     or (target_scope = 'class' and target_lecture is not null)
     or (target_scope = 'lecture' and (target_lecture is null or not exists (
       select 1 from public.lectures l where l.id = target_lecture and l.class_id = target_class and l.status = 'ready'
     )))
     or char_length(btrim(coalesce(student_question, ''))) not between 1 and 1200
     or char_length(btrim(coalesce(ai_answer, ''))) not between 1 and 2700
     or jsonb_typeof(answer_sources) <> 'array'
     or jsonb_array_length(answer_sources) not between 1 and 8 then
    raise exception 'The question, answer, or sources are not valid.' using errcode = '22023';
  end if;

  -- Every returned citation must point to a ready lecture in the same class.
  if exists (
    select 1
    from jsonb_array_elements(answer_sources) source
    where jsonb_typeof(source) <> 'object'
       or coalesce(source->>'lecture_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(source->>'start_ms', '') !~ '^[0-9]{1,9}$'
       or coalesce(source->>'end_ms', '') !~ '^[0-9]{1,9}$'
       or char_length(coalesce(source->>'title', '')) not between 1 and 120
       or char_length(coalesce(source->>'text', '')) not between 1 and 600
       or not exists (
         select 1 from public.lectures l
         where l.id = (source->>'lecture_id')::uuid and l.class_id = target_class and l.status = 'ready'
       )
  ) then
    raise exception 'One or more transcript sources are not valid.' using errcode = '22023';
  end if;

  insert into public.scope_ai_questions (class_id, lecture_id, scope, user_id, question, answer, sources)
  values (target_class, target_lecture, target_scope, caller, btrim(student_question), btrim(ai_answer), answer_sources)
  returning id into new_question;
  return new_question;
end;
$$;

revoke all on function public.create_scope_ai_question(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.create_scope_ai_question(uuid, uuid, text, text, text, jsonb) to authenticated;
