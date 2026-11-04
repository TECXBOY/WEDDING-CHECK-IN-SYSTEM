-- 0001_schema.sql — tables for THE_HALAL_WAY_26 check-in system

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) > 0),
  role        text not null check (role in ('admin', 'usher')),
  -- Added to the brief's fields: needed to "disable usher account" without deleting history.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.guests (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 200),
  household_name   text check (household_name is null or char_length(household_name) <= 200),
  invited_count    integer not null check (invited_count >= 1),
  checked_in_count integer not null default 0 check (checked_in_count >= 0),
  notes            text check (notes is null or char_length(notes) <= 1000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Hard guarantee: never more people checked in than invited.
  constraint checked_in_within_invited check (checked_in_count <= invited_count)
);

create index guests_full_name_idx on public.guests (lower(full_name));
create index guests_household_idx on public.guests (lower(household_name));

create table public.check_in_logs (
  id              uuid primary key default gen_random_uuid(),
  guest_id        uuid not null references public.guests(id) on delete restrict,
  usher_id        uuid not null references public.profiles(id) on delete restrict,
  people_admitted integer not null check (people_admitted >= 1),
  checked_in_at   timestamptz not null default now(),
  -- Added for the admin "correct an accidental check-in" feature (Stage 3).
  reversed_at     timestamptz,
  reversed_by     uuid references public.profiles(id)
);

create index check_in_logs_guest_idx on public.check_in_logs (guest_id);
create index check_in_logs_usher_idx on public.check_in_logs (usher_id);
create index check_in_logs_time_idx  on public.check_in_logs (checked_in_at desc);

-- Keep updated_at fresh.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger guests_set_updated_at
before update on public.guests
for each row execute function public.set_updated_at();

-- checked_in_count may only change through our check-in / correction functions
-- (they set app.checkin_rpc = 'on' for the current transaction). This keeps the
-- count always consistent with check_in_logs, even for administrators.
create function public.guard_checked_in_count() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.checked_in_count := 0;
  elsif new.checked_in_count is distinct from old.checked_in_count
        and coalesce(current_setting('app.checkin_rpc', true), '') <> 'on' then
    raise exception 'checked_in_count can only be changed by the check-in functions';
  end if;
  return new;
end;
$$;

create trigger guests_guard_checked_in_count
before insert or update on public.guests
for each row execute function public.guard_checked_in_count();
