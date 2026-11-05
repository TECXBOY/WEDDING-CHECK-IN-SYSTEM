# THW26 — Project Rules (save once as `THW26_RULES.md` in the repo root)

Paste this file into the VS Code agent first. Every stage prompt after it says "follow THW26_RULES.md". Rules here override anything the agent assumes.

## What we are building

THE_HALAL_WAY_26 (THW26): wedding registration, admission and attendance system.
Couple: Ing. Alhaji Alpha Sallui Koita & Ing. Fatmata Kargbo. Wedding: Sunday 13 December 2026, Freetown. About 100+ attendees.

**The one-line vision:** One shared QR on every invitation → guests register their household → individual digital admission passes are generated → multiple authorized staff scan the passes → attendance updates automatically → admin monitors everything.

## Non-negotiable decisions (already made — do not reopen them)

1. ONE shared QR code on every printed invitation, pointing to the permanent production `/register` URL.
2. NO individual QR codes on invitations. NO household reference codes required to register. NO manual code distribution.
3. Household-based self-registration: one representative registers the whole household using **full name + phone number**.
4. The server matches the registrant against the admin's approved guest list, and enforces the approved household capacity.
   - Successful match → can register within capacity.
   - Ambiguous match → flagged for admin review.
   - No match → stays pending. It must NEVER auto-create an approved invitation.
5. Individual digital QR admission passes are generated automatically (one per registered attendee) once the registration is approved.
6. Multiple authorized staff, each with their own account, can scan simultaneously at `/scan`. Staff are NOT admins.
7. One central database is the single source of truth. Do NOT introduce Google Sheets, Orca Scan or any second database.
8. Duplicate admission is prevented by atomic server-side operations.
9. Manual search fallback for staff (forgotten phone etc.) must go through the same admission logic and must never bypass capacity or duplicate rules.
10. The admin controls guests, households, capacities, registrations, passes, staff and reports.
11. Preserve existing working functionality, existing guest records and existing check-in history. The existing `/check-in` workflow must keep working.
12. No unnecessary paid services. No unnecessary features.

## Working rules for the agent

- **Verify, don't trust.** Earlier reports of "implemented" came from an agent summary. Read the actual code, migrations and database before claiming anything works. If you didn't run it or read it, say "UNVERIFIED".
- **Do not rebuild working functionality.** Change the minimum needed. Prefer extending over rewriting.
- **Work on a git branch per stage** (`stage/<name>`), small commits, no force-push, never commit secrets.
- **Migrations are additive.** Never edit a migration that may already be applied. Add the next numbered migration (after `0006_household_registration_and_passes.sql`).
- **Never run destructive or load tests against production data.** Use a local/staging database or a disposable schema. Ask the owner before touching production.
- **Security is enforced on the server/database**, not by hiding buttons. No service-role key or privileged secret in frontend code, bundles, logs or git history.
- **Never show a success state unless the server confirmed it.** On network or server failure, show a clear error; never queue or fake success.
- **Keep the design identity:** Midnight Navy `#101B35`, Deep Navy `#172544`, Warm Beige `#E8DDC9`, Champagne Gold `#C8A96B`, White `#FFFFFF`. Elegant, minimal, premium, readable. Mobile-first (ushers and guests are on phones).
- **Do not invent features.** If something seems missing, list it under "Questions for the owner" instead of building it.
- Verify the real stack from the repo (previously stated: React, FastAPI, Supabase, Cloudinary, Render). Use whatever the repo actually uses.

## How to finish every stage

1. Run the existing tests and the build. Add tests for what you changed. Show the results.
2. Write a **Stage Report** with exactly these sections:
   - **Verified now** (what you checked, with file paths / function names / command output as evidence)
   - **Changed** (files, migrations, endpoints)
   - **Tests run** (command + result)
   - **Not verified / risks**
   - **Questions for the owner** (decisions that are theirs to make)
3. **Stop and wait for the owner's approval** before starting the next stage.

## Timeline context

Wedding: 13 Dec 2026. Suggested plan: features frozen by 1 Dec, dress rehearsal with real phones 6–10 Dec, no risky changes in the last week.
