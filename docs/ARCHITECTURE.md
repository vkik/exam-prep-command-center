# Architecture — Exam Preparation Command Center 2026 (v2)

Status: **Proposed — awaiting approval before Phase 1.** Date: 31 Oct 2026.

## 1. Constraints that shape everything

| Constraint | Consequence |
|---|---|
| Single user, works offline, often in the field | No backend, no accounts, no network calls. |
| Must open by double-clicking `index.html` (`file://`) | Classic `<script>` files sharing one namespace (`window.ECC`); no ES modules or `fetch()` at runtime. Seed data ships as a generated `.js` file. |
| Project folder lives in **OneDrive/Desktop** | App code syncs between devices automatically; browser Local Storage does **not** — backups remain the sync path. |
| Data integrity rules from the brief | Platform vs personal progress, planned vs actual, labels, conflicts preserved, missing = missing. Enforced in the data model, the validator and the UI. |
| Zero dependencies | Plain HTML/CSS/JS in the app; Node (already on this PC, v22) only for build/validation tools. |

## 2. Layers

```
 data/source/*.json  ── human-edited, provenance on every record (single source of truth)
        │  tools/validate-data.mjs   ← 31 checks; FAIL blocks the build
        ▼  tools/build-seed.mjs
 data/generated/seed.js  (window.ECC_SEED)   + seed.json, validation-results.json
        │
 ┌──────┴──────────────────────────── browser ───────────────────────────────┐
 │ src/core/storage.js   Local Storage (ecc2026.v2.data / .testdata), quarantine │
 │ src/core/migrate.js   v1 (schema 1) → v2 (schema 2), stepwise, never lossy   │
 │ src/core/validate.js  record + backup validation (shared by forms/restore)  │
 │ src/core/store.js     single store; commit(fn,msg) → validate → save → render │
 │ src/core/calc/*.js    PURE: progress, coverage, consistency, feasibility,    │
 │                       readiness, discrepancy status, warnings (never stored) │
 │ src/views/*.js        one file per page: { title, render(host) }             │
 │ src/app.js            boot, hash router, shell, nav                           │
 └──────────────────────────────────────────────────────────────────────────────┘
```

## 3. What changes from v1 (and what is kept)

**Kept** (proven in v1, 17/17 E2E): `file://`-safe classic scripts; single store with `commit`; pure derived calculations; quarantine instead of deletion on corrupt storage; validated, confirmed restore; isolated test mode; CSV with formula-injection guard; record IDs.

**Changed**

| v1 | v2 | Why |
|---|---|---|
| Seed hand-written in `data.js` | JSON source + validator + generated seed | Data can be checked automatically; editing data never touches code. |
| Two certifications hard-coded in views | Views iterate `certifications[]`; curriculum page is one generic view | Adding a third certification = data only. |
| Conflicts as notes on records | **Discrepancy register** (`D-01…`) with status, evidence and resolution workflow | Conflicts become trackable items you can close. |
| Provenance per record only in places | `label` + `source` (registry ID) + `snapshotDate` on every platform fact | Every number on screen can show where it came from. |
| No schedule feasibility | **Feasibility engine** (remaining content vs. time budget to each milestone) | V-43 shows the current GPM-b milestone is not achievable at 30 min/day. |
| Question banks shipped as data | Banks regenerated with a balanced answer key and exam-domain tags (Phase 4) | v1 banks: 80–86 % of answers are option B. |
| — | New **Data Quality** page: source registry, discrepancy register, validation status | Makes the integrity rules visible. |
| — | v1 → v2 migration | Your v1 backups (if any) restore without loss — all 108 v1 IDs are preserved. |
| Backup via Downloads only | Download fallback **plus** optional "Save to folder" (File System Access API, Chrome/Edge) straight into the OneDrive project folder | Removes the manual upload step on supported browsers. |

## 4. Data model (schema version 2)

Source files (`data/source/`):

| File | Contents |
|---|---|
| `program.json` | Labels, **source registry** (5 sources), planning period & targets, readiness defaults, milestones (suggested dates only) |
| `gpmb.json` | Certification (official exam = candidate values, *Not Yet Verified*), course, 9 modules × 67 lessons (durations as shown on the platform, `m:ss`), 14 platform tests, historical Chapter 1 attempt |
| `dpro.json` | Certification (official exam *Verified*, corroborated by PM4NGOs FAQ), course, 5 modules + course exam with platform fields, 3 assessment tracks |
| `discrepancies.json` | Register D-01 … D-08 |

Runtime-only collections (empty in the seed): `plannedSessions`, `actualSessions`, `weeklyReviews`, `assessments`, `questions`, `assessmentAttempts`, `activeAttempt`, platform snapshot history additions, discrepancy resolutions.

Field families that must never mix: `platform*` (as shown by PM-Tricks / Ready CSOD) vs `personal*` (your own status); `plannedMinutes` vs actual `durationMin`; platform time-spent vs study time; historical vs diagnostic vs practice vs official attempts.

## 5. Pages (v2)

01 Overview · 02 Planner (calendar, week, day, milestones, **feasibility**) · 03 Study Log · 04 Curriculum (one view, tab per certification) · 05 Assessments (diagnostics) · 06 Mock & Official Exams · 07 Analytics · 08 Readiness · 09 **Data Quality** (new) · 10 Settings & Backup.

## 6. Folder structure

```
Exam Preparation Command Center 2026/
├── exam-preparation-command-center.zip     original, untouched
├── reference/v1.0.0-build/                 unpacked v1 (read-only reference)
└── ecc2026/                                v2 workspace
    ├── README.md · CHANGELOG.md · package.json (scripts only, no dependencies)
    ├── data/source/        program.json · gpmb.json · dpro.json · discrepancies.json
    ├── data/generated/     seed.js · seed.json · validation-results.json   (never edit)
    ├── data/schema/        (Phase 1: JSON Schema for backups)
    ├── src/core/ · src/views/ · src/styles/   (Phase 1+)
    ├── tools/              lib.mjs · validate-data.mjs · build-seed.mjs
    ├── tests/              data.test.mjs (Phase 6 adds E2E)
    └── docs/               ARCHITECTURE · DATA-VALIDATION-REPORT · DEVELOPMENT-PLAN · DECISIONS
```
