-- Identity, roles, classes and enrolment.
--
-- The publishable key is public, so a signed-in user can write to their own row
-- through the API directly. That single fact drives every grant below: role
-- and email are never client-writable, membership is never client-writable, and
-- anything a client is allowed to do is granted per column.
--
-- Class membership is checked from inside policies on other tables, which would
-- recurse if policies queried class_members directly. The is_class_* helpers are
-- SECURITY DEFINER and read the table as its owner, which is the one place that
-- logic lives.

-- --- profiles -------------------------------------------------------------
-- One row per account, created by a trigger so that role can never be chosen by
-- the person signing up. full_name is the only client-writable column.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 80),
  role text not null default 'student' check (role in ('student', 'lecturer')),
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);

-- --- lecturer_allowlist ---------------------------------------------------
-- Intentionally has no grants and no policies: only the service role and the
-- dashboard can read or write it, so a client cannot discover or extend the
-- list of lecturer emails.
create table public.lecturer_allowlist (
  email text primary key check (email = lower(btrim(email))),
  created_at timestamptz not null default now()
);

-- --- classes --------------------------------------------------------------
-- join_code is normalised to upper case on the way in, so a plain unique
-- constraint gives case-insensitive uniqueness. The alphabet omits I, L, O and
-- the digits 0 and 1 so a code survives being read aloud.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  join_code text not null unique
    check (join_code ~ '^[A-HJKMNP-Z2-9]{10}$'),
  lecturer_id uuid not null references public.profiles(user_id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index classes_lecturer_idx on public.classes (lecturer_id, created_at desc);

-- --- class_members --------------------------------------------------------
-- role is per class, not per account. A lecturer who redeems another
-- lecturer's join code becomes a student in that class, which is why this is
-- not a copy of profiles.role.
create table public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'lecturer')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index class_members_user_idx on public.class_members (user_id, joined_at desc);

-- --- class_roster ---------------------------------------------------------
-- Pending enrolment by email, for people who may not have an account yet.
-- class_members.user_id references auth.users, so an unknown email cannot go
-- there. Rows are claimed on first sign-in by claim_roster_memberships().
create table public.class_roster (
  class_id uuid not null references public.classes(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  claimed_at timestamptz,
  claimed_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, email)
);
create index class_roster_email_idx on public.class_roster (email)
  where claimed_at is null;

-- --- helper functions -----------------------------------------------------
-- SECURITY DEFINER so membership checks bypass class_members' own policies,
-- which is what stops the recursion. search_path is pinned empty so these
-- cannot be hijacked by a caller-controlled schema.
create or replace function public.my_profile_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(email)) from public.profiles
   where user_id = (select auth.uid());
$$;

create or replace function public.is_class_member(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members m
     where m.class_id = target_class
       and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_class_lecturer(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members m
     where m.class_id = target_class
       and m.user_id = (select auth.uid())
       and m.role = 'lecturer'
  );
$$;

-- Used by the profiles policy so classmates can see each other's names for
-- comment attribution, without profiles being world-readable.
create or replace function public.shares_class_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.class_members mine
      join public.class_members theirs on theirs.class_id = mine.class_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = target_user
  );
$$;

