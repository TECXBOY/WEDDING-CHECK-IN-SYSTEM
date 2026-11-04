# THE_HALAL_WAY_26 — Guest Check-In

Private, mobile-first wedding check-in app. React + Vite, Tailwind, Supabase, Vercel.

**Build status:** Stage 1, Stage 2 core check-in, Stage 3 administration, and the shared invitation QR delivery are implemented. Stage 4 polish remains.

## Project structure

```
supabase/migrations/   0001 schema · 0002 RLS · 0003 check-in + stats · 0004 Stage 2 · 0005 Stage 3 administration
supabase/functions/   invite-staff Edge Function (service-role key stays server-side)
src/lib/supabase.js    Supabase client (anon key only)
src/auth/              AuthContext (session + staff profile), ProtectedRoute
src/pages/             Login, CheckIn (usher), Admin dashboard
src/components/admin/  Guest management, CSV, staff, dashboard, reports and invitation QR
public/downloads/      Shared staff check-in QR (PNG, SVG, print-ready PDF)
```

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Disable public sign-ups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". (Also leave email confirmation as you prefer; staff are created by the admin.)
3. **Run migrations:** SQL Editor → run `0001_schema.sql`, `0002_rls.sql`, `0003_checkin_functions.sql`, `0004_stage_2_search_and_checkin.sql`, and `0005_stage_3_admin.sql` in order. If migrations 0001–0004 have already been applied, run only `0005_stage_3_admin.sql`.
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
7. Deploy the staff invitation function after applying the migrations: `supabase functions deploy invite-staff`. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Set `APP_BASE_URL` to the deployed app origin (for example `supabase secrets set APP_BASE_URL=https://your-production-domain`) and add that origin's `/login` URL to Supabase Auth's allowed redirect URLs.
8. Run the local business-rule tests with `npm test`; run a production build with `npm run build`.

The shared invitation QR uses the fixed production URL `https://ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app/check-in`, independent of the current browser or deployment preview. Admins can view/copy/download it under Admin → Invitation QR. Regenerate the static PNG/SVG/PDF files after changing the approved permanent URL with `npm run generate:invitation-qr`. Keep the Vercel production alias assigned to the project to preserve printed invitations.

The shared invitation QR should point to the deployed app's `/check-in` route. Unauthenticated staff are redirected through `/login` and returned to check-in; the QR itself grants no access. Stage 2 and Stage 3 database features require migrations `0004` and `0005` to be applied in Supabase; the browser uses only the public anon key and authenticated RPCs.

The admin dashboard includes paginated guest management, bounded CSV import/export, staff listing/invitation/role control, and attendance/history reports. Import is capped at 500 rows per transaction; exports are capped at 5,000 rows. Staff invitation requires the deployed `invite-staff` Edge Function. The function validates the current active admin from their authenticated session before using its server-only service role.

The Node tests cover CSV parsing/validation, safe exports, pagination, attendance calculations, and Stage 2 check-in rules. Database authorization, staff invitations, RLS, atomic import behavior, and concurrent check-ins should also be verified against the Supabase project before event use.

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

The shared QR opens `/check-in`; unauthenticated staff are routed to login, and the QR itself grants nothing.

## Additions to the brief's schema (flagged, not silent)

- `profiles.is_active` — needed to disable an usher account.
- `check_in_logs.reversed_at / reversed_by` — needed for the admin's "correct an accidental check-in" (Stage 3).
# WEDDING-CHECK-IN-SYSTEM
