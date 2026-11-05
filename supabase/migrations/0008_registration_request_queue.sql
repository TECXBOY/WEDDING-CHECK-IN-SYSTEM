create table public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 200),
  normalized_name text not null,
  phone_number text not null check (char_length(phone_number) between 9 and 16),
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  submission_count integer not null default 1 check (submission_count > 0),
  created_at timestamptz not null default now(),
  last_submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

alter table public.registration_requests enable row level security;
revoke all on public.registration_requests from public, anon, authenticated;

create unique index registration_requests_pending_identity_idx
  on public.registration_requests (normalized_name, phone_number)
  where status = 'pending';
create index registration_requests_status_time_idx
  on public.registration_requests (status, last_submitted_at desc);

create or replace function public.submit_registration_request(p_full_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_normalized_name text := public.normalize_registration_name(p_full_name);
  v_phone text := public.normalize_registration_phone(p_phone);
  v_request_id uuid;
begin
  if pg_catalog.char_length(v_full_name) < 2 or pg_catalog.char_length(v_full_name) > 200
     or pg_catalog.char_length(v_normalized_name) < 2 then
    raise exception 'Enter a valid full name.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_phone) < 9 or pg_catalog.char_length(v_phone) > 16 then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;

  insert into public.registration_requests (full_name, normalized_name, phone_number)
  values (v_full_name, v_normalized_name, v_phone)
  on conflict (normalized_name, phone_number) where status = 'pending'
  do update set
    full_name = excluded.full_name,
    submission_count = public.registration_requests.submission_count + 1,
    last_submitted_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.admin_list_registration_requests()
returns table (
  request_id uuid,
  full_name text,
  phone_number text,
  status text,
  submission_count integer,
  created_at timestamptz,
  last_submitted_at timestamptz,
  reviewed_at timestamptz
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
  select r.id, r.full_name, r.phone_number, r.status, r.submission_count,
         r.created_at, r.last_submitted_at, r.reviewed_at
    from public.registration_requests r
   order by (r.status = 'pending') desc, r.last_submitted_at desc
   limit 100;
end;
$$;

create or replace function public.admin_get_guest_registration_phone(p_guest_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select g.phone_number into v_phone
    from public.guests g
   where g.id = p_guest_id;
  if not found then
    raise exception 'Guest invitation not found.' using errcode = 'P0002';
  end if;
  return v_phone;
end;
$$;

create or replace function public.admin_resolve_registration_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.registration_requests
     set status = 'reviewed',
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending registration request not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.submit_registration_request(text, text) from public, anon, authenticated;
revoke all on function public.admin_list_registration_requests(),
  public.admin_get_guest_registration_phone(uuid),
  public.admin_resolve_registration_request(uuid) from public, anon, authenticated;
grant execute on function public.submit_registration_request(text, text) to anon, authenticated;
grant execute on function public.admin_list_registration_requests(),
  public.admin_get_guest_registration_phone(uuid),
  public.admin_resolve_registration_request(uuid) to authenticated;

notify pgrst, 'reload schema';
