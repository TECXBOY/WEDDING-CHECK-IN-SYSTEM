# THE_HALAL_WAY_26 — Guest Check-In

Private, mobile-first wedding check-in app. React + Vite, Tailwind, Supabase, Vercel.

**Build status:** Stage 1 (foundation) done. Stage 2 core check-in, Stage 3 administration, Stage 4 polish/deploy still to come.

## Project structure

```
supabase/migrations/   0001 schema · 0002 RLS · 0003 check-in + stats functions
src/lib/supabase.js    Supabase client (anon key only)
src/auth/              AuthContext (session + staff profile), ProtectedRoute
src/pages/             Login, CheckIn (usher), Admin
src/components/        Brand, Splash
```

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Disable public sign-ups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". (Also leave email confirmation as you prefer; staff are created by the admin.)
3. **Run migrations:** SQL Editor → run `0001_schema.sql`, `0002_rls.sql`, `0003_checkin_functions.sql` in order.
4. **Create the first administrator:**
   - Authentication → Users → *Add user* (email + password, tick auto-confirm).
   - Copy the new user's UUID, then in the SQL Editor run:
     ```sql
     insert into public.profiles (id, full_name, role)
     values ('PASTE-USER-UUID', 'Your Name', 'admin');
     ```
   A signed-in user with no active profile row is refused by the app and by RLS.
5. **Environment:** `cp .env.example .env.local` and fill in the Project URL and anon key (Settings → API). Never use the `service_role` key in the frontend.
6. `npm install && npm run dev`

Usher accounts will be created from the admin dashboard in Stage 3 (via a Supabase Edge Function that holds the service-role key server-side).

## Security model (summary)

| Rule | Enforced by |
| --- | --- |
| No public sign-up, no anonymous data access | Supabase setting + anon grants revoked + RLS |
| Only active staff read guests | RLS `guests_select_staff` |
| Only admins add/edit/delete guests | RLS insert/update/delete policies |
| Ushers can't change invitation limits | RLS (update is admin-only) |
| Never more checked in than invited | `CHECK` constraint + `check_in_guest()` |
| Concurrent check-ins are safe | `check_in_guest()` locks the guest row (`FOR UPDATE`) |
| Counts always match the log | Trigger: `checked_in_count` changeable only inside the check-in functions |
| Logs can't be forged or edited | No write policies on `check_in_logs` |
| Every check-in records the usher | `usher_id = auth.uid()` set inside the function |
| Disabled staff are locked out | `is_active` checked in every policy and in the app |

The QR code only opens the login page; it grants nothing.

## Additions to the brief's schema (flagged, not silent)

- `profiles.is_active` — needed to disable an usher account.
- `check_in_logs.reversed_at / reversed_by` — needed for the admin's "correct an accidental check-in" (Stage 3).
# WEDDING-CHECK-IN-SYSTEM
