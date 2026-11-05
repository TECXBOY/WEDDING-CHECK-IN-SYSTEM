# STAGE 5 — Shared QR Assets, Hardening & Release Checklist

Follow `THW26_RULES.md`. Start only after the owner approved Stage 4.

## 1. Shared invitation QR (one code for every invitation)

- It must encode exactly `https://<FINAL-PRODUCTION-DOMAIN>/register`. **Ask the owner for the final production domain if it is not already configured. Never guess it. Never use localhost, a preview/branch URL or a temporary hosting URL.**
- No query parameters, no guest data, no per-household value.
- Regenerate PNG (high resolution), SVG (vector) and a print-ready PDF only if they are wrong or missing; otherwise keep the existing ones.
- Print quality: error-correction level Q or H, quiet zone ≥ 4 modules, dark-on-light with strong contrast, recommended printed size ≥ 3 cm wide, vector PDF for the printer.
- **Prove it:** decode the PNG, SVG and PDF with an actual QR decoder and print the decoded text for each. All three must match the production URL character for character. Also open that URL over HTTPS and confirm `/register` loads with no login and no reference code.
- The individual admission-pass QR style must be clearly different from this one and must never be used on invitations.
- Give the owner a short note for Canva: where to place the QR and the minimum size/margins. The owner designs the card; you don't.

## 2. Security hardening pass
- Search the repo, built frontend bundle and git history for service-role keys or other secrets. Rotate anything exposed and tell the owner.
- Confirm RLS/authorization on every table and endpoint touched in stages 2–4 with a test per role: anonymous, household access-link holder, staff, admin.
- Confirm rate limiting on `/register` and recovery in the production configuration.
- Confirm security headers/CORS are set to the production domain only.
- Confirm that guest data is not exposed by any public endpoint, error message or QR.

## 3. Event-day reliability (list what you found, fix only what is small and safe)
- Free-tier cold starts on the API host: measure the first-request delay; propose a warm-up step before the event.
- Free-tier database inactivity pausing: confirm how it is prevented or checked before the event.
- Camera needs HTTPS: confirm on a real Android phone and a real iPhone.
- Phones on poor mobile data: confirm the scanner error state when offline.
- Backups: export guests, households, registrations, passes and attendance to CSV; confirm the printable emergency list works; document how to restore.

## 4. Dress-rehearsal data & test plan
- Use a **staging copy**, never production. Seed ~120 attendees across ~35 households with a mix of exact matches, ambiguous names, no-match names, and partial households.
- Write a one-page test script the owner can follow with real phones: scan the shared QR → register → receive passes → staff scan → duplicate scan → revoked pass → manual fallback → admin dashboard numbers → CSV export.
- After the rehearsal, give the owner the exact steps to **clear test data** from production (or confirm testing never touched it).

## 5. Usher / staff cheat-sheet
One page, plain language: how to log in, how to scan, what green/yellow/red/warning/error mean, what to do when the phone has no signal, how to use manual search, and who to call.

## Final deliverable: Release Report
Use the Stage Report format plus:
- A launch checklist with every item marked done / not done / owner action.
- The decoded QR proof for PNG, SVG and PDF.
- A rollback/recovery plan and a feature-freeze reminder (suggested: frozen by 1 Dec, rehearsal 6–10 Dec).
- Remaining risks, ranked.

**Stop and wait for the owner's final sign-off.**
