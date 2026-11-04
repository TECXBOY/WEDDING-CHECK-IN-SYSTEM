# Stage 2 Agent Brief --- Core Wedding Guest Check-In

**Project:** THE_HALAL_WAY_26\
**Stage:** 2 of 4 --- Core Check-In\
**Status:** Foundation (Stage 1) is complete. Continue from the existing
codebase.

## 1. Your Mission

Implement the complete **core usher check-in workflow** for
THE_HALAL_WAY_26.

The wedding uses **one shared QR code** printed on every invitation. The
QR code opens the staff check-in application. It does **not** identify
or authorize a guest by itself. Ushers must authenticate, search the
approved guest list, verify the matching invitation, and record
attendance.

Build on the existing foundation. **Do not restart the project, replace
the stack, or rewrite completed Stage 1 work.**

## 2. Mandatory First Step: Inspect Before Editing

Before changing code:

1.  Inspect the repository structure and read the project instructions,
    README, package scripts, environment examples, and relevant source
    files.
2.  Identify the existing frontend framework, routing, styling system,
    Supabase client setup, authentication flow, profile/role model,
    database migrations, and RLS policies.
3.  Inspect the existing `guests` and `check_in_logs` schema and any
    RPCs/functions already created.
4.  Run the existing checks/build so you know the starting state.
5.  Write a short implementation plan based on the actual repository.
6.  Reuse existing patterns and components. Do not assume names,
    columns, routes, or schemas from this brief exist exactly as
    written.

If the existing schema differs from the proposed design, adapt to the
existing schema where sensible. Do not create duplicate tables or
parallel authentication systems. If a critical schema/security issue
blocks implementation, explain it and make the smallest safe change.

## 3. User and Wedding Context

-   **Brand:** THE_HALAL_WAY_26
-   **Couple:** Ing. Alhaji Alpha Sallui Koita & Ing. Fatmata Kargbo
-   **Date:** Sunday, 13 December 2026
-   **Nikah:** 10:00 AM --- 3 West Brook Street (Big Waterloo Street),
    Freetown
-   **Reception:** 5:00 PM --- Jemlen Hall, 69 Campbell Street, Freetown

The check-in interface should be usable by non-technical ushers on
ordinary smartphones.

## 4. Scope of This Stage

Implement only:

1.  The usher check-in dashboard.
2.  Guest search.
3.  Guest verification/details.
4.  Partial group check-in.
5.  Successful check-in feedback.
6.  Already-checked-in and remaining-capacity states.
7.  Reliable, secure persistence and error handling.
8.  Tests for the critical check-in rules.

Do **not** implement guest import/export, staff management, a full
analytics suite, public RSVP, individual guest QR codes, ticketing,
payments, seating plans, messaging, or other Stage 3/4 features unless
they already exist and are required by the current architecture.

## 5. Expected Usher Workflow

1.  The usher scans the shared QR code using the phone camera.
2.  The QR opens the existing production check-in route (or the
    appropriate route in the current app).
3.  If unauthenticated, the usher is redirected to the existing login
    flow and then returned to check-in.
4.  The usher sees a clear page title, attendance summary, and guest
    search field.
5.  The usher searches by guest name or household name.
6.  Search results appear quickly and clearly.
7.  The usher selects the correct record and verifies the details.
8.  The usher chooses how many people from that invitation group are
    arriving now.
9.  The system confirms the intended number and records the check-in.
10. The UI shows a success state only after the database confirms
    success.
11. The usher returns to search and processes the next invitation.

Do not require ushers to install a native app.

## 6. Check-In Dashboard

Use the project's existing routing and component conventions. The
dashboard should contain:

### Header

-   THE_HALAL_WAY_26
-   "Wedding Guest Check-In"
-   Sunday, 13 December 2026
-   Current usher identity if available
-   Sign-out action using the existing auth system

### Attendance summary

Display: - **Expected:** total invited people across active guest
records - **Checked in:** total people recorded as present -
**Remaining:** expected minus checked in

These are people counts, not merely the number of invitation records.
Derive them from authoritative database data. Do not hardcode values.
Prevent stale or inconsistent totals after a successful check-in.

### Search

A prominent search field with placeholder:

`Search guest or household name...`

Requirements: - Search partial names and household names. - Ignore
leading/trailing spaces. - Use case-insensitive matching. - Debounce
requests if appropriate. - Show a loading indicator while searching. -
Show a useful empty state when no match is found. - Show an error state
if the search fails. - Avoid loading the entire guest list into the
browser if the list can reasonably be searched through Supabase. - Only
return fields necessary for check-in; never expose private notes
unnecessarily.

