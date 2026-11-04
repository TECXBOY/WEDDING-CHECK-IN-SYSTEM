-- 0003_checkin_functions.sql — atomic check-in and attendance statistics

-- Check in N people for a guest/household.
-- Locks the guest row (FOR UPDATE) so two ushers checking in the same household at the
-- same moment are processed one after the other, and the second sees the new count.
create function public.check_in_guest(p_guest_id uuid, p_people integer)
returns public.guests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest public.guests;
begin
  -- 1. Authenticated and authorised staff member
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- 3. Requested number must be a positive integer
  if p_people is null or p_people < 1 then
    raise exception 'Number of people must be at least 1' using errcode = '22023';
  end if;

  -- 2. Guest exists and is active (row lock taken here)
  select * into v_guest from public.guests
  where id = p_guest_id and is_active
  for update;

  if not found then
    raise exception 'Guest not found or no longer active' using errcode = 'P0002';
  end if;

  -- 4. Must not exceed the remaining allowance
  if v_guest.checked_in_count + p_people > v_guest.invited_count then
    raise exception 'Only % of % invited guests remain to check in',
      v_guest.invited_count - v_guest.checked_in_count, v_guest.invited_count
      using errcode = 'P0001';
  end if;

  -- 5. Increment (the guard trigger allows this because of the flag below)
  perform set_config('app.checkin_rpc', 'on', true);
  update public.guests
     set checked_in_count = checked_in_count + p_people
   where id = p_guest_id
   returning * into v_guest;

  -- 6. Log who did it and when
  insert into public.check_in_logs (guest_id, usher_id, people_admitted)
  values (p_guest_id, auth.uid(), p_people);

  -- 7. Return the updated guest
  return v_guest;
end;
$$;

-- Live statistics for active guests (used by the usher and admin dashboards).
create function public.get_attendance_stats()
returns table (expected bigint, checked_in bigint, remaining bigint)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(invited_count), 0)::bigint,
    coalesce(sum(checked_in_count), 0)::bigint,
    coalesce(sum(invited_count - checked_in_count), 0)::bigint
  from public.guests
  where is_active and public.is_staff()
$$;

revoke all on function public.check_in_guest(uuid, integer) from public, anon;
revoke all on function public.get_attendance_stats() from public, anon;
grant execute on function public.check_in_guest(uuid, integer) to authenticated;
grant execute on function public.get_attendance_stats() to authenticated;
