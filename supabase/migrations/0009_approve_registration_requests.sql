alter table public.registration_requests
  drop constraint if exists registration_requests_status_check;

alter table public.registration_requests
  add constraint registration_requests_status_check
  check (status in ('pending', 'approved', 'reviewed'));

alter table public.registration_requests
  add column if not exists guest_id uuid references public.guests(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id);

create or replace function public.admin_approve_registration_request(
  p_request_id uuid,
  p_full_name text,
  p_household_name text,
  p_invited_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.registration_requests;
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_household_name text := nullif(pg_catalog.btrim(coalesce(p_household_name, '')), '');
  v_guest_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_full_name = '' or pg_catalog.char_length(v_full_name) > 200
     or (v_household_name is not null and pg_catalog.char_length(v_household_name) > 200)
     or p_invited_count is null or p_invited_count < 1 then
    raise exception 'Valid guest name and a positive invitation capacity are required.' using errcode = '22023';
  end if;

  select r.* into v_request
    from public.registration_requests r
   where r.id = p_request_id
   for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'Pending registration request not found.' using errcode = 'P0002';
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
    raise exception 'A guest with this name and household already exists. Update that invitation instead.' using errcode = '23505';
  end if;

  insert into public.guests (
    full_name, household_name, invited_count, phone_number, normalized_phone
  )
  values (
    v_full_name, v_household_name, p_invited_count,
    v_request.phone_number, v_request.phone_number
  )
  returning id into v_guest_id;

  update public.registration_requests
     set status = 'approved',
         guest_id = v_guest_id,
         approved_at = now(),
         approved_by = auth.uid(),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = v_request.id;

  return v_guest_id;
end;
$$;

revoke all on function public.admin_approve_registration_request(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_approve_registration_request(uuid, text, text, integer)
  to authenticated;

notify pgrst, 'reload schema';
