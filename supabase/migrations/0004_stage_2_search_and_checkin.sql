-- Stage 2: bounded guest search and authoritative check-in results.
-- Keep the existing RPC signatures available for compatibility.

create or replace function public.get_attendance_stats()
returns table (expected bigint, checked_in bigint, remaining bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('usher', 'admin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(g.invited_count), 0)::bigint,
    coalesce(sum(g.checked_in_count), 0)::bigint,
    coalesce(sum(g.invited_count - g.checked_in_count), 0)::bigint
  from public.guests g
  where g.is_active;
end;
$$;

create or replace function public.check_in_guest(p_guest_id uuid, p_people integer)
returns public.guests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.guests;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('usher', 'admin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_people is null or p_people < 1 then
    raise exception 'Number of people must be at least 1' using errcode = '22023';
  end if;

  select g.*
  into v_guest
  from public.guests g
  where g.id = p_guest_id
    and g.is_active
  for update;

  if not found then
    raise exception 'Guest not found or no longer active' using errcode = 'P0002';
  end if;

  if v_guest.checked_in_count + p_people > v_guest.invited_count then
    raise exception 'Only % of % invited guests remain to check in',
      v_guest.invited_count - v_guest.checked_in_count, v_guest.invited_count
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.checkin_rpc', 'on', true);
  update public.guests g
  set checked_in_count = g.checked_in_count + p_people
  where g.id = p_guest_id
  returning g.* into v_guest;

  insert into public.check_in_logs (guest_id, usher_id, people_admitted)
  values (p_guest_id, auth.uid(), p_people);

  return v_guest;
end;
$$;

create or replace function public.search_guests(p_query text, p_limit integer default 20)
returns table (
  guest_id uuid,
  full_name text,
  household_name text,
  invited_count integer,
  checked_in_count integer,
  last_checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('usher', 'admin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if v_query = '' then
    return;
  end if;

  return query
  select
    g.id,
    g.full_name,
    g.household_name,
    g.invited_count,
    g.checked_in_count,
    (
      select max(l.checked_in_at)
      from public.check_in_logs l
      where l.guest_id = g.id
        and l.reversed_at is null
    )
  from public.guests g
  where g.is_active
    and (
      pg_catalog.strpos(pg_catalog.lower(g.full_name), pg_catalog.lower(v_query)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(g.household_name, '')), pg_catalog.lower(v_query)) > 0
    )
  order by pg_catalog.lower(g.full_name), g.id
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke all on function public.get_attendance_stats() from public, anon;
revoke all on function public.check_in_guest(uuid, integer) from public, anon;
revoke all on function public.search_guests(text, integer) from public, anon;
grant execute on function public.get_attendance_stats() to authenticated;
grant execute on function public.check_in_guest(uuid, integer) to authenticated;
grant execute on function public.search_guests(text, integer) to authenticated;

create or replace function public.record_guest_check_in(p_guest_id uuid, p_people integer)
returns table (
  guest_id uuid,
  full_name text,
  household_name text,
  invited_count integer,
  checked_in_count integer,
  remaining_allowance integer,
  people_admitted integer,
  checked_in_at timestamptz,
  expected bigint,
  total_checked_in bigint,
  total_remaining bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.guests;
  v_checked_in_at timestamptz;
  v_expected bigint;
  v_total_checked_in bigint;
  v_total_remaining bigint;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('usher', 'admin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_people is null or p_people < 1 then
    raise exception 'Number of people must be at least 1' using errcode = '22023';
  end if;

  select g.*
  into v_guest
  from public.guests g
  where g.id = p_guest_id
    and g.is_active
  for update;

  if not found then
    raise exception 'Guest not found or no longer active' using errcode = 'P0002';
  end if;

  if v_guest.checked_in_count + p_people > v_guest.invited_count then
    raise exception 'The remaining allowance changed; refresh and try again'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.checkin_rpc', 'on', true);
  update public.guests g
  set checked_in_count = g.checked_in_count + p_people
  where g.id = p_guest_id
  returning g.* into v_guest;

  insert into public.check_in_logs as l (guest_id, usher_id, people_admitted)
  values (p_guest_id, auth.uid(), p_people)
  returning l.checked_in_at into v_checked_in_at;

  select
    coalesce(sum(g.invited_count), 0)::bigint,
    coalesce(sum(g.checked_in_count), 0)::bigint,
    coalesce(sum(g.invited_count - g.checked_in_count), 0)::bigint
  into v_expected, v_total_checked_in, v_total_remaining
  from public.guests g
  where g.is_active;

  return query
  select
    v_guest.id,
    v_guest.full_name,
    v_guest.household_name,
    v_guest.invited_count,
    v_guest.checked_in_count,
    v_guest.invited_count - v_guest.checked_in_count,
    p_people,
    v_checked_in_at,
    v_expected,
    v_total_checked_in,
    v_total_remaining;
end;
$$;

revoke all on function public.record_guest_check_in(uuid, integer) from public, anon;
grant execute on function public.record_guest_check_in(uuid, integer) to authenticated;