If a guest has a household/group name, make it visible in results so
ushers can distinguish similar names.

## 7. Guest Verification Panel

When a result is selected, display a clear summary, such as:

-   **Guest:** Mohamed Koroma
-   **Invitation group:** Koroma Family
-   **People invited:** 4
-   **Already checked in:** 2
-   **Remaining allowance:** 2

Use actual database values; the example above is illustrative only.

The usher must be able to choose the number arriving **now**, from 1
through the remaining allowance. Do not allow zero, negative,
fractional, non-numeric, or over-limit values.

Show a confirmation prompt before committing, for example:

> Confirm that 2 members of Koroma Family have arrived?

Provide clear **Confirm Check-In** and **Cancel** actions. Disable
repeated submission while a request is in progress.

If the invitation is fully checked in, show an "Already fully checked
in" state and do not show an actionable check-in button.

If a guest record is inactive or invalid, do not allow check-in.

## 8. Critical Database and Concurrency Rules

**Security and correctness must be enforced server-side/database-side,
not only in React.**

Review the existing Stage 1 database implementation. Reuse a secure
database RPC or implement the smallest necessary migration/function if
one is missing or unsafe.

A check-in operation must be atomic and must:

1.  Require an authenticated staff member.
2.  Verify that the caller has an allowed staff role (`usher` or
    `admin`) using the existing role model.
3.  Verify that the guest exists and is active.
4.  Validate `people_admitted` as an integer greater than zero.
5.  Lock or otherwise safely serialize concurrent updates for the same
    guest.
6.  Re-read the current count inside the transaction.
7.  Reject the operation if the requested count exceeds the remaining
    invitation allowance.
8.  Increment the checked-in count.
9.  Insert a corresponding check-in log with guest, staff member,
    admitted count, and server-side timestamp.
10. Return the authoritative updated guest record and relevant
    attendance totals, or a clear error code/message.

The update and log insertion must succeed or fail together. Do not
update the count in one request and write the log in a separate client
request.

The database must guarantee:

`0 <= checked_in_count <= invited_count`

Use the project's actual column names. Add or preserve database
constraints where appropriate.

Prevent an usher from spoofing another user's ID. Derive the staff
identity from the authenticated Supabase session on the server/database
side; do not trust a `usher_id` supplied by the browser.

Do not expose the Supabase service-role key in frontend code.

Keep RLS enabled and consistent with the existing security model. Verify
that authorized staff can perform the necessary operations and
unauthenticated or unauthorized users cannot read the guest list or
perform check-ins.

If an RPC is used, grant execution only to the appropriate roles and
validate the caller within the function. Use a secure `search_path` and
schema-qualify objects where appropriate.

## 9. Duplicate and Partial Check-In Behavior

Support partial arrivals for an invitation group.

Example: - Invited: 4 - First transaction: 2 admitted - Second
transaction: 1 admitted - Third transaction: 1 admitted - Final total: 4
admitted, 0 remaining

Expected behavior: - If 2 of 4 have arrived, allow at most 2 more. - If
all 4 have arrived, block further admission for that invitation
record. - If two ushers attempt to admit the final available person
simultaneously, only a valid transaction may succeed. The other must
receive a clear "remaining allowance changed; refresh and try again"
response. - Do not optimistically show success before the database
confirms it. - Refresh or update the selected guest and attendance
summary using the authoritative result after each successful
transaction.

If the project already supports idempotency keys, use them
appropriately. Do not introduce a large new idempotency system unless
needed. At minimum, disable repeated clicks while a request is pending
and rely on atomic database validation to prevent over-admission.

## 10. Success, Error, and Loading States

Implement deliberate UI states for:

### Success

Show: - "GUEST CHECKED IN SUCCESSFULLY" - Guest/household name - Number
admitted in this transaction - Updated checked-in count - Updated
remaining allowance - Server-confirmed check-in time if available - A
clear "Back to Search" action

### Already fully checked in

Show: - "ALREADY FULLY CHECKED IN" - Number invited - Number checked
in - A useful prior check-in timestamp if available

### Validation error

Explain what must change, such as selecting a number within the
remaining allowance.

### Authentication/permission error

Do not show raw database internals. Redirect unauthenticated users
through the existing login flow. Explain access denial for an
authenticated user without permission.

### Network/database error

Show a readable failure message and a retry action. Preserve the
selected guest where possible. Never claim the guest was checked in
unless the database confirmed it.

### Loading

