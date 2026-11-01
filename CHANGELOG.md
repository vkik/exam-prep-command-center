# Changelog

## [2.0.0-phase3.3] — 2026-10-31
### Changed
- Refined "Academic Focus & Clarity" theme: Slate-50 canvas, white cards with soft borders and gentle shadow (no dark fills in content), deep navy sidebar with muted nav text and a white-on-navy active pill, slate typography scale, Sky-600 primary buttons/active tabs, white outline secondary buttons, white inputs and tables with slate borders and a sky focus ring. See `docs/THEME.md`.
- Contrast audit now separates the owner-accepted white-on-#0284C7 button labels (4.10:1) from unexpected failures (0).

## [2.0.0-phase3.2] — 2026-10-31
### Changed
- New light theme “Academic Focus & Clarity”: Snow Grey canvas (60%), Navy sidebar/cards/panels/text (30%), Sky Blue accent (10%). Scoped tokens keep every text colour at WCAG AA on both the canvas and navy surfaces; semantic badge/alert meanings preserved. See `docs/THEME.md`.
- Primary buttons and canvas links use the hover shade #0369A1 because #0284C7 cannot carry small text at AA (4.10:1 with white).
### Added
- `tests/contrast_audit.py` (axe-core colour-contrast on 17 page, dialog and toast states): 0 violations.

## [2.0.0-phase3.1] — 2026-10-31
### Changed
- “Log platform snapshot” (PM-Tricks and Ready CSOD) now opens pre-filled from the latest snapshot: overall %, source platform, every module's status / % / time / last accessed / lock, and every watched lesson. Only the capture date (today) and evidence are new each time.
- Fields you change are highlighted, and a live “Changes since the last snapshot” list shows exactly what will differ (or that this is a confirmation reading).
- Still append-only: saving adds a new snapshot; earlier snapshots are never edited (test P2-14).

## [2.0.0-phase3] — 2026-10-31
### Added
- Study Planner: Day, Week and Planning-window views; editable default and per-day targets; planned sessions (add, edit, skip, delete); rescheduling of missed/skipped plans (single and bulk); milestones with your own dates and status.
- Study Log: manual entry with required/optional fields, filters, totals split video vs other study, edit/delete.
- Live feasibility with video/content vs notes-revision-practice buffer; new F-03 (both certifications by 14 Dec); overall exam-readiness milestone.
- `tests/state.test.mjs` (app state logic in Node), Phase 3 E2E suite (12 tests); validator V-47, V-48.
### Changed
- A per-day target below 30 min is now an error (was a warning); v1 imports archive such values.
- Overview shows actual vs planned study separately; top bar shows today's actual / target.

## [2.0.0-phase2] — 2026-10-31
### Added
- Curriculum page (GPM-b and Project DPro tabs): platform and personal columns side by side, per-lesson/module status, module bulk set with confirmation, displayed-due-date review.
- Platform snapshot logging with capture date, source platform and evidence; append-only history; GPM-b watched-lesson checklist; DPro per-module states.
- D-03 recheck evaluator (four rules) on the Data Quality page.
- Close-with-evidence and reopen for discrepancies; add a new source while closing.
- `src/core/actions.js`; validator checks V-38 (lock rules) and V-52 (open by default, evidence-gated); Phase 2 E2E suite (14 tests).
### Changed
- Store refuses: completing a locked item, unlocking before prerequisites, snapshots without provenance, closures without evidence/registered source, D-04 closure on the PMI page.
- Dialogs close on page navigation; required-field markers fixed.

## [2.0.0-phase1] — 2026-10-31
### Added
- App shell (`index.html`, router, sidebar/drawer), Overview, Data Quality page, Settings & Backup, placeholders for Phases 2–5.
- Storage under `ecc2026.v2.*` (v1 key read-only), quarantine of unreadable data, commit-time validation with rollback, test mode.
- v1 → v2 migration (backup file or v1 data in this browser) with record-count comparison; old AI question banks archived.
- Live workload and milestone feasibility.
- Phase 1 E2E suite (14 tests) and Phase 1 report.
### Changed
- Daily targets 40 (GPM-b) + 30 (Project DPro) = 70 min/day, *User Entered*; 30-min minimum per certification (validator V-46).
- Discrepancy register: evidence required to close; D-04 requires the official GPM source; D-03 baseline observation recorded.

## [2.0.0-phase0] — 2026-10-31
### Added
- v2 workspace; verified source data (schema 2) for GPM-b and Project DPro with per-record provenance and a source registry.
- Discrepancy register D-01…D-08 (adds D-03 PM-Tricks 2% rounding, D-04 public GPM-b exam format, D-05 eligibility, D-06 naming, D-07 M1 due date, D-08 v1 answer-key skew).
- Validator (31 checks), seed builder, data tests (9).
- Architecture, validation report, development plan, decision log.