-- --- enrolment actions ----------------------------------------------------
-- Creating a class is one atomic step: generate a code the client cannot
-- choose, insert the class, and enrol the creator as its lecturer. This is a
-- function rather than a client insert for two reasons. A client-chosen code
-- could squat a code, and PostgREST's INSERT ... RETURNING needs a SELECT
-- policy for the new row, which the creator cannot satisfy until they are a
-- member. Returns the new class id.
create or replace function public.create_class(class_title text, class_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_class uuid;
  new_code text := '';
  byte_value integer;
  attempt integer := 0;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if char_length(btrim(coalesce(class_title, ''))) not between 1 and 120 then
    raise exception 'Give the class a title.' using errcode = '22023';
  end if;
  if char_length(coalesce(class_description, '')) > 2000 then
    raise exception 'Keep the description under 2,001 characters.' using errcode = '22023';
  end if;

  -- One cryptographically random byte per character, rejecting 248..255 so the
  -- 31-character alphabet stays uniform rather than biased by modulo. Ten
  -- characters is ~50 bits, so a collision is unlikely and the loop confirms it.
  -- gen_random_bytes is qualified because search_path is pinned empty; Supabase
  -- installs pgcrypto into the extensions schema on local and hosted projects.
  loop
    new_code := '';
    for i in 1..10 loop
      loop
        byte_value := get_byte(extensions.gen_random_bytes(1), 0);
        exit when byte_value < 248;
      end loop;
      new_code := new_code || substr(alphabet, (byte_value % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = new_code);
    attempt := attempt + 1;
    if attempt > 5 then
      raise exception 'Could not allocate a join code, try again.' using errcode = '40001';
    end if;
  end loop;

  insert into public.classes (title, description, join_code, lecturer_id)
  values (btrim(class_title), coalesce(class_description, ''), new_code, caller)
  returning id into new_class;

  insert into public.class_members (class_id, user_id, role)
  values (new_class, caller, 'lecturer');

  return new_class;
end;
$$;

-- The join code is the capability, so redeeming it is done in one atomic,
-- policy-bypassing statement rather than a client insert that RLS would have to
-- somehow authorise. Returns the class id, or null if the code matched nothing.
create or replace function public.redeem_join_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_class uuid;
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select id into target_class
    from public.classes
   where join_code = upper(btrim(code))
     and archived_at is null
   limit 1;

  if target_class is null then
    return null;
  end if;

  -- Always joins as a student. A lecturer redeeming another class's code is a
  -- student there; redeeming their own code is a no-op.
  insert into public.class_members (class_id, user_id, role)
  values (target_class, caller, 'student')
  on conflict (class_id, user_id) do nothing;

  return target_class;
end;
$$;

-- Turns matching roster rows into memberships. Called after a verified sign-in.
-- Matches on the profile email, which is written once by a trigger from
-- auth.users and is not client-writable, never on anything submitted by the
-- client. Returns how many new memberships were created.
create or replace function public.claim_roster_memberships()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_email text;
  claimed integer := 0;
begin
  if caller is null then
    return 0;
  end if;

  caller_email := public.my_profile_email();
  if caller_email is null then
    return 0;
  end if;

  insert into public.class_members (class_id, user_id, role)
  select r.class_id, caller, 'student'
    from public.class_roster r
    join public.classes c on c.id = r.class_id
   where r.email = caller_email
     and r.claimed_at is null
     and c.archived_at is null
  on conflict (class_id, user_id) do nothing;

  get diagnostics claimed = row_count;

  update public.class_roster r
     set claimed_at = now(),
         claimed_by = caller
   where r.claimed_at is null
     and r.email = caller_email;

  return claimed;
end;
$$;

-- The one path to a lecturer account. The check happens here, against a table
-- the client cannot read, rather than in application code where a caller could
-- simply skip it. Returns whether the account is now a lecturer.
create or replace function public.claim_lecturer_role()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_email text;
begin
  if caller is null then
    return false;
  end if;

  caller_email := public.my_profile_email();
  if caller_email is null then
    return false;
  end if;

  if not exists (
    select 1 from public.lecturer_allowlist
     where email = caller_email
  ) then
    return false;
  end if;

  update public.profiles
     set role = 'lecturer'
   where user_id = caller and role <> 'lecturer';

  return true;
end;
$$;

-- --- new user provisioning ------------------------------------------------
-- Always creates a student. A role in signup metadata is ignored on purpose:
-- metadata is attacker-controlled, and this is the only insert into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    lower(btrim(coalesce(new.email, ''))),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- grants ---------------------------------------------------------------
-- Profiles: readable by self and classmates, writable only for full_name.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Classes: any member may read; only the class lecturer may change it. There is
-- no client insert: create_class() is the only way a class comes into being.
alter table public.classes enable row level security;
revoke all on public.classes from anon, authenticated;
grant select, delete on public.classes to authenticated;
grant update (title, description, archived_at) on public.classes to authenticated;

-- Memberships: readable by members, left by the member. Never inserted or
-- updated by a client; the two enrolment functions above are the only paths in.
alter table public.class_members enable row level security;
revoke all on public.class_members from anon, authenticated;
grant select, delete on public.class_members to authenticated;

-- Roster: managed by the class lecturer. A student may read only the row
-- matching their own address, so claiming works without exposing the roster.
alter table public.class_roster enable row level security;
revoke all on public.class_roster from anon, authenticated;
grant select, insert, delete on public.class_roster to authenticated;

-- Allowlist: no grants, no policies.
alter table public.lecturer_allowlist enable row level security;
revoke all on public.lecturer_allowlist from anon, authenticated;

-- --- policies -------------------------------------------------------------
create policy "Read own or classmate profile" on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.shares_class_with(user_id))
  );

create policy "Update own profile name" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Read classes I belong to" on public.classes
  for select to authenticated
  using ((select public.is_class_member(id)));

create policy "Update own class" on public.classes
  for update to authenticated
  using ((select public.is_class_lecturer(id)))
  with check ((select public.is_class_lecturer(id)));

create policy "Delete own class" on public.classes
  for delete to authenticated
  using ((select public.is_class_lecturer(id)));

create policy "Read memberships of my classes" on public.class_members
  for select to authenticated
  using ((select public.is_class_member(class_id)));

create policy "Leave own class" on public.class_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_class_member(class_id))
  );

create policy "Lecturer manages roster" on public.class_roster
  for select to authenticated
  using (
    (select public.is_class_lecturer(class_id))
    or email = (select public.my_profile_email())
  );

create policy "Lecturer adds to roster" on public.class_roster
  for insert to authenticated
  with check ((select public.is_class_lecturer(class_id)));

create policy "Lecturer removes from roster" on public.class_roster
  for delete to authenticated
  using (
    (select public.is_class_lecturer(class_id))
    or email = (select public.my_profile_email())
  );

-- --- function privileges --------------------------------------------------
-- SECURITY DEFINER functions are executable by PUBLIC unless revoked, which
-- would expose every helper above. Lock them down to signed-in callers only.
revoke all on function public.my_profile_email() from public;
revoke all on function public.is_class_member(uuid) from public;
revoke all on function public.is_class_lecturer(uuid) from public;
revoke all on function public.shares_class_with(uuid) from public;
revoke all on function public.create_class(text, text) from public;
revoke all on function public.redeem_join_code(text) from public;
revoke all on function public.claim_roster_memberships() from public;
revoke all on function public.claim_lecturer_role() from public;
-- Trigger functions are only ever called by the trigger.
revoke all on function public.handle_new_user() from public;

grant execute on function public.my_profile_email() to authenticated;
grant execute on function public.is_class_member(uuid) to authenticated;
grant execute on function public.is_class_lecturer(uuid) to authenticated;
grant execute on function public.shares_class_with(uuid) to authenticated;
grant execute on function public.create_class(text, text) to authenticated;
grant execute on function public.redeem_join_code(text) to authenticated;
grant execute on function public.claim_roster_memberships() to authenticated;
grant execute on function public.claim_lecturer_role() to authenticated;
