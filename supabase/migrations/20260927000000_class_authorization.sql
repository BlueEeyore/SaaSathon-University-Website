-- Class creation is callable through the public Supabase API, so enforce the
-- allowlisted lecturer role in the database as well as in the application UI.
create or replace function public.create_class(class_title text, class_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_class uuid;
  new_code text := '';
  byte_value integer;
  attempt integer := 0;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select role into caller_role from public.profiles where user_id = caller;
  if caller_role is distinct from 'lecturer' then
    raise exception 'Lecturer access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(class_title, ''))) not between 1 and 120 then
    raise exception 'Give the class a title.' using errcode = '22023';
  end if;
  if char_length(coalesce(class_description, '')) > 2000 then
    raise exception 'Keep the description under 2,001 characters.' using errcode = '22023';
  end if;

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
