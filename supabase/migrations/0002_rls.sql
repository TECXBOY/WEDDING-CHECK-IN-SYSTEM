-- 0002_rls.sql — Row Level Security. All authorization lives here, not in the UI.

alter table public.profiles       enable row level security;
alter table public.guests         enable row level security;
alter table public.check_in_logs  enable row level security;

-- Helper functions (SECURITY DEFINER so they can read profiles without recursion).
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'admin'
  )
$$;

revoke all on function public.is_staff(), public.is_admin() from public, anon;
grant execute on function public.is_staff(), public.is_admin() to authenticated;

-- Defense in depth: anonymous visitors get nothing, even before RLS.
revoke all on public.profiles, public.guests, public.check_in_logs from anon;

-- ---------- profiles ----------
-- Everyone signed in can read their own row (so the app can tell a disabled user why
-- they are blocked). Admins can read all. Account creation is done server-side
-- (Edge Function with the service-role key, Stage 3) — no client insert policy.
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Admins can change other people's profile (e.g. disable an usher), never their own,
-- so an admin cannot lock themselves out by accident.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin() and id <> auth.uid())
  with check (public.is_admin() and id <> auth.uid());

-- ---------- guests ----------
-- Staff read active guests; admins also see deactivated ones.
create policy guests_select_staff on public.guests
  for select to authenticated
  using (public.is_staff() and (is_active or public.is_admin()));

create policy guests_insert_admin on public.guests
  for insert to authenticated
  with check (public.is_admin());

create policy guests_update_admin on public.guests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy guests_delete_admin on public.guests
  for delete to authenticated
  using (public.is_admin());

-- ---------- check_in_logs ----------
-- Staff can read logs (ushers need the "previous check-in time"). Nobody can write
-- logs directly: no insert/update/delete policies exist. Only the SECURITY DEFINER
-- functions in 0003 write here.
create policy logs_select_staff on public.check_in_logs
  for select to authenticated
  using (public.is_staff());