Use visible loading feedback during search and submission. Avoid layout
jumps where possible.

Do not expose stack traces, SQL errors, tokens, or secrets in the UI.

## 11. Design Requirements

Follow the existing design system if one is already established.
Otherwise use this visual direction:

-   Midnight Navy: `#101B35`
-   Deep Navy: `#172544`
-   Warm Beige: `#E8DDC9`
-   Champagne Gold: `#C8A96B`
-   White: `#FFFFFF`

Style: elegant, premium, calm, minimal, and easy to read.

Requirements: - Mobile-first layout. - Large touch targets. - High text
contrast. - Search field immediately visible. - One clear primary
action. - Restrained use of gold accents. - Readable guest names and
counts. - Responsive behavior on common Android and iPhone screen
sizes. - Accessible labels, keyboard focus, and clear status messages.

Do not add unnecessary animations, decorative sections, or complex
navigation. The usher should be able to find a guest and check them in
with minimal taps.

## 12. Performance and Data Handling

-   Query only the columns required for this workflow.
-   Paginate or limit search results if needed.
-   Avoid N+1 database requests.
-   Use the existing Supabase client and error-handling conventions.
-   Ensure attendance totals are calculated correctly for active
    invitation records.
-   Do not trust client-calculated remaining capacity during the final
    transaction; the database must recalculate it.
-   Handle deleted, inactive, or changed guest records gracefully.
-   Refresh relevant data after a successful check-in.

## 13. Tests Required

Use the testing framework already installed. If none exists, add only a
minimal appropriate setup and explain the addition.

Cover at least:

1.  Search finds a guest by partial first name.
2.  Search finds a guest by surname or household name.
3.  Search handles case differences and surrounding whitespace.
4.  No-results state is displayed.
5.  A valid check-in succeeds.
6.  A partial check-in leaves the correct remaining count.
7.  A fully checked-in guest cannot receive another check-in.
8.  Zero, negative, fractional, and non-numeric counts are rejected.
9.  A requested count greater than the remaining allowance is rejected.
10. Inactive or missing guests cannot be checked in.
11. Unauthorized and unauthenticated calls are rejected.
12. A successful check-in creates exactly one corresponding log entry.
13. A failed check-in does not create a log entry or change the count.
14. Concurrent check-ins cannot exceed the invitation limit.
15. The UI does not display success on a failed network/database
    response.

Use automated tests for business logic and database integration where
feasible. Clearly document any concurrency/security checks that require
a local Supabase instance or manual verification.

## 14. Manual QA Checklist

Before declaring Stage 2 complete, verify:

-   [ ] Shared QR route opens the correct check-in page.
-   [ ] Login redirects back to check-in correctly.
-   [ ] An usher can search and select a guest.
-   [ ] Guest and household details are clear.
-   [ ] Partial group attendance works.
-   [ ] A fully checked-in invitation is blocked.
-   [ ] Attendance summary updates after a successful transaction.
-   [ ] Duplicate clicks do not create accidental duplicate admissions.
-   [ ] Two simultaneous check-ins cannot exceed the limit.
-   [ ] Unauthorized users cannot access guest data or perform
    check-ins.
-   [ ] Database errors never produce false success messages.
-   [ ] The page is usable on a small mobile screen.
-   [ ] Existing Stage 1 functionality still works.
-   [ ] Production build passes.

## 15. Delivery Requirements

When finished:

1.  Summarize the changes made.
2.  List every file created or modified.
3.  Explain any database migration or RPC added/changed.
4.  Provide exact commands to run the application and tests.
5.  Report build and test results truthfully.
6.  Document any manual Supabase configuration still required.
7.  List any unresolved issues or risks.
8.  Confirm that Stage 1 functionality was preserved.

Do not claim a test passed unless it was actually run.

## 16. Working Rules

-   Work in the existing repository.
-   Do not replace the technology stack.
-   Do not rebuild completed foundation work.
-   Do not invent database columns or roles without checking the
    repository.
-   Do not disable RLS to make the feature work.
-   Do not use the service-role key in the browser.
-   Do not trust client-side validation as the only security control.
-   Do not report success before the database confirms it.
-   Keep scope limited to Stage 2.
-   If you discover a blocker, explain it and propose the smallest safe
    fix.
-   Prefer maintainable, production-minded code over unnecessary
    abstraction.

**Definition of done:** An authorized usher can open the shared QR
destination, search the approved guest list, verify an invitation, check
in all or part of the invited group, and receive an accurate
server-confirmed result---without exceeding the invitation limit or
weakening the existing security model.
