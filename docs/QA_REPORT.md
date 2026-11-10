# No-login release verification

Date: 10 November 2026.

## Automated checks

37 tests passed before the final browser audit; TypeScript and production/portable builds passed. Tests use the actual shared API and real SQLite (rather than a mocked database). Groq responses are mocked. The suite covers:

- All evaluator rules, failure transitions, regressions and gap denominators.
- Blank workspace initialization, secure HttpOnly anonymous cookies and hashed storage identifiers.
- No reuse of the previous authenticated private workspace data.
- Single-case drafts, train/holdout requirements, unknown-field stripping and invalid imports.
- Stale-edit revision rejection without losing existing data.
- Prompt versions and immutable report snapshots.
- Separate browser sessions, report trash and restore.
- Prompt suggestions from saved response evidence after dataset changes.
- Provider connection checks and key exclusion from database records.
- Idempotent live initialization and refusal to compare identical prompts.
- One response per checkpoint, stale-step rejection, provider failures, resumption, and final-call idempotence.
- Empty, invalid, truncated and unreachable provider outputs.
- SQLite persistence across a restart and compare-and-swap semantics.
- Portable HTTP server, static bundle, health endpoint, no-login API and unsupported methods.

## Browser audit

Tested through the application UI using newly entered Arithmetic and Geography tasks, one training case and one holdout case. Responses include one recovery and one deliberate regression. Verified through the browser: empty anonymous workspace; first-case creation; holdout case creation; editing an existing case with two checks; manual evaluation; one recovery and one regression (50% to 50%, not a forced improvement); regression filter and text search; per-case evidence; Escape dismissal; saved-report training-only prompt suggestion; candidate version saving; JSON report download parsed with two cases and one regression; dataset export parsed and re-imported through the file chooser. Invalid JSON-object import was rejected and retained both tasks. The report was moved to recoverable trash and restored. Reload preserved the dataset, candidate version and report. At 390 × 844 CSS pixels, the dashboard rendered and mobile navigation opened Datasets successfully. No valid provider key was supplied, so the provider screen was checked for disabled controls with an empty key; successful real-provider execution remains unverified.

## Limits

No real Groq API key was supplied, so a real provider-backed evaluation remains unverified. No live PostgreSQL database was supplied. Docker and the user's external hosting deployment have not been executed here. Cross-browser, load, penetration and formal accessibility audits were not performed.

No-login sessions are browser-bound. Clearing cookies or moving to a new domain/device opens a new workspace. Keep exports if data must be moved. SQLite needs persistent filesystem storage; use PostgreSQL with DATABASE_URL for persistence on ephemeral hosting.

Checkpoints prevent repeating outputs that were successfully saved. If a network connection fails after the provider accepts a call but before its output is saved, retrying can consume provider quota again. Model-call exact-once billing cannot be guaranteed by this application.

A final combined-build check found and fixed an output-order issue: the framework build cleans dist, so it now runs before the portable frontend build. This preserves dist/public for npm start.
