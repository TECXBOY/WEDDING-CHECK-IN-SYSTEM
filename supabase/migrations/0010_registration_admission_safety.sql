create or replace function public.lookup_household_registration(p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.normalize_registration_name(p_full_name);
  v_phone text := public.normalize_registration_phone(p_phone);
  v_candidates jsonb := '[]'::jsonb;
  v_guest public.guests;
  v_registered_count bigint;
begin
  if pg_catalog.length(coalesce(v_name, '')) < 2 or coalesce(v_phone, '') = '' then
    return pg_catalog.jsonb_build_object('status', 'pending', 'reason', 'insufficient_match_data');
  end if;

  for v_guest in
    select g.*
      from public.guests g
     where g.is_active
       and public.normalize_registration_phone(coalesce(g.normalized_phone, g.phone_number)) = v_phone
       and (
         public.normalize_registration_name(g.full_name) = v_name
         or public.normalize_registration_name(coalesce(g.household_name, '')) = v_name
       )
     order by g.full_name
  loop
    select count(*) into v_registered_count
      from public.household_registrations r
      join public.registered_attendees a on a.registration_id = r.id
     where r.guest_id = v_guest.id;

    v_candidates := v_candidates || pg_catalog.jsonb_build_object(
      'guest_id', v_guest.id,
      'full_name', v_guest.full_name,
      'household_name', v_guest.household_name,
      'invited_count', v_guest.invited_count,
      'checked_in_count', v_guest.checked_in_count,
      'phone_number', coalesce(v_guest.phone_number, v_guest.normalized_phone, v_phone),
      'registered_count', v_registered_count,
      'is_registered', v_registered_count > 0
    );
  end loop;

  if pg_catalog.jsonb_array_length(v_candidates) = 1 then
    return pg_catalog.jsonb_build_object('status', 'matched', 'guest', v_candidates->0);
  elsif pg_catalog.jsonb_array_length(v_candidates) > 1 then
    return pg_catalog.jsonb_build_object('status', 'ambiguous', 'candidates', v_candidates);
  end if;

  return pg_catalog.jsonb_build_object('status', 'pending');
end;
$$;

create or replace function public.register_household_match(
  p_full_name text,
  p_phone text,
  p_names jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match jsonb;
  v_guest_id uuid;
  v_guest public.guests;
  v_registration public.household_registrations;
  v_name text;
  v_attendee_id uuid;
  v_token text;
  v_passes jsonb := '[]'::jsonb;
  v_unique_names text[];
  v_name_count integer;
begin
  if p_full_name is null or pg_catalog.btrim(p_full_name) = ''
     or coalesce(public.normalize_registration_phone(p_phone), '') = '' then
    raise exception 'Full name and a valid phone number are required.' using errcode = '22023';
  end if;
  if p_names is null or pg_catalog.jsonb_typeof(p_names) <> 'array'
     or pg_catalog.jsonb_array_length(p_names) < 1 then
    raise exception 'At least one attendee name is required.' using errcode = '22023';
  end if;

  select public.lookup_household_registration(p_full_name, p_phone) into v_match;
  if coalesce(v_match->>'status', '') <> 'matched' then
    raise exception 'No approved household match was found for this name and phone number.' using errcode = 'P0002';
  end if;

  v_guest_id := (v_match->'guest'->>'guest_id')::uuid;
  select * into v_guest
    from public.guests
   where id = v_guest_id and is_active
   for update;
  if not found then
    raise exception 'Approved household no longer exists.' using errcode = 'P0002';
  end if;

  select * into v_registration
    from public.household_registrations
   where guest_id = v_guest.id
   for update;

  if found and exists (
    select 1
      from public.registered_attendees a
     where a.registration_id = v_registration.id
  ) then
    raise exception 'This household has already registered. No duplicate admission passes were created.' using errcode = '23505';
  end if;

  select array_agg(distinct pg_catalog.lower(pg_catalog.btrim(value #>> '{}')))
    into v_unique_names
    from pg_catalog.jsonb_array_elements(p_names) as value
   where pg_catalog.jsonb_typeof(value) = 'string'
     and pg_catalog.char_length(pg_catalog.btrim(value #>> '{}')) between 1 and 200;
  v_name_count := coalesce(pg_catalog.cardinality(v_unique_names), 0);
  if v_name_count <> pg_catalog.jsonb_array_length(p_names) then
    raise exception 'Attendee names must be non-empty, unique strings of 200 characters or fewer.' using errcode = '22023';
  end if;

  if v_name_count > (v_guest.invited_count - v_guest.checked_in_count) then
    raise exception 'Registration exceeds the remaining household capacity.' using errcode = 'P0001';
  end if;

  if v_registration.id is null then
    insert into public.household_registrations (guest_id, registered_at, needs_admin_review)
    values (v_guest.id, now(), false)
    returning * into v_registration;
  else
    update public.household_registrations
       set registered_at = now(), needs_admin_review = false
     where id = v_registration.id;
  end if;

  for v_name in
    select pg_catalog.btrim(value #>> '{}')
      from pg_catalog.jsonb_array_elements(p_names) as value
  loop
    insert into public.registered_attendees (registration_id, full_name)
    values (v_registration.id, v_name)
    returning id into v_attendee_id;

    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.admission_passes (attendee_id, token_hash)
    values (
      v_attendee_id,
      extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256')
    );

    v_passes := v_passes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'attendee_id', v_attendee_id,
        'full_name', v_name,
        'token', v_token
      )
    );
  end loop;

  insert into public.registration_history (registration_id, event_type, details)
  values (
    v_registration.id,
    'self_registration_approved',
    pg_catalog.jsonb_build_object('matched_by', 'name_phone', 'attendee_count', v_name_count)
  );

  return v_passes;
end;
$$;

revoke all on function public.lookup_household_registration(text, text) from public, anon, authenticated;
revoke all on function public.register_household_match(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.lookup_household_registration(text, text) to anon, authenticated;
grant execute on function public.register_household_match(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
