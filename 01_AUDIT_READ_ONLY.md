# STAGE 1 — Verified Audit (READ-ONLY. Change nothing.)

Follow `THW26_RULES.md`. This stage is inspection only: **do not modify code, migrations or data.** The owner needs verified facts before anything else changes.

## Context

We changed a requirement. Household reference codes must NOT be required to register. One shared QR (to `/register`) goes on every invitation. Guests identify themselves with full name + phone, and the server matches them to the approved guest list. Individual passes are generated after approval, and multiple staff scan them at `/scan`.

A previous agent reported many things as done (including migration `0006_household_registration_and_passes.sql`, `/register`, `/scan`, pass revocation/reissue, QR PNG/SVG/PDF). Treat all of that as a claim until you prove it.

## What to do

1. Map the repo: stack, folders, routes (frontend and API), migrations in order, tables, RLS policies, DB functions, env variables (names only, never print values).
2. Run the existing tests and the build. Record exact results.
3. Answer each question below with **PASS / PARTIAL / FAIL / UNVERIFIED** and evidence (file path + line or function name + what you ran).

### A. The eight questions
1. Does `/register` currently require a household reference/code?
2. Can a guest register with full name + phone alone, followed by secure server-side matching?
3. Can unmatched or ambiguous registrations be reviewed by an administrator (queue, approve, reject)?
4. Does one shared QR work for multiple unrelated households (no per-household state in the URL)?
5. Are individual passes generated automatically after approval (and only after approval)?
6. Can multiple staff accounts scan at the same time? Are staff separate from admin?
7. Is admission atomic (single DB operation or row lock) and safe against two simultaneous scans of the same pass?
8. Do the production QR assets (PNG, SVG, PDF) encode the correct permanent production `/register` URL? **Decode the actual files** with a QR decoder and print the decoded text. No localhost, preview or temporary URL.

### B. Extra checks that matter for this design
9. **Two admission paths:** the older `/check-in` flow counts people per household; `/scan` admits individual passes. Can the same person be counted twice, or can total admitted exceed invited/registered capacity when both paths are used? Show how the counters relate.
10. **Capacity:** is household capacity enforced in the database (constraint/transaction), not only in the form? Can two simultaneous registrations exceed it?
11. **Public endpoint abuse:** `/register` is public and name+phone is weak proof of identity. Is there rate limiting? Can someone register under another household, or read another household's passes using only a name? Can responses be used to learn who is on the guest list (enumeration)?
12. **Pass tokens:** how are they generated (CSPRNG? ≥128 bits?) and stored (plain or hashed)? Who can read them? Are revoked tokens rejected immediately? Does reissue invalidate the old one?
13. **Matching logic:** show the exact algorithm (normalization of names and phones, titles like Mr/Mrs/Ing/Alhaji, fuzzy rules). List example inputs that match, are ambiguous, or don't match.
14. **Staff vs admin:** can a staff account reach any admin endpoint or modify guests/capacity? Test it, don't assume.
15. **Server-side timestamps and attribution:** is arrival time set by the server and the responsible staff member recorded on every admission?
16. **History preservation:** are existing guests, households and check-in logs intact? Do reversals/revocations keep an audit trail?
17. **Secrets:** search the frontend source, built bundle and git history for service-role keys or other privileged secrets.
18. **Manual fallback:** does manual admission use the same function/rules as scanning?
19. **Scanner states:** does `/scan` clearly show green (approved), red (invalid/revoked), yellow (already checked in), warning (needs admin attention) and error (network/server)? Does it ever show success without server confirmation?
20. **Hosting reality:** note anything that can fail on event day (e.g. free-tier cold starts or database pausing, HTTPS requirement for camera access, CORS, env var mismatches).

## Output

Produce the Stage Report from `THW26_RULES.md`, with:
- A table: question → PASS/PARTIAL/FAIL/UNVERIFIED → evidence.
- A prioritized gap list (P0 = blocks the final design or is a security hole; P1 = should fix before the rehearsal; P2 = nice to have).
- A proposed minimal change list per stage that follows the stages the owner will send next: (2) registration & matching, (3) admin review & passes, (4) scanning & atomic admission, (5) QR assets & release checks. Do not start any of them.

**Stop after the report and wait for approval.**
