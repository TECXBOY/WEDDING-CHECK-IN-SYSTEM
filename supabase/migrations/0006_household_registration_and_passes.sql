-- Household registration and individual admission passes. Existing invitation
-- rows and check-in history remain authoritative and are not rewritten.
create extension if not exists pgcrypto with schema extensions;

create table public.household_registrations (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.guests(id) on delete restrict,
  invitation_code_hash bytea unique,
  code_active boolean not null default true,
  registered_at timestamptz,
  needs_admin_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.registered_attendees (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.household_registrations(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index registered_attendees_household_name_idx
  on public.registered_attendees (registration_id, lower(btrim(full_name)));

create table public.admission_passes (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.registered_attendees(id) on delete restrict,
  token_hash bytea not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'used')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  used_at timestamptz
);

create table public.household_invitation_code_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.household_registrations(id) on delete restrict,
  code_hash bytea not null unique,
  is_active boolean not null default true,
  issued_by uuid references public.profiles(id),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.registration_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.household_registrations(id) on delete restrict,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.check_in_logs
  add column attendee_id uuid references public.registered_attendees(id) on delete restrict;

create unique index check_in_logs_active_attendee_idx
  on public.check_in_logs (attendee_id)
  where attendee_id is not null and reversed_at is null;

create index household_registrations_code_hash_idx
  on public.household_registrations (invitation_code_hash);
create index registered_attendees_registration_idx
  on public.registered_attendees (registration_id, created_at);
create index admission_passes_attendee_idx
  on public.admission_passes (attendee_id, issued_at desc);

alter table public.household_registrations enable row level security;
alter table public.registered_attendees enable row level security;
alter table public.admission_passes enable row level security;
alter table public.household_invitation_code_history enable row level security;
alter table public.registration_history enable row level security;

revoke all on public.household_registrations, public.registered_attendees, public.admission_passes
  from public, anon, authenticated;
revoke all on public.household_invitation_code_history, public.registration_history
  from public, anon, authenticated;

create or replace function public.admin_issue_invitation_code(p_guest_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(12), 'hex'));
  v_registration_id uuid;
  v_hash bytea;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select id into v_registration_id from public.household_registrations
   where guest_id = p_guest_id for update;
  perform 1 from public.guests where id = p_guest_id and is_active for update;
  if not found then
    raise exception 'Active invitation not found' using errcode = 'P0002';
  end if;
  insert into public.household_registrations (guest_id, invitation_code_hash)
  values (p_guest_id, extensions.digest(pg_catalog.convert_to(v_code, 'UTF8'), 'sha256'))
  on conflict (guest_id) do update
    set invitation_code_hash = excluded.invitation_code_hash,
        code_active = true
  returning id, invitation_code_hash into v_registration_id, v_hash;
  update public.household_invitation_code_history
     set is_active = false, revoked_at = now()
   where registration_id = v_registration_id and is_active;
  insert into public.household_invitation_code_history
    (registration_id, code_hash, issued_by)
  values (v_registration_id, v_hash, auth.uid());
  insert into public.registration_history (registration_id, event_type, actor_id)
  values (v_registration_id, 'invitation_reference_issued', auth.uid());
  return v_code;
end;
$$;

create or replace function public.register_household(p_code text, p_names jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_registration public.household_registrations;
  v_guest public.guests;
  v_name text;
  v_attendee_id uuid;
  v_token text;
  v_passes jsonb := '[]'::jsonb;
  v_name_count integer;
begin
  if p_code is null or pg_catalog.length(pg_catalog.btrim(p_code)) <> 24
     or p_names is null or pg_catalog.jsonb_typeof(p_names) <> 'array'
     or pg_catalog.jsonb_array_length(p_names) < 1 then
    raise exception 'Invalid invitation code or attendee list' using errcode = '22023';
  end if;
  v_hash := extensions.digest(
    pg_catalog.convert_to(pg_catalog.upper(pg_catalog.btrim(p_code)), 'UTF8'), 'sha256'
  );
  select * into v_registration
    from public.household_registrations
   where invitation_code_hash = v_hash and code_active
   for update;
  if not found then
    raise exception 'Invitation reference is invalid or inactive' using errcode = 'P0002';
  end if;
  select * into v_guest from public.guests where id = v_registration.guest_id for update;
  if not found or not v_guest.is_active then
    raise exception 'Invitation is inactive' using errcode = 'P0002';
  end if;
  select count(*) into v_name_count
    from (
      select distinct pg_catalog.lower(pg_catalog.btrim(value #>> '{}')) as name
      from pg_catalog.jsonb_array_elements(p_names)
      where pg_catalog.jsonb_typeof(value) = 'string'
        and pg_catalog.length(pg_catalog.btrim(value #>> '{}')) between 1 and 200
    ) names;
  if v_name_count <> pg_catalog.jsonb_array_length(p_names) then
    raise exception 'Names must be non-empty, unique strings of 200 characters or fewer'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.registered_attendees where registration_id = v_registration.id) then
    raise exception 'This household has already registered. Retrieve or reissue its passes instead.'
      using errcode = '23505';
  end if;
  if v_guest.checked_in_count + v_name_count > v_guest.invited_count then
    raise exception 'Registration exceeds the remaining invitation capacity' using errcode = 'P0001';
  end if;

  for v_name in
    select pg_catalog.btrim(value #>> '{}') from pg_catalog.jsonb_array_elements(p_names)
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
      pg_catalog.jsonb_build_object('attendee_id', v_attendee_id, 'full_name', v_name, 'token', v_token)
    );
  end loop;
  update public.household_registrations set registered_at = now() where id = v_registration.id;
  insert into public.registration_history (registration_id, event_type, details)
  values (v_registration.id, 'household_registered',
    pg_catalog.jsonb_build_object('attendee_count', v_name_count));
  return v_passes;
end;
$$;

create or replace function public.validate_household_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_registration public.household_registrations;
  v_guest public.guests;
  v_attendee_count bigint;
begin
  if p_code is null or pg_catalog.length(pg_catalog.btrim(p_code)) <> 24 then
    raise exception 'Invitation reference is invalid or inactive' using errcode = 'P0002';
  end if;
  select * into v_registration
    from public.household_registrations
   where invitation_code_hash = extensions.digest(
     pg_catalog.convert_to(pg_catalog.upper(pg_catalog.btrim(p_code)), 'UTF8'), 'sha256'
   ) and code_active;
  if not found then
    raise exception 'Invitation reference is invalid or inactive' using errcode = 'P0002';
  end if;
  select * into v_guest from public.guests where id = v_registration.guest_id and is_active;
  if not found then
    raise exception 'Invitation reference is invalid or inactive' using errcode = 'P0002';
  end if;
  select count(*) into v_attendee_count
    from public.registered_attendees where registration_id = v_registration.id;
  return pg_catalog.jsonb_build_object(
    'invitation_name', v_guest.full_name,
    'household_name', v_guest.household_name,
    'invited_count', v_guest.invited_count,
    'checked_in_count', v_guest.checked_in_count,
    'registered_count', v_attendee_count,
    'is_registered', v_attendee_count > 0
  );
end;
$$;

create or replace function public.household_reissue_passes(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.household_registrations;
  v_token text;
  v_passes jsonb := '[]'::jsonb;
  v_attendee record;
begin
  if p_code is null or pg_catalog.length(pg_catalog.btrim(p_code)) <> 24 then
    raise exception 'Invalid invitation reference' using errcode = '22023';
  end if;
  select * into v_registration
    from public.household_registrations
   where invitation_code_hash = extensions.digest(
     pg_catalog.convert_to(pg_catalog.upper(pg_catalog.btrim(p_code)), 'UTF8'), 'sha256'
   ) and code_active
   for update;
  if not found then
    raise exception 'Invitation reference is invalid or inactive' using errcode = 'P0002';
  end if;
  perform 1 from public.guests where id = v_registration.guest_id and is_active for update;
  if not found then
    raise exception 'Invitation is inactive' using errcode = 'P0002';
  end if;
  for v_attendee in
    select id, full_name from public.registered_attendees
     where registration_id = v_registration.id and checked_in_at is null
     order by created_at
  loop
    update public.admission_passes set status = 'revoked', revoked_at = now()
     where attendee_id = v_attendee.id and status = 'active';
    v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.admission_passes (attendee_id, token_hash)
    values (
      v_attendee.id,
      extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256')
    );
    v_passes := v_passes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('attendee_id', v_attendee.id, 'full_name', v_attendee.full_name, 'token', v_token)
    );
  end loop;
  insert into public.registration_history (registration_id, event_type, details)
  values (v_registration.id, 'household_passes_reissued',
    pg_catalog.jsonb_build_object('pass_count', pg_catalog.jsonb_array_length(v_passes)));
  return v_passes;
end;
$$;

create or replace function public.get_admission_pass(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'full_name', a.full_name,
    'status', p.status
  )
  from public.admission_passes p
  join public.registered_attendees a on a.id = p.attendee_id
  where p.token_hash = extensions.digest(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256');
$$;

create or replace function public.admit_attendee(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.admission_passes;
  v_attendee public.registered_attendees;
  v_registration public.household_registrations;
  v_guest public.guests;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Authorised staff access required' using errcode = '42501';
  end if;
  select * into v_pass from public.admission_passes
   where token_hash = extensions.digest(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256')
  ;
  if not found then return pg_catalog.jsonb_build_object('status', 'invalid'); end if;
  select * into v_attendee from public.registered_attendees where id = v_pass.attendee_id;
  select * into v_registration from public.household_registrations where id = v_attendee.registration_id;
  select * into v_guest from public.guests where id = v_registration.guest_id for update;
  select * into v_pass from public.admission_passes where id = v_pass.id for update;
  select * into v_attendee from public.registered_attendees where id = v_pass.attendee_id for update;
  if v_attendee.checked_in_at is not null then
    return pg_catalog.jsonb_build_object('status', 'already_checked_in');
  end if;
  if v_pass.status = 'revoked' then return pg_catalog.jsonb_build_object('status', 'revoked'); end if;
  if v_pass.status = 'used' then return pg_catalog.jsonb_build_object('status', 'already_checked_in'); end if;
  if v_registration.needs_admin_review then
    return pg_catalog.jsonb_build_object('status', 'requires_admin_review');
  end if;
  if not v_guest.is_active then return pg_catalog.jsonb_build_object('status', 'invalid'); end if;
  if v_guest.checked_in_count >= v_guest.invited_count then
    return pg_catalog.jsonb_build_object('status', 'requires_admin_review');
  end if;
  perform pg_catalog.set_config('app.checkin_rpc', 'on', true);
  update public.guests set checked_in_count = checked_in_count + 1 where id = v_guest.id;
  update public.registered_attendees set checked_in_at = now() where id = v_attendee.id;
  update public.admission_passes set status = 'used', used_at = now() where id = v_pass.id;
  insert into public.check_in_logs (guest_id, usher_id, people_admitted, attendee_id)
  values (v_guest.id, auth.uid(), 1, v_attendee.id);
  return pg_catalog.jsonb_build_object('status', 'approved', 'full_name', v_attendee.full_name);
end;
$$;

create or replace function public.search_registered_attendees(p_query text, p_limit integer default 20)
returns table (attendee_id uuid, full_name text, guest_id uuid, household_name text, invitation_name text, checked_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Authorised staff access required' using errcode = '42501';
  end if;
  if pg_catalog.length(v_query) < 2 then
    raise exception 'Search requires at least two characters' using errcode = '22023';
  end if;
  return query
  select a.id, a.full_name, g.id, g.household_name, g.full_name, a.checked_in_at
    from public.registered_attendees a
    join public.household_registrations r on r.id = a.registration_id
    join public.guests g on g.id = r.guest_id
   where g.is_active and (
     pg_catalog.strpos(pg_catalog.lower(a.full_name), pg_catalog.lower(v_query)) > 0
     or pg_catalog.strpos(pg_catalog.lower(coalesce(g.household_name, '')), pg_catalog.lower(v_query)) > 0
     or pg_catalog.strpos(pg_catalog.lower(g.full_name), pg_catalog.lower(v_query)) > 0
   )
   order by pg_catalog.lower(a.full_name)
   limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

create or replace function public.manual_admit_attendee(p_attendee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee public.registered_attendees;
  v_registration public.household_registrations;
  v_guest public.guests;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Authorised staff access required' using errcode = '42501';
  end if;
  select * into v_attendee from public.registered_attendees where id = p_attendee_id;
  if not found then return pg_catalog.jsonb_build_object('status', 'invalid'); end if;
  select * into v_registration from public.household_registrations where id = v_attendee.registration_id;
  select * into v_guest from public.guests where id = v_registration.guest_id for update;
  if v_registration.needs_admin_review then
    return pg_catalog.jsonb_build_object('status', 'requires_admin_review');
  end if;
  if not v_guest.is_active then return pg_catalog.jsonb_build_object('status', 'invalid'); end if;
  select * into v_attendee from public.registered_attendees where id = v_attendee.id for update;
  if v_attendee.checked_in_at is not null then
    return pg_catalog.jsonb_build_object('status', 'already_checked_in');
  end if;
  if v_guest.checked_in_count >= v_guest.invited_count then
    return pg_catalog.jsonb_build_object('status', 'requires_admin_review');
  end if;
  perform pg_catalog.set_config('app.checkin_rpc', 'on', true);
  update public.guests set checked_in_count = checked_in_count + 1 where id = v_guest.id;
  update public.registered_attendees set checked_in_at = now() where id = v_attendee.id;
  update public.admission_passes set status = 'revoked', revoked_at = now()
   where attendee_id = v_attendee.id and status = 'active';
  insert into public.check_in_logs (guest_id, usher_id, people_admitted, attendee_id)
  values (v_guest.id, auth.uid(), 1, v_attendee.id);
  return pg_catalog.jsonb_build_object('status', 'approved', 'full_name', v_attendee.full_name);
end;
$$;

create or replace function public.admin_registration_stats()
returns table (
  invited_capacity bigint, registered_attendees bigint, unregistered_capacity bigint,
  checked_in_attendees bigint, attendees_remaining bigint,
  registration_percent numeric, attendance_percent numeric
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
  with totals as (
    select
      coalesce(sum(g.invited_count), 0)::bigint as invited,
      coalesce(sum(g.checked_in_count), 0)::bigint as checked,
      (select count(*) from public.registered_attendees a
        join public.household_registrations r on r.id = a.registration_id
        join public.guests active_guest on active_guest.id = r.guest_id
       where active_guest.is_active)::bigint as registered,
      (select count(*) from public.registered_attendees a
        join public.household_registrations r on r.id = a.registration_id
        join public.guests active_guest on active_guest.id = r.guest_id
       where active_guest.is_active and a.checked_in_at is not null)::bigint as registered_checked
    from public.guests g where g.is_active
  )
  select invited, registered,
    greatest(invited - registered - greatest(checked - registered_checked, 0), 0), checked,
    greatest(invited - checked, 0),
    case
      when invited - greatest(checked - registered_checked, 0) <= 0 then 0::numeric
      else round(registered::numeric * 100 / (invited - greatest(checked - registered_checked, 0)), 1)
    end,
    case when invited = 0 then 0::numeric else round(checked::numeric * 100 / invited, 1) end
  from totals;
end;
$$;

create or replace function public.admin_list_registrations()
returns table (
  guest_id uuid, invitation_name text, household_name text, invited_count integer,
  checked_in_count integer, attendee_count bigint, has_reference boolean,
  registered_at timestamptz, needs_admin_review boolean
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
  select g.id, g.full_name, g.household_name, g.invited_count, g.checked_in_count,
    count(a.id)::bigint, coalesce(r.code_active, false), r.registered_at,
    coalesce(r.needs_admin_review, false)
  from public.guests g
  left join public.household_registrations r on r.guest_id = g.id
  left join public.registered_attendees a on a.registration_id = r.id
  where g.is_active
  group by g.id, g.full_name, g.household_name, g.invited_count, g.checked_in_count,
    r.code_active, r.registered_at, r.needs_admin_review
  order by pg_catalog.lower(g.household_name), pg_catalog.lower(g.full_name);
end;
$$;

create or replace function public.admin_list_attendees(p_guest_id uuid)
returns table (attendee_id uuid, full_name text, checked_in_at timestamptz, pass_status text)
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
  select a.id, a.full_name, a.checked_in_at,
    coalesce((select p.status from public.admission_passes p where p.attendee_id = a.id
      order by p.issued_at desc limit 1), 'none')
  from public.registered_attendees a
  join public.household_registrations r on r.id = a.registration_id
  where r.guest_id = p_guest_id
  order by pg_catalog.lower(a.full_name);
end;
$$;

create or replace function public.admin_update_attendee(p_attendee_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_registration_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_full_name is null or pg_catalog.length(pg_catalog.btrim(p_full_name)) not between 1 and 200 then
    raise exception 'Attendee name must be 1 to 200 characters' using errcode = '22023';
  end if;
  select a.registration_id into v_registration_id from public.registered_attendees a
    where a.id = p_attendee_id;
  if not found then raise exception 'Attendee not found' using errcode = 'P0002'; end if;
  perform 1 from public.guests g
    join public.household_registrations r on r.guest_id = g.id
   where r.id = v_registration_id for update of g;
  select registration_id into v_registration_id from public.registered_attendees
   where id = p_attendee_id for update;
  if not found then raise exception 'Attendee not found' using errcode = 'P0002'; end if;
  update public.registered_attendees set full_name = pg_catalog.btrim(p_full_name) where id = p_attendee_id;
  insert into public.registration_history (registration_id, event_type, details, actor_id)
  values (v_registration_id, 'attendee_name_corrected',
    pg_catalog.jsonb_build_object('attendee_id', p_attendee_id, 'full_name', pg_catalog.btrim(p_full_name)),
    auth.uid());
end;
$$;

create or replace function public.admin_reissue_pass(p_attendee_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text; v_attendee public.registered_attendees; v_registration public.household_registrations;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into v_attendee from public.registered_attendees where id = p_attendee_id;
  if not found then raise exception 'Attendee not found' using errcode = 'P0002'; end if;
  select * into v_registration from public.household_registrations where id = v_attendee.registration_id;
  perform 1 from public.guests where id = v_registration.guest_id for update;
  select * into v_attendee from public.registered_attendees
   where id = p_attendee_id and checked_in_at is null for update;
  if not found then raise exception 'Unchecked attendee not found' using errcode = 'P0002'; end if;
  update public.admission_passes set status = 'revoked', revoked_at = now()
   where attendee_id = v_attendee.id and status = 'active';
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admission_passes (attendee_id, token_hash)
  values (v_attendee.id, extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'));
  insert into public.registration_history (registration_id, event_type, details, actor_id)
  values (v_attendee.registration_id, 'admission_pass_reissued',
    pg_catalog.jsonb_build_object('attendee_id', v_attendee.id), auth.uid());
  return v_token;
end;
$$;

create or replace function public.admin_revoke_pass(p_attendee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_attendee public.registered_attendees; v_registration public.household_registrations;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into v_attendee from public.registered_attendees where id = p_attendee_id;
  if not found then raise exception 'Attendee not found' using errcode = 'P0002'; end if;
  select * into v_registration from public.household_registrations where id = v_attendee.registration_id;
  perform 1 from public.guests where id = v_registration.guest_id for update;
  select * into v_attendee from public.registered_attendees
   where id = p_attendee_id and checked_in_at is null for update;
  if not found then raise exception 'Attendee is already checked in' using errcode = 'P0001'; end if;
  update public.admission_passes set status = 'revoked', revoked_at = now()
   where attendee_id = p_attendee_id and status = 'active';
  if not found then raise exception 'No active pass exists for this attendee' using errcode = 'P0002'; end if;
  insert into public.registration_history (registration_id, event_type, details, actor_id)
  values (v_registration.id, 'admission_pass_revoked',
    pg_catalog.jsonb_build_object('attendee_id', p_attendee_id), auth.uid());
end;
$$;

create or replace function public.admin_registration_history(p_guest_id uuid)
returns table (event_type text, details jsonb, actor_name text, occurred_at timestamptz)
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
  select h.event_type, h.details, p.full_name, h.created_at
    from public.registration_history h
    join public.household_registrations r on r.id = h.registration_id
    left join public.profiles p on p.id = h.actor_id
   where r.guest_id = p_guest_id
  union all
  select 'attendee_admitted', pg_catalog.jsonb_build_object(
      'attendee_id', l.attendee_id, 'people_admitted', l.people_admitted
    ), p.full_name, l.checked_in_at
    from public.check_in_logs l
    join public.profiles p on p.id = l.usher_id
   where l.guest_id = p_guest_id and l.attendee_id is not null
  order by occurred_at desc;
end;
$$;

create or replace function public.admin_set_registration_review(p_guest_id uuid, p_needs_review boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_registration_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select id into v_registration_id from public.household_registrations
   where guest_id = p_guest_id for update;
  if not found then raise exception 'Household registration not found' using errcode = 'P0002'; end if;
  update public.household_registrations
     set needs_admin_review = p_needs_review
   where id = v_registration_id;
  insert into public.registration_history (registration_id, event_type, details, actor_id)
  values (v_registration_id, 'administrative_review_status_changed',
    pg_catalog.jsonb_build_object('needs_admin_review', p_needs_review), auth.uid());
end;
$$;

create or replace function public.admin_recent_attendance(p_limit integer default 20)
returns table (attendee_name text, household_name text, staff_name text, checked_in_at timestamptz)
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
  select a.full_name, g.household_name, p.full_name, l.checked_in_at
  from public.check_in_logs l
  join public.profiles p on p.id = l.usher_id
  left join public.registered_attendees a on a.id = l.attendee_id
  join public.guests g on g.id = l.guest_id
  where l.reversed_at is null
  order by l.checked_in_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.admin_issue_invitation_code(uuid),
  public.admin_registration_stats(), public.admin_list_registrations(),
  public.admin_list_attendees(uuid), public.admin_update_attendee(uuid, text),
  public.admin_reissue_pass(uuid), public.admin_revoke_pass(uuid), public.admin_recent_attendance(integer),
  public.admin_registration_history(uuid), public.admin_set_registration_review(uuid, boolean),
  public.admit_attendee(text), public.search_registered_attendees(text, integer),
  public.manual_admit_attendee(uuid)
  from public, anon;
revoke all on function public.register_household(text, jsonb),
  public.validate_household_code(text),
  public.household_reissue_passes(text), public.get_admission_pass(text)
  from public;

grant execute on function public.admin_issue_invitation_code(uuid),
  public.admin_registration_stats(), public.admin_list_registrations(),
  public.admin_list_attendees(uuid), public.admin_update_attendee(uuid, text),
  public.admin_reissue_pass(uuid), public.admin_revoke_pass(uuid), public.admin_recent_attendance(integer),
  public.admin_registration_history(uuid), public.admin_set_registration_review(uuid, boolean),
  public.admit_attendee(text), public.search_registered_attendees(text, integer),
  public.manual_admit_attendee(uuid)
  to authenticated;
grant execute on function public.register_household(text, jsonb),
  public.validate_household_code(text),
  public.household_reissue_passes(text), public.get_admission_pass(text)
  to anon, authenticated;
