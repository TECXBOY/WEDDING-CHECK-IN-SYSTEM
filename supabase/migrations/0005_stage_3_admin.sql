-- Stage 3 administration and reporting. All privileged RPCs independently
-- validate the caller; RLS remains enabled for direct table access.

create index if not exists check_in_logs_guest_time_idx
  on public.check_in_logs (guest_id, checked_in_at desc);

create or replace function public.admin_dashboard_stats()
returns table (
  invited_people bigint,
  checked_in_people bigint,
  remaining_people bigint,
  active_guest_records bigint,
  active_staff_accounts bigint,
  attendance_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(g.invited_count), 0)::bigint,
    coalesce(sum(g.checked_in_count), 0)::bigint,
    coalesce(sum(g.invited_count - g.checked_in_count), 0)::bigint,
    count(g.id)::bigint,
    (select count(*) from public.profiles p where p.is_active)::bigint,
    case
      when coalesce(sum(g.invited_count), 0) = 0 then 0::numeric
      else round(
        coalesce(sum(g.checked_in_count), 0)::numeric * 100
        / sum(g.invited_count)::numeric,
        1
      )
    end
  from public.guests g
  where g.is_active;
end;
$$;

create or replace function public.admin_list_guests(
  p_query text default '',
  p_active text default 'all',
  p_attendance text default 'all',
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  id uuid,
  full_name text,
  household_name text,
  invited_count integer,
  checked_in_count integer,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if coalesce(p_active, '') not in ('all', 'active', 'inactive')
     or coalesce(p_attendance, '') not in ('all', 'none', 'partial', 'complete') then
    raise exception 'Invalid guest filter' using errcode = '22023';
  end if;

  return query
  select
    g.id, g.full_name, g.household_name, g.invited_count, g.checked_in_count,
    g.notes, g.is_active, g.created_at, g.updated_at,
    count(*) over ()::bigint
  from public.guests g
  where (v_query = ''
      or pg_catalog.strpos(pg_catalog.lower(g.full_name), pg_catalog.lower(v_query)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(g.household_name, '')), pg_catalog.lower(v_query)) > 0)
    and (p_active = 'all' or (p_active = 'active' and g.is_active) or (p_active = 'inactive' and not g.is_active))
    and (
      p_attendance = 'all'
      or (p_attendance = 'none' and g.checked_in_count = 0)
      or (p_attendance = 'partial' and g.checked_in_count > 0 and g.checked_in_count < g.invited_count)
      or (p_attendance = 'complete' and g.checked_in_count = g.invited_count)
    )
  order by pg_catalog.lower(g.full_name), g.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.admin_import_guests(p_rows jsonb)
returns table (row_number integer, status text, guest_id uuid, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_full_name text;
  v_household_name text;
  v_notes text;
  v_invited_text text;
  v_invited bigint;
  v_guest_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 500 then
    raise exception 'Import is limited to 500 rows per request' using errcode = '22023';
  end if;

  for v_row in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(p_rows) with ordinality as item(value, ordinality)
  loop
    v_full_name := pg_catalog.btrim(coalesce(v_row.value ->> 'full_name', ''));
    v_household_name := nullif(pg_catalog.btrim(coalesce(v_row.value ->> 'household_name', '')), '');
    v_notes := nullif(pg_catalog.btrim(coalesce(v_row.value ->> 'notes', '')), '');
    v_invited_text := pg_catalog.btrim(coalesce(v_row.value ->> 'invited_count', ''));

    if v_full_name = '' or pg_catalog.char_length(v_full_name) > 200 then
      row_number := v_row.ordinality::integer;
      status := 'invalid';
      guest_id := null;
      message := 'Guest name is required and must be 200 characters or fewer.';
      return next;
      continue;
    end if;
    if v_household_name is not null and pg_catalog.char_length(v_household_name) > 200 then
      row_number := v_row.ordinality::integer;
      status := 'invalid';
      guest_id := null;
      message := 'Household name must be 200 characters or fewer.';
      return next;
      continue;
    end if;
    if v_notes is not null and pg_catalog.char_length(v_notes) > 1000 then
      row_number := v_row.ordinality::integer;
      status := 'invalid';
      guest_id := null;
      message := 'Notes must be 1000 characters or fewer.';
      return next;
      continue;
    end if;
    if v_invited_text !~ '^[1-9][0-9]*$' or pg_catalog.length(v_invited_text) > 10 then
      row_number := v_row.ordinality::integer;
      status := 'invalid';
      guest_id := null;
      message := 'Invited count must be a positive whole number.';
      return next;
      continue;
    end if;
    v_invited := v_invited_text::bigint;
    if v_invited > 2147483647 then
      row_number := v_row.ordinality::integer;
      status := 'invalid';
      guest_id := null;
      message := 'Invited count is too large.';
      return next;
      continue;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.lower(v_full_name) || pg_catalog.chr(31) ||
        pg_catalog.lower(coalesce(v_household_name, '')),
        0
      )
    );

    if exists (
      select 1
      from public.guests g
      where pg_catalog.lower(pg_catalog.btrim(g.full_name)) = pg_catalog.lower(v_full_name)
        and pg_catalog.lower(coalesce(pg_catalog.btrim(g.household_name), '')) =
            pg_catalog.lower(coalesce(v_household_name, ''))
    ) then
      row_number := v_row.ordinality::integer;
      status := 'duplicate';
      guest_id := null;
      message := 'A guest with this name and household already exists; no record was changed.';
      return next;
      continue;
    end if;

    insert into public.guests (full_name, household_name, invited_count, notes)
    values (v_full_name, v_household_name, v_invited::integer, v_notes)
    returning id into v_guest_id;

    row_number := v_row.ordinality::integer;
    status := 'created';
    guest_id := v_guest_id;
    message := 'Guest created.';
    return next;
  end loop;
