# THE_HALAL_WAY_26 — Guest Check-In

Private, mobile-first wedding check-in app. React + Vite, Tailwind, Supabase, Vercel.

**Build status:** Existing check-in/admin features and the household registration/pass workflow are implemented in code. The new Supabase migration must be applied and verified before enabling registration or individual pass admission in production.

## Project structure

```
supabase/migrations/   0001 schema · 0002 RLS · 0003 check-in + stats · 0004 Stage 2 · 0005 Stage 3 administration · 0006 household registration and passes
supabase/functions/   invite-staff Edge Function (service-role key stays server-side)
src/lib/supabase.js    Supabase client (anon key only)
src/auth/              AuthContext (session + staff profile), ProtectedRoute
src/pages/             Login, Register, AdmissionPass, Scanner, CheckIn (legacy usher), Admin dashboard
src/components/admin/  Guest management, CSV, staff, dashboard, reports and invitation QR
public/downloads/      Shared household registration QR (PNG, SVG, print-ready PDF)
```

## Setup

1. **Create a Supabase project** at supabase.com.
2. **Disable public sign-ups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". (Also leave email confirmation as you prefer; staff are created by the admin.)
3. **Run migrations:** SQL Editor → run `0001_schema.sql`, `0002_rls.sql`, `0003_checkin_functions.sql`, `0004_stage_2_search_and_checkin.sql`, `0005_stage_3_admin.sql`, and `0006_household_registration_and_passes.sql` in order. If 0001–0005 have already been applied, run only `0006_household_registration_and_passes.sql`. The new migration preserves `guests` and historical `check_in_logs`; it adds separate registration, attendee, pass and history tables.
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

The shared household QR uses the fixed production URL `https://ing-fatmata-kargbo-ing-alhaji-s-koi.vercel.app/register`, independent of the current browser or deployment preview. Admins can view/copy/download it under Admin → Invitation QR. Regenerate the static PNG/SVG/PDF files after changing the approved permanent URL with `npm run generate:invitation-qr`. Keep the Vercel production alias assigned to the project to preserve printed invitations. Each printed invitation also needs a different 24-character household reference, issued from Admin → Registrations; the QR alone does not identify or authorize any household.

Households register at `/register`. Authorized staff sign in and open `/scan` to scan individual passes or search registered attendees for manual admission. Camera use requires a secure HTTPS origin and device permission. The old `/check-in` invitation-level workflow remains available for compatibility. Registration, pass issuance, scanning and attendee management require migration `0006` to be applied in Supabase. The browser uses only the public anon key; privileged operations validate staff/admin roles in database RPCs.

The admin dashboard includes paginated guest management, bounded CSV import/export, staff listing/invitation/role control, and attendance/history reports. Import is capped at 500 rows per transaction; exports are capped at 5,000 rows. Staff invitation requires the deployed `invite-staff` Edge Function. The function validates the current active admin from their authenticated session before using its server-only service role.

The Node tests cover CSV parsing/validation, safe exports, pagination, attendance calculations, and Stage 2 check-in rules. Database authorization, staff invitations, RLS, household capacity enforcement, token lifecycle and concurrent check-ins must also be verified against the Supabase project before event use.

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
| Registration requires an approved invitation | High-entropy reference hash checked server-side; direct table access is revoked |
| Passes do not disclose names | Random token URLs; names are returned only after the bearer token is validated |
| Concurrent admission is serialized | QR and manual RPCs lock the existing household guest row before updating attendance |
| Old passes do not revive | Reissue creates a new token hash and leaves the prior pass revoked |

New attendee admission uses a pass QR at `/pass/<token>` and requires a staff-authenticated server-side scan at `/scan`. Existing staff QR assets are superseded by the household registration QR; the staff login and legacy `/check-in` route remain.

## Additions to the brief's schema (flagged, not silent)

- `profiles.is_active` — needed to disable an usher account.
- `check_in_logs.reversed_at / reversed_by` — needed for the admin's "correct an accidental check-in" (Stage 3).
- Household registrations and individual admission passes are additive to approved `guests` invitations. An administrator must issue a unique reference for each household before registration is available. Reference/pass values are stored as hashes; pass plaintext is returned only when first issued or explicitly reissued.
# WEDDING-CHECK-IN-SYSTEM
