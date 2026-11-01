# Exam Preparation Command Center 2026

A personal, offline-first study planner and tracker for **GPM-b** (PM-Tricks CSPP Preparation Course) and **Project DPro Foundation** (Ready CSOD Project Management Essentials Certificate + PM4NGOs exam). Plain HTML/CSS/JavaScript — no build step, no server, no accounts.

**Open the app:** the GitHub Pages link of this repository (works on phone and PC), or double-click `index.html` locally.

## Privacy
This repository contains **only** the application, the verified course reference data (`data/`), and tools/tests. **No personal study records are stored here**: everything you log is saved in your own browser on your own device. Backups you export are personal files and are excluded by `.gitignore`.

## Moving records between devices
See [`docs/SYNC.md`](docs/SYNC.md) — export a JSON backup on one device, restore it on the other.

## Status
Phases 1–3 complete (shell & storage, curriculum & platform snapshots, planner, study log, milestones & live feasibility). Assessments, exams, analytics and readiness are planned for later phases. Design notes: `docs/ARCHITECTURE.md`, `docs/THEME.md`.

## For maintenance
`node tools/validate-data.mjs` · `node tools/build-seed.mjs` · `node --test tests/data.test.mjs tests/state.test.mjs`
