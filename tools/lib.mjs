// Shared helpers: load source data, parse durations, assemble the app seed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

export function loadSource() {
  return {
    program: read('data/source/program.json'),
    gpmb: read('data/source/gpmb.json'),
    dpro: read('data/source/dpro.json'),
    discrepancies: read('data/source/discrepancies.json'),
  };
}

/** "24:57" -> 1497, "1:19:55" -> 4795 */
export function toSec(s) {
  if (typeof s !== 'string' || !/^\d+(:\d{2}){1,2}$/.test(s)) throw new Error('Bad duration: ' + s);
  return s.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
}
export const fmt = (sec) => `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m ${String(sec % 60).padStart(2, '0')}s`;
export const isoDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
export const daysBetweenInclusive = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** Build the store-shaped seed the app loads on first run. Personal fields get neutral defaults; nothing is invented. */
export function assembleSeed(src) {
  const { program, gpmb, dpro, discrepancies } = src;
  const personal = { personalStatus: 'Not Started', personalUpdatedAt: null };
  const modules = [], lessons = [];
  for (const m of gpmb.modules) {
    const { lessons: ls, statedDuration, ...rest } = m;
    modules.push({ ...rest, certificationId: 'gpmb', courseId: gpmb.course.id, kind: 'module', durationSec: toSec(statedDuration), ...personal });
    for (const l of ls) lessons.push({ ...l, moduleId: m.id, certificationId: 'gpmb', courseId: gpmb.course.id,
      durationSec: toSec(l.duration), source: m.source, snapshotDate: m.snapshotDate, label: m.label, ...personal, completedAt: null });
  }
  for (const m of dpro.modules) {
    const { statedDurationMin, ...rest } = m;
    modules.push({ ...rest, certificationId: 'dpro', courseId: dpro.course.id, durationSec: statedDurationMin * 60, ...personal });
  }
  return {
    schemaVersion: program.schemaVersion,
    dataVersion: program.dataVersion,
    sources: program.sources,
    settings: { ...program.planning, readiness: program.readinessDefaults, dailyTargetOverrides: {} },
    labels: program.labels,
    certifications: [{ ...gpmb.certification }, { ...dpro.certification }],
    courses: [{ ...gpmb.course, certificationId: 'gpmb' }, { ...dpro.course, certificationId: 'dpro' }],
    modules, lessons,
    platformTests: [
      ...gpmb.platformTests.map((t) => ({ ...t, certificationId: 'gpmb' })),
      ...dpro.assessmentTracks.map((t) => ({ ...t, certificationId: 'dpro' })),
    ],
    examAttempts: [...gpmb.historicalAttempts.map((a) => ({ ...a, certificationId: 'gpmb' })), ...dpro.historicalAttempts.map((a) => ({ ...a, certificationId: 'dpro' }))],
    discrepancies: discrepancies.map((d) => ({ ...d })),
    milestones: program.milestones.map((m) => ({ ...program.milestoneDefaults, ...m, completedAt: null, evidence: '' })),
    plannedSessions: [], actualSessions: [], weeklyReviews: [],
    assessments: [], questions: [], assessmentAttempts: [], activeAttempt: null,
    archive: { v1QuestionBanks: [] },
    importLog: [],
  };
}
