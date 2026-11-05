# STAGE 2 — Reference-free Registration & Secure Matching

Follow `THW26_RULES.md`. Start only after the owner approved the Stage 1 audit. Use that audit's findings: **fix only what the audit showed is missing or wrong; do not rebuild what already works.**

## Goal

A household representative scans the shared QR → `/register` → enters **full name + phone** → the server matches them to the approved guest list → they register themselves and their accompanying household members within the approved capacity. No household reference code anywhere in the guest flow.

## Requirements

### 1. Remove the reference-code requirement
- `/register` must work with no code, no query parameters and no per-household state in the URL.
- Keep any existing reference-code columns/admin controls only if removing them would break existing data; they must be optional and invisible to guests. Report what you kept and why.

### 2. Identification form
- Fields: full name, phone number. Mobile-first, large inputs, clear errors, no account creation.
- Normalize phones server-side (default country Sierra Leone +232; accept local forms like `076…`/`+23276…`/spaces/dashes).
- Add a hidden honeypot field and basic input length limits.

### 3. Matching (server-side only — never in the browser)
Normalize names: lowercase, trim, collapse spaces, strip punctuation and titles (Mr, Mrs, Ms, Dr, Ing, Alhaji, Alhaja, Hajia, etc.), compare token sets so word order doesn't matter. Then:

| Outcome | Rule | Result |
| --- | --- | --- |
| **Matched** | Exactly one household is a confident match (and, where the guest list has a phone for that household, the phone matches) | Registrant may proceed within capacity |
| **Ambiguous** | More than one candidate household, or only a weak/fuzzy match, or name matches but phone conflicts | Registration saved as `pending_review`; admin is flagged; no passes |
| **No match** | Nothing plausible | Saved as `pending`; never approved automatically; no passes |

- The guest never sees *why* a match failed or who else is on the list. Show a neutral message ("Thanks — we'll confirm your registration and contact you") for pending outcomes.
- After a confident match the form may show only the household display name and its capacity (the minimum needed to fill in attendees).
- **Decision to flag for the owner:** this design auto-approves confident matches (zero manual work) and sends only ambiguous/no-match cases to admin review. Implement it that way, but list it under "Questions for the owner" so they can confirm.

### 4. Attendees & capacity
- Representative enters the names of the people attending (including themselves), up to the household's remaining capacity.
- Capacity is enforced **in the database** (transaction/constraint/row lock), not only in the form. Two simultaneous submissions must not exceed it.
- One active registration per household. A household may return to add members until capacity is reached, never beyond.
- Reject duplicate attendee names within the same household submission; trim and length-limit names.

### 5. Passes after approval
- Passes are generated automatically **only when the registration is approved** (automatically for confident matches, by admin for the rest). One pass per attendee.
- Token: ≥128 bits from a cryptographically secure random source, URL-safe, unique, unguessable, no embedded personal data. Say whether tokens are stored plain or hashed and why.
- The household representative gets a private access link (unguessable token) to view and share passes. **Passes must not be retrievable by name or phone alone.** If a representative loses the link, recovery requires name + phone to match the registered representative exactly, with rate limiting.

### 6. Abuse protection
- Rate limit `/register` and the lookup/recovery endpoint per IP and per phone number (use the stack's existing mechanism or a small DB-backed counter; no paid service).
- Uniform response timing/shape for no-match vs ambiguous where practical, so the form can't be used to enumerate the guest list.
- Log registration attempts (time, outcome, hashed IP/phone) for the admin; do not log full secrets.

## Tests (must be automated and shown)
- Match / ambiguous / no-match examples, including titles, reordered names, extra spaces, phone formats.
- No-match registrations never get passes.
- Two simultaneous registrations for the same household cannot exceed capacity.
- Re-registering cannot create a second active registration or extra capacity.
- Pass access link works; name+phone alone does not reveal passes; rate limit triggers.
- `/register` has no reference-code field and works from the bare URL.
- Existing `/check-in` and existing guest records still work.

Finish with the Stage Report and **stop for approval**.
