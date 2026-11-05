-- 0007_reference_free_registration.sql
-- Stage 2 registration update: remove the invitation-reference requirement and
-- match guests by normalized full name + normalized phone number against the
-- approved guest list. This remains additive and keeps the legacy code-based
-- flow available for older records.

alter table public.guests
  add column if not exists phone_number text,
  add column if not exists normalized_phone text;

create index if not exists guests_normalized_phone_idx
  on public.guests (lower(coalesce(normalized_phone, '')));

create or replace function public.normalize_registration_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          trim(coalesce(p_name, '')),
          '(?i)\b(?:mr|mrs|ms|miss|dr|ing|alhaji|alhaja|hajia|sir|madam|prof|rev|sheikh|sheik)\.?\b',
          ' ',
          'g'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_registration_phone(p_phone text)
returns text
language sql
immutable
as $$
  with digits as (
    select regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g') as raw
  )
  select case
    when raw = '' then ''
    when raw ~ '^\+?232' then regexp_replace(raw, '[^0-9]', '', 'g')
    when raw ~ '^0' then '+232' || regexp_replace(raw, '^0', '', 'g')
    when raw ~ '^[1-9]' then '+232' || regexp_replace(raw, '[^0-9]', '', 'g')
    else ''
  end
  from digits;
$$;

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
begin
  if length(coalesce(v_name, '')) < 2 or v_phone = '' then
    return jsonb_build_object('status', 'pending', 'reason', 'insufficient_match_data');
  end if;

  for v_guest in
    select g.*
      from public.guests g
     where g.is_active
       and (
         lower(coalesce(g.normalized_phone, '')) = lower(v_phone)
         or public.normalize_registration_name(g.full_name) = v_name
         or public.normalize_registration_name(coalesce(g.household_name, '')) = v_name
       )
     order by g.full_name
  loop
    v_candidates := v_candidates || jsonb_build_object(
      'guest_id', v_guest.id,
      'full_name', v_guest.full_name,
      'household_name', v_guest.household_name,
      'invited_count', v_guest.invited_count,
      'checked_in_count', v_guest.checked_in_count,
      'phone_number', coalesce(v_guest.phone_number, v_phone)
    );
  end loop;

  if jsonb_array_length(v_candidates) = 1 then
    return jsonb_build_object(
      'status', 'matched',
      'guest', v_candidates->0
    );
  elsif jsonb_array_length(v_candidates) > 1 then
    return jsonb_build_object(
      'status', 'ambiguous',
      'candidates', v_candidates
    );
  end if;

  return jsonb_build_object('status', 'pending');
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
  v_names_count integer;
  v_unique_names text[];
  v_name_index integer;
begin
  if p_full_name is null or pg_catalog.btrim(p_full_name) = '' then
    raise exception 'Full name is required' using errcode = '22023';
  end if;
  if coalesce(p_phone, '') = '' then
    raise exception 'Phone number is required' using errcode = '22023';
  end if;
  if p_names is null or pg_catalog.jsonb_typeof(p_names) <> 'array' then
    raise exception 'Attendee list is required' using errcode = '22023';
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

  update public.guests
     set phone_number = public.normalize_registration_phone(p_phone),
         normalized_phone = public.normalize_registration_phone(p_phone)
   where id = v_guest.id;

  if jsonb_array_length(p_names) < 1 then
    raise exception 'At least one attendee must be listed.' using errcode = '22023';
  end if;

  select array_agg(distinct lower(trim(value #>> '{}')))
    into v_unique_names
    from jsonb_array_elements(p_names) as value
   where jsonb_typeof(value) = 'string'
     and length(btrim(value #>> '{}')) > 0;

  if v_unique_names is null or array_length(v_unique_names, 1) <> jsonb_array_length(p_names) then
    raise exception 'Attendee names must be unique and non-empty.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_names) > (v_guest.invited_count - v_guest.checked_in_count) then
    raise exception 'Registration exceeds the remaining household capacity.' using errcode = 'P0001';
  end if;

  insert into public.household_registrations (guest_id, registered_at, needs_admin_review)
  values (v_guest.id, now(), false)
  on conflict (guest_id) do nothing
  returning * into v_registration;

  if v_registration is null then
    select * into v_registration
      from public.household_registrations
     where guest_id = v_guest.id
     for update;
  end if;

  for v_name_index in 1 .. jsonb_array_length(p_names)
  loop
    v_name := btrim(p_names->(v_name_index - 1) #>> '{}');
    if v_name = '' then
      raise exception 'Attendee names must be non-empty.' using errcode = '22023';
    end if;

    if exists (
      select 1
        from public.registered_attendees a
       where a.registration_id = v_registration.id
         and lower(btrim(a.full_name)) = lower(v_name)
    ) then
      continue;
    end if;

    insert into public.registered_attendees (registration_id, full_name)
    values (v_registration.id, v_name)
    returning id into v_attendee_id;

    v_token := encode(gen_random_bytes(32), 'hex');
    insert into public.admission_passes (attendee_id, token_hash)
    values (
      v_attendee_id,
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256')
    );

    v_passes := v_passes || jsonb_build_array(
      jsonb_build_object(
        'attendee_id', v_attendee_id,
        'full_name', v_name,
        'token', v_token
      )
    );
  end loop;

  insert into public.registration_history (registration_id, event_type, details)
  values (v_registration.id, 'self_registration_approved', jsonb_build_object('matched_by', 'name_phone'));

  return v_passes;
end;
$$;

create or replace function public.household_reissue_passes_by_identity(p_full_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match jsonb;
  v_guest_id uuid;
  v_registration public.household_registrations;
  v_attendee record;
  v_token text;
  v_passes jsonb := '[]'::jsonb;
begin
  select public.lookup_household_registration(p_full_name, p_phone) into v_match;
  if coalesce(v_match->>'status', '') <> 'matched' then
    raise exception 'No approved household match was found for this name and phone number.' using errcode = 'P0002';
  end if;

  v_guest_id := (v_match->'guest'->>'guest_id')::uuid;
  select * into v_registration
    from public.household_registrations
   where guest_id = v_guest_id
   for update;

  if not found then
    return '[]'::jsonb;
  end if;

  for v_attendee in
    select a.id, a.full_name
      from public.registered_attendees a
     where a.registration_id = v_registration.id
       and a.checked_in_at is null
     order by a.created_at
  loop
    update public.admission_passes
       set status = 'revoked', revoked_at = now()
     where attendee_id = v_attendee.id and status = 'active';

    v_token := encode(gen_random_bytes(32), 'hex');
    insert into public.admission_passes (attendee_id, token_hash)
    values (
      v_attendee.id,
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256')
    );

    v_passes := v_passes || jsonb_build_array(
      jsonb_build_object(
        'attendee_id', v_attendee.id,
        'full_name', v_attendee.full_name,
        'token', v_token
      )
    );
  end loop;

  insert into public.registration_history (registration_id, event_type, details)
  values (v_registration.id, 'household_passes_reissued', jsonb_build_object('method', 'identity_reissue'));

  return v_passes;
end;
$$;

revoke all on function public.lookup_household_registration(text, text) from public, anon, authenticated;
revoke all on function public.register_household_match(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.household_reissue_passes_by_identity(text, text) from public, anon, authenticated;
grant execute on function public.lookup_household_registration(text, text) to anon, authenticated;
grant execute on function public.register_household_match(text, text, jsonb) to anon, authenticated;
grant execute on function public.household_reissue_passes_by_identity(text, text) to anon, authenticated;