end;
$$;

create or replace function public.admin_create_guest(
  p_full_name text,
  p_household_name text,
  p_invited_count integer,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_household_name text := nullif(pg_catalog.btrim(coalesce(p_household_name, '')), '');
  v_guest_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_full_name = '' or pg_catalog.char_length(v_full_name) > 200
     or (v_household_name is not null and pg_catalog.char_length(v_household_name) > 200)
     or (p_notes is not null and pg_catalog.char_length(p_notes) > 1000)
     or p_invited_count is null or p_invited_count < 1 then
    raise exception 'Invalid guest details.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.lower(v_full_name) || pg_catalog.chr(31) ||
      pg_catalog.lower(coalesce(v_household_name, '')),
      0
    )
  );
  if exists (
    select 1
    from public.guests g
    where pg_catalog.lower(pg_catalog.btrim(g.full_name)) = pg_catalog.lower(v_full_name)
      and pg_catalog.lower(coalesce(pg_catalog.btrim(g.household_name), '')) =
          pg_catalog.lower(coalesce(v_household_name, ''))
  ) then
    raise exception 'A guest with this name and household already exists.' using errcode = '23505';
  end if;

  insert into public.guests (full_name, household_name, invited_count, notes)
  values (v_full_name, v_household_name, p_invited_count, nullif(pg_catalog.btrim(coalesce(p_notes, '')), ''))
  returning id into v_guest_id;
  return v_guest_id;
end;
$$;

create or replace function public.admin_list_staff(
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  created_at timestamptz,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at,
    count(*) over ()::bigint
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by pg_catalog.lower(p.full_name), p.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.admin_set_staff_active(p_staff_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'Account status is required.' using errcode = '22023';
  end if;
  lock table public.profiles in exclusive mode;
  select p.* into v_caller
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role = 'admin'
  for update;
  if not found then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_staff_id = auth.uid() then
    raise exception 'You cannot change your own account status.' using errcode = '22023';
  end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_staff_id
  for update;
  if not found then
    raise exception 'Staff account not found.' using errcode = 'P0002';
  end if;
  if v_target.is_active and not p_is_active and v_target.role = 'admin'
     and (select count(*) from public.profiles p where p.is_active and p.role = 'admin') <= 1 then
    raise exception 'The only active administrator cannot be disabled.' using errcode = '23514';
  end if;

  update public.profiles p set is_active = p_is_active where p.id = p_staff_id;
end;
$$;

create or replace function public.admin_set_staff_role(p_staff_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  lock table public.profiles in exclusive mode;
  select p.* into v_caller
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role = 'admin'
  for update;
  if not found then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'usher') then
    raise exception 'Role must be admin or usher.' using errcode = '22023';
  end if;
  if p_staff_id = auth.uid() then
    raise exception 'You cannot change your own role.' using errcode = '22023';
  end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_staff_id
  for update;
  if not found then
    raise exception 'Staff account not found.' using errcode = 'P0002';
  end if;
  if v_target.is_active and v_target.role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles p where p.is_active and p.role = 'admin') <= 1 then
    raise exception 'The only active administrator cannot be demoted.' using errcode = '23514';
  end if;

  update public.profiles p set role = p_role where p.id = p_staff_id;
end;
$$;

create or replace function public.admin_list_checkin_history(
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  id uuid,
  guest_id uuid,
  guest_name text,
  household_name text,
  people_admitted integer,
  usher_name text,
  checked_in_at timestamptz,
  reversed_at timestamptz,
  reversed_by_name text,
  total_rows bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select l.id, l.guest_id, g.full_name, g.household_name, l.people_admitted,
    p.full_name, l.checked_in_at, l.reversed_at, rp.full_name, count(*) over ()::bigint
  from public.check_in_logs l
  left join public.guests g on g.id = l.guest_id
  left join public.profiles p on p.id = l.usher_id
  left join public.profiles rp on rp.id = l.reversed_by
  order by l.checked_in_at desc, l.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

-- Role changes and disabling must pass through the serialized functions above.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke all on function public.admin_dashboard_stats() from public, anon;
revoke all on function public.admin_list_guests(text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_import_guests(jsonb) from public, anon;
revoke all on function public.admin_create_guest(text, text, integer, text) from public, anon;
revoke all on function public.admin_list_staff(integer, integer) from public, anon;
revoke all on function public.admin_set_staff_active(uuid, boolean) from public, anon;
revoke all on function public.admin_set_staff_role(uuid, text) from public, anon;
revoke all on function public.admin_list_checkin_history(integer, integer) from public, anon;

grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_guests(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_import_guests(jsonb) to authenticated;
grant execute on function public.admin_create_guest(text, text, integer, text) to authenticated;
grant execute on function public.admin_list_staff(integer, integer) to authenticated;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;
grant execute on function public.admin_list_checkin_history(integer, integer) to authenticated;
