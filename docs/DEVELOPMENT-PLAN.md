# Development plan — v2

Each phase ends with a **checkpoint**: I show you the result and you approve before the next phase starts. "Done" means every acceptance criterion is met *and* `node tools/validate-data.mjs` has 0 FAIL.

## Phase 0 — Foundation ✅ (this delivery)
Workspace, architecture, verified data model, validator, data tests, validation report.
- [x] 67 lessons / 9 modules reconcile; DPro 255 + 45 = 300 min
- [x] Every platform fact carries label + source + snapshot date
- [x] Discrepancy register D-01…D-08; feasibility checks F-01/F-02
- [x] 31 checks: 0 FAIL; 9/9 tests; all v1 IDs preserved

After review (31 Oct): targets 40/30 = 70 min/day, minimum 30 each (ADR-08). 32 checks: 27 pass · 5 warn · 0 fail; 11/11 data tests.

## Phase 1 — Shell, storage & Data Quality page ✅ (approved 31 Oct 2026)
`index.html`, design tokens, router, store, Local Storage (schema 2), v1 → v2 migration, quarantine of corrupt data, test-mode isolation, Overview (skeleton), **Data Quality** page.
- Opens by double-click (`file://`) and via `localhost` in Chrome/Edge with 0 console errors.
- First run loads `seed.js`; a reload keeps all data.
- A v1 backup (`exam-prep-backup-*.json`, schema 1) restores into v2 with record counts unchanged.
- Corrupt storage is preserved under a recovery key, never deleted.
- Data Quality page lists all sources, 8 discrepancies with status, and the latest validation summary.

Result: 14/14 acceptance tests pass (`tests/e2e_phase1.py`, `tests/phase1-results.json`). See `docs/PHASE-1-REPORT.md`.

## Phase 2 — Curriculum & platform snapshots ✅ (approved 31 Oct 2026)
One curriculum view driven by `certifications[]`; lesson/module personal status; platform snapshot updates with history; discrepancy resolution (status, evidence, date).
- Platform % and personal % shown in separate columns; changing one never changes the other.
- 2% and 50% remain until you record a new snapshot; old snapshots kept.
- Resolving D-02 requires evidence text and keeps the original values.
- Locked DPro items cannot be marked platform-complete.

Result: 14/14 Phase 2 tests, 14/14 Phase 1 regression, 13/13 data tests. See `docs/PHASE-2-REPORT.md`.

## Phase 3 — Planner, Study Log, milestones & feasibility ✅ (awaiting review)
Calendar/week/day views, planned sessions, manual logger, per-day overrides, milestones (suggested vs your dates), live feasibility per milestone.
- Planned minutes never count as study; a plan becomes *Done* only when actual time is logged against it.
- No session is ever created automatically; baseline plan only after confirmation, labelled *Estimated Planning Value*.
- Feasibility recalculates when targets, dates or watched lessons change; shows minutes short/spare.
- Future-dated or 0-minute actual sessions are rejected.

Result: 12/12 Phase 3 tests, 14/14 + 14/14 regression, 10/10 state tests, 14/14 data tests. See `docs/PHASE-3-REPORT.md`.

## Phase 4 — Assessments & exams
Regenerated diagnostic banks (50 + 50), runner (flag, resume, confirmed submit), topic analysis; Mock & Official Exams page with 14 GPM-b tests, 3 DPro tracks, booking status, evidence-gated certification.
- Answer key balanced: each option is correct 10–15 times per bank; every question has a module tag **and** (GPM-b) an exam-domain tag.
- Every question labelled *AI-generated practice question*.
- Historical 83% shown as *Historical*, excluded from readiness by default.
- Certification shows *Obtained* only for an official pass with evidence.

## Phase 5 — Analytics, readiness, backup
Trends, coverage, topic performance, revision priorities; transparent readiness (weights, coverage, confidence); JSON backup/restore, CSV, optional *Save to folder* (OneDrive project folder) with download fallback; backup-age reminder.
- Missing inputs show *Not Assessed* / *Insufficient Data*, never 0%.
- Restore validates everything and changes nothing on any error; confirmation shows current vs incoming counts.
- CSV opens correctly in Excel and neutralises formula injection.

## Phase 6 — QA & release 2.0.0
Port v1's 17 E2E tests + new tests (migration, feasibility, discrepancy workflow), 390 px mobile check, keyboard/focus review, docs, CHANGELOG.
- All E2E tests pass on `file://` and `localhost`; no horizontal scroll at 390 px; all controls keyboard-reachable.
- An independent review (fresh reviewer that has not seen the build) re-checks the data rules against this report.
