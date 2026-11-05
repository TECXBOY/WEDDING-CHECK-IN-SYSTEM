# STAGE 3 — Admin Review Queue, Registrations & Pass Control

Follow `THW26_RULES.md`. Start only after the owner approved Stage 2. Reuse what already exists in the admin area; **add or fix only what is missing.**

## Goal

The administrator can control the whole event from one place with no spreadsheet reconciling, and can resolve every registration that the system could not approve by itself.

## Requirements (verify which already exist first)

### 1. Review queue
- List registrations with status: `approved`, `pending_review` (ambiguous), `pending` (no match), `rejected`.
- For each pending item show: submitted name, normalized phone, requested attendees, timestamp, and the **candidate households** the matcher found (if any) with their capacities.
- Admin actions: **approve** (choose or confirm the household; capacity enforced by the database), **reject** (with a short reason kept in history), and **create/link household** when the person is genuinely invited but missing from the list.
- Approving generates the individual passes through the same single code path used for auto-approved registrations.

### 2. Guest & household management
- Manage approved guest list and households, including invitation capacity.
- Lowering capacity below the number already registered or admitted must be blocked with a clear message.
- CSV import with preview, validation and duplicate protection (full name + household + phone). Show per-row errors. Nothing is imported until the admin confirms.

### 3. Attendee & pass management
- Correct attendee names and household membership. Every change is recorded (who, when, old → new).
- **Revoke** a pass: it stops working immediately at `/scan`; keep the record.
- **Reissue** a pass: creates a new token and invalidates the old one atomically; keep history; the new pass is available to the household's access link.
- Admin cannot raise admitted counts by hand; arrival data only changes through the admission function or an explicit audited reversal.

### 4. Staff management
- Create, disable and view staff accounts. Creating accounts uses server-side privileged code only (no service-role key in the frontend).
- Disabling a staff member locks them out of `/scan` immediately, even with an existing session.
- Staff accounts are **not** admins. Prove with a test that a staff token gets 403 on every admin endpoint.

### 5. Overview & reports
Live dashboard showing: total invited capacity, registered attendees, registrations pending review, passes issued/revoked, arrived, remaining (registered − arrived), attendance percentage.
- Attendance history: attendee, household, staff member responsible, server timestamp, admission method (scan vs manual).
- CSV export of attendance (guard against spreadsheet formula injection: prefix cells starting with `=`, `+`, `-`, `@`).
- Printable emergency list (name, household, capacity, a blank "arrived" box) and a downloadable CSV of the guest list for use before the wedding.

## Tests
- Admin approve/reject paths; approving past capacity is refused.
- Revoked pass rejected; reissued old token rejected, new token works.
- Staff cannot call admin endpoints; disabled staff blocked immediately.
- CSV import: invalid rows, duplicates, preview-before-commit.
- Audit rows are written for name changes, revocations, reissues, approvals.
- Existing guest records and check-in history are unchanged (compare row counts/checksums before and after migrating).

Finish with the Stage Report and **stop for approval**.
