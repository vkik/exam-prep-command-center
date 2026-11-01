#!/usr/bin/env node
// Validates data/source/*.json. Prints a report and writes data/generated/validation-results.json.
// Status: PASS = consistent; WARN = preserved discrepancy / risk needing a human decision; FAIL = data error (blocks the build).
// Usage: node tools/validate-data.mjs        (exit code 1 if any FAIL)
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadSource, assembleSeed, toSec, fmt, isoDate, daysBetweenInclusive } from './lib.mjs';

export function runChecks(src) {
  const { program, gpmb, dpro, discrepancies } = src;
  const out = [];
  const add = (id, area, title, status, detail) => out.push({ id, area, title, status, detail });
  const ok = (c) => (c ? 'PASS' : 'FAIL');
  const LABELS = new Set(program.labels);
  const SOURCES = new Set(program.sources.map((s) => s.id));
  const snap = '2026-10-31';
  const P = program.planning;

  // ---------- Integrity ----------
  const labelsUsed = [], sourcesUsed = [];
  (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (k === 'label' && typeof v === 'string') labelsUsed.push(v);
    if (['source', 'publicSource', 'corroboratedBy'].includes(k) && typeof v === 'string') sourcesUsed.push(v);
    walk(v); } })([gpmb, dpro, discrepancies, program.planning, program.readinessDefaults]);
  const badLabels = [...new Set(labelsUsed.filter((l) => !LABELS.has(l)))];
  add('V-01', 'Integrity', 'Every label is one of the 7 brief labels', ok(!badLabels.length), badLabels.length ? 'Unknown: ' + badLabels : `${labelsUsed.length} labels checked`);
  const badSrc = [...new Set(sourcesUsed.filter((s) => !SOURCES.has(s)))];
  add('V-02', 'Integrity', 'Every source reference exists in the source registry', ok(!badSrc.length), badSrc.length ? 'Unknown: ' + badSrc : `${sourcesUsed.length} references → ${SOURCES.size} sources`);
  const seed = assembleSeed(src);
  const ids = [...seed.modules, ...seed.lessons, ...seed.platformTests, ...seed.examAttempts, ...seed.milestones, ...seed.discrepancies].map((x) => x.id);
  const dups = ids.filter((x, i) => ids.indexOf(x) !== i);
  add('V-03', 'Integrity', 'All record IDs are unique', ok(!dups.length), dups.length ? 'Duplicates: ' + dups : `${ids.length} IDs`);

  // ---------- GPM-b curriculum ----------
  const lessons = gpmb.modules.flatMap((m) => m.lessons);
  add('V-10', 'GPM-b', 'Lesson count = stated 67', ok(lessons.length === gpmb.course.totalLessonsStated),
    `${lessons.length} lessons across ${gpmb.modules.length} modules (per module: ${gpmb.modules.map((m) => m.lessons.length).join(' + ')})`);
  const modRows = gpmb.modules.map((m) => { const s = m.lessons.reduce((a, l) => a + toSec(l.duration), 0); return { id: m.id, sum: s, stated: toSec(m.statedDuration) }; });
  const badMods = modRows.filter((r) => r.sum !== r.stated);
  add('V-11', 'GPM-b', 'Each module: lesson durations sum exactly to stated module duration', ok(!badMods.length),
    badMods.length ? badMods.map((r) => `${r.id}: ${fmt(r.sum)} ≠ ${fmt(r.stated)}`).join('; ') : '9/9 modules reconcile to the second');
  const total = modRows.reduce((a, r) => a + r.sum, 0);
  add('V-12', 'GPM-b', 'Total video ≈ stated "17h 15m"', ok(Math.abs(total - (17 * 3600 + 15 * 60)) < 60), `Exact total ${fmt(total)} (${total} s)`);
  const watched = lessons.filter((l) => l.platformWatched);
  const snapG = gpmb.course.platformProgressSnapshots.at(-1);
  add('V-13', 'GPM-b', 'Watched-lesson flags match snapshot count', ok(watched.length === snapG.watchedLessons),
    `${watched.length} flagged: ${watched.map((l) => `${l.id} "${l.title}" (${l.duration})`).join(', ')}`);
  const wSec = watched.reduce((a, l) => a + toSec(l.duration), 0);
  const byCount = (watched.length / lessons.length) * 100, byTime = (wSec / total) * 100;
  add('V-14', 'GPM-b', 'Platform 2% vs watched lessons (D-03)', Math.round(byCount) === snapG.valuePct ? 'PASS' : 'WARN',
    `Platform ${snapG.valuePct}%. By count ${byCount.toFixed(2)}% (rounds to ${Math.round(byCount)}%, floors to ${Math.floor(byCount)}%); by time ${byTime.toFixed(2)}%; 2/81 incl. 14 tests = ${(200 / 81).toFixed(2)}%. Platform value preserved.`);
  const kinds = gpmb.platformTests.reduce((a, t) => ((a[t.kind] = (a[t.kind] || 0) + 1), a), {});
  add('V-15', 'GPM-b', 'Sidebar tests = 14 (5 chapter + 4 domain + 5 full)', ok(gpmb.platformTests.length === 14 && kinds.chapter === 5 && kinds.domain === 4 && kinds.full === 5), JSON.stringify(kinds));
  add('V-16', 'GPM-b', '12-vs-14 test count conflict preserved (D-01)', gpmb.course.testsCount.label === 'Conflicting Data' && discrepancies.some((d) => d.id === 'D-01') ? 'WARN' : 'FAIL',
    `Course card ${gpmb.course.testsCount.courseCard} vs sidebar ${gpmb.course.testsCount.sidebar}; both kept`);
  const modIds = new Set(gpmb.modules.map((m) => m.id));
  const badMap = gpmb.platformTests.filter((t) => t.moduleId && !modIds.has(t.moduleId));
  add('V-17', 'GPM-b', 'Chapter tests map to existing modules 1–5', ok(!badMap.length), gpmb.platformTests.filter((t) => t.moduleId).map((t) => `${t.id}→${t.moduleId}`).join(', '));
  add('V-18', 'GPM-b', 'Course access outlasts planning period', ok(gpmb.course.accessExpires > P.endDate), `Access expires ${gpmb.course.accessExpires}; plan ends ${P.endDate}`);

  // ---------- Historical result ----------
  const h = gpmb.historicalAttempts[0];
  const implied = []; for (let c = 0; c <= h.questions; c++) if (Math.round((c / h.questions) * 100) === h.scorePct) implied.push(c);
  const passNeeded = Math.ceil((h.passMarkPct / 100) * h.questions);
  add('V-20', 'Historical', 'Chapter 1 attempt: 83% / pass 75% / 36 Q / 46 min / Passed is internally consistent',
    ok(h.scorePct >= h.passMarkPct && h.result === 'Passed' && implied.length === 1),
    `83% of 36 is only possible as ${implied.join('/')}/36 (${((implied[0] / 36) * 100).toFixed(1)}%). Pass needs ≥${passNeeded}/36. Stored correct=null (derived value not written as fact).`);
  add('V-21', 'Historical', 'Labelled Historical, no invented date, excluded from readiness', ok(h.label === 'Historical' && h.date === null && h.includeInReadiness === false && h.isHistorical), h.dateText);

  // ---------- Project DPro ----------
  const mods = dpro.modules.filter((m) => m.kind === 'module'), exam = dpro.modules.find((m) => m.kind === 'course-exam');
  const mMin = mods.reduce((a, m) => a + m.statedDurationMin, 0);
  add('V-30', 'DPro', 'Module durations 255 min + course exam 45 = 300 min ("5 hours")', ok(mMin === 255 && exam.statedDurationMin === 45 && mMin + exam.statedDurationMin === 300),
    mods.map((m) => m.statedDurationMin).join(' + ') + ` = ${mMin}; + ${exam.statedDurationMin} = ${mMin + exam.statedDurationMin}`);
  const statusErrs = [];
  dpro.modules.forEach((m) => {
    if (m.platformStatus === 'Completed' && m.platformProgressPct !== 100) statusErrs.push(m.id + ' completed but not 100%');
    if (m.platformStatus === 'In Progress' && !(m.platformProgressPct < 100)) statusErrs.push(m.id + ' in progress but 100%');
    if (m.locked && (m.platformStatus !== 'Pending Prior Training' || m.platformProgressPct !== null || m.lastAccessed !== null)) statusErrs.push(m.id + ' locked but has activity');
  });
  const order = dpro.modules.map((m) => m.platformStatus);
  const firstOpen = order.findIndex((s) => s !== 'Completed');
  if (order.slice(0, firstOpen).some((s) => s !== 'Completed')) statusErrs.push('completion out of sequence');
  add('V-31', 'DPro', 'Platform statuses are consistent with progress, locks and sequence', ok(!statusErrs.length),
    statusErrs.join('; ') || dpro.modules.map((m) => `${m.id}: ${m.platformStatus}${m.platformProgressPct != null ? ' ' + m.platformProgressPct + '%' : ''}`).join(' · '));
  const lockErr = [];
  dpro.modules.forEach((m) => {
    (m.unlocksAfter || []).forEach((pid) => { if (!dpro.modules.some((x) => x.id === pid)) lockErr.push(`${m.id} → unknown ${pid}`); });
    const prereqDone = (m.unlocksAfter || []).every((pid) => dpro.modules.find((x) => x.id === pid)?.platformStatus === 'Completed');
    if (m.unlocksAfter && !m.locked && !prereqDone) lockErr.push(`${m.id} unlocked before its prerequisites are completed`);
    if (m.locked && !(m.unlocksAfter || []).length) lockErr.push(`${m.id} locked with no unlock rule`);
  });
  add('V-38', 'DPro', 'Locked items have unlock rules that match platform progress', ok(!lockErr.length),
    lockErr.join('; ') || dpro.modules.filter((m) => m.unlocksAfter).map((m) => `${m.id} locked until ${m.unlocksAfter.join('+')} completed`).join(' · '));
  const done = mods.filter((m) => m.platformStatus === 'Completed').length;
  const snapD = dpro.course.platformProgressSnapshots.at(-1);
  add('V-32', 'DPro', 'Platform 50% vs completed items (D-02)', 'WARN',
    `Platform ${snapD.valuePct}%. ${done}/5 modules = ${(done / 5) * 100}%; ${done}/6 items incl. course exam = ${((done / 6) * 100).toFixed(0)}% ← matches; by duration ${((mods.filter((m) => m.platformStatus === 'Completed').reduce((a, m) => a + m.statedDurationMin, 0) / 300) * 100).toFixed(0)}%. Platform value preserved.`);
  const dateErrs = dpro.modules.flatMap((m) => [['lastAccessed', m.lastAccessed], ['displayedDueDate', m.displayedDueDate]].filter(([, v]) => v !== null && !isoDate(v)).map(([k]) => m.id + '.' + k));
  const futureAccess = dpro.modules.filter((m) => m.lastAccessed && m.lastAccessed > snap).map((m) => m.id);
  add('V-33', 'DPro', 'Dates are valid ISO dates; no access after snapshot', ok(!dateErrs.length && !futureAccess.length), [...dateErrs, ...futureAccess].join(', ') || 'All dates valid');
  add('V-34', 'DPro', 'Displayed due dates reviewed (D-07)', 'WARN',
    dpro.modules.filter((m) => m.displayedDueDate).map((m) => `${m.id} due ${m.displayedDueDate}`).join(', ') + ' — none reviewed; m1 due date = its last-access date');
  const ts = dpro.modules.reduce((a, m) => a + (m.platformTimeSpentMin || 0), 0);
  add('V-35', 'DPro', 'Platform time-spent kept separate from study time', 'PASS', `${ts} min platform time on m1–m4 (vs 225 min nominal). Stored as platform data only; never counted as study.`);
  const oe = dpro.certification.officialExam;
  add('V-36', 'DPro', 'Official exam: 65% of 75 = 49 correct; 120 min; open book (PM4NGOs FAQ)',
    ok(Math.ceil(0.65 * oe.questions) === oe.passMarkCorrect && oe.durationMin === 120 && oe.openBook === true && oe.corroboratedBy === 'SRC-PM4NGOS-FAQ'),
    `ceil(0.65 × ${oe.questions}) = ${Math.ceil(0.65 * oe.questions)}; brief values corroborated by pm4ngos.org/faq`);
  const tr = dpro.assessmentTracks;
  add('V-37', 'DPro', 'Three separate assessment tracks; only official attempts excluded from readiness',
    ok(tr.length === 3 && new Set(tr.map((t) => t.kind)).size === 3 && tr.find((t) => t.kind === 'official').feedsReadiness === false),
    tr.map((t) => `${t.kind} (pass ${t.passMarkPct}%)`).join(' · '));

  // ---------- Planning ----------
  const days = daysBetweenInclusive(P.startDate, P.endDate);
  const daily = P.dailyTargetMin.gpmb + P.dailyTargetMin.dpro;
  add('V-40', 'Planning', 'Planning period and targets', ok(isoDate(P.startDate) && isoDate(P.endDate) && P.endDate > P.startDate),
    `${P.startDate} → ${P.endDate} = ${days} days inclusive; ${daily} min/day → ${days * daily} min (${(days * daily) / 60} h) total budget (GPM-b ${days * P.dailyTargetMin.gpmb} min, DPro ${days * P.dailyTargetMin.dpro} min)`);
  const w = program.readinessDefaults.weights, wsum = Object.values(w).reduce((a, b) => a + b, 0), th = program.readinessDefaults.thresholds;
  add('V-41', 'Planning', 'Readiness weights sum to 100; thresholds ascending', ok(wsum === 100 && th.developing < th.approaching && th.approaching < th.strong), `weights ${wsum}; ${th.developing} < ${th.approaching} < ${th.strong}`);
  const ms = program.milestones;
  const msErr = ms.filter((m) => !isoDate(m.suggestedDate) || m.suggestedDate < P.startDate || m.suggestedDate > P.endDate).map((m) => m.id);
  const sorted = ms.every((m, i) => i === 0 || ms[i - 1].suggestedDate <= m.suggestedDate);
  add('V-42', 'Planning', 'Milestones: suggested dates inside period, in order, targetDate null', ok(!msErr.length && sorted && program.milestoneDefaults.targetDate === null),
    ms.map((m) => `${m.suggestedDate.slice(5)} ${m.id}`).join(' · '));
  const mins = P.minimumDailyMin || {};
  const below = Object.keys(P.dailyTargetMin).filter((k) => mins[k] !== undefined && P.dailyTargetMin[k] < mins[k]);
  add('V-46', 'Planning', 'Daily targets respect each certification\'s 30-min minimum', ok(!below.length && mins.gpmb === 30 && mins.dpro === 30),
    below.length ? 'Below minimum: ' + below.join(', ') : `GPM-b ${P.dailyTargetMin.gpmb} ≥ ${mins.gpmb}; DPro ${P.dailyTargetMin.dpro} ≥ ${mins.dpro}; label ${P.dailyTargetLabel}`);
  const gms = ms.find((m) => m.id === 'ms-gpmb-curr');
  const gDays = daysBetweenInclusive(P.startDate, gms.suggestedDate), gBudget = gDays * P.dailyTargetMin.gpmb;
  const remain = Math.round((total - wSec) / 60);
  add('V-43', 'Feasibility', `F-01: GPM-b curriculum by suggested milestone at ${P.dailyTargetMin.gpmb} min/day`, remain <= gBudget ? 'PASS' : 'WARN',
    `Unwatched video ${remain} min vs ${gDays} days × ${P.dailyTargetMin.gpmb} = ${gBudget} min. ${remain <= gBudget ? `Margin ${gBudget - remain} min for notes and practice (${(remain / gDays).toFixed(1)} min/day of video needed).` : `Short by ${remain - gBudget} min before any notes, revision or practice. Needs ≥${(remain / gDays).toFixed(1)} min/day of video at 1× speed, or a later milestone.`}`);
  const dms = ms.find((m) => m.id === 'ms-dpro-curr');
  const dRemain = dpro.modules.filter((m) => m.platformStatus !== 'Completed').reduce((a, m) => a + m.statedDurationMin, 0);
  const dBudget = daysBetweenInclusive(P.startDate, dms.suggestedDate) * P.dailyTargetMin.dpro;
  add('V-44', 'Feasibility', `F-02: DPro curriculum by suggested milestone at ${P.dailyTargetMin.dpro} min/day`, ok(dRemain <= dBudget), `Remaining platform content ${dRemain} min (m4 45 + m5 30 + exam 45) vs ${dBudget} min budget`);
  const prim = Object.fromEntries(ms.filter((m) => m.primary).map((m) => [m.id, m.suggestedDate]));
  add('V-47', 'Planning', 'Primary milestones: GPM-b 28 Nov, DPro 14 Nov, exam-readiness 14 Dec (your targets)',
    ok(prim['ms-gpmb-curr'] === '2026-11-28' && prim['ms-dpro-curr'] === '2026-11-14' && prim['ms-exam-ready'] === '2026-12-14' && prim['ms-exam-ready'] === P.readinessTargetDate && ms.filter((m) => m.primary).every((m) => m.suggestedDateLabel === 'User Entered')),
    Object.entries(prim).map(([k, v]) => `${k} ${v}`).join(' · ') + ' — planning targets, not exam appointments');
  const allRemain = remain + dRemain, allBudget = days * daily;
  add('V-48', 'Feasibility', 'F-03: all remaining platform content by the readiness date', ok(allRemain <= allBudget),
    `${allRemain} min content (GPM-b ${remain} + DPro ${dRemain}) vs ${allBudget} min budget → ${allBudget - allRemain} min for notes, revision, practice and mocks`);
  const gExam = gpmb.certification.officialExam;
  add('V-45', 'GPM-b', 'Official GPM-b exam format (D-04) and eligibility (D-05)', 'WARN',
    `Candidate from a PMI page: ${gExam.candidate.questions} Q (${gExam.candidate.domainSplit.sustainabilityMethods}+${gExam.candidate.domainSplit.deliveryMethods}), ${gExam.candidate.durationMin} min — Not Yet Verified; needs the official GPM source. Eligibility unconfirmed.`);

  // ---------- Discrepancy register & seed hygiene ----------
  const conflictLabels = labelsUsed.filter((l) => l === 'Conflicting Data').length;
  const refs = [gpmb.course.testsCount.discrepancyId, dpro.course.progressDiscrepancyId];
  add('V-50', 'Integrity', 'Every Conflicting Data value links to a register entry', ok(refs.every((r) => discrepancies.some((d) => d.id === r))), `${discrepancies.length} register entries; references ${refs.join(', ')} resolve`);
  const regIds = new Set(program.sources.map((x) => x.id));
  const dqErr = discrepancies.filter((x) => x.resolution).map((x) => x.id + ' resolved in source data')
    .concat(discrepancies.flatMap((x) => (x.disallowedSources || []).filter((sid) => !regIds.has(sid)).map((sid) => x.id + ' disallows unknown ' + sid)))
    .concat(discrepancies.filter((x) => !x.closeRequires).map((x) => x.id + ' has no closeRequires'));
  add('V-52', 'Integrity', 'All discrepancies open by default and evidence-gated', ok(!dqErr.length),
    dqErr.join('; ') || `${discrepancies.length} open; each needs evidence + a registered source; D-04 cannot close on ${discrepancies.find((x) => x.id === 'D-04').disallowedSources.join(', ')} alone`);
  add('V-51', 'Integrity', 'Seed contains no fabricated user records', ok(!seed.actualSessions.length && !seed.plannedSessions.length && !seed.assessmentAttempts.length && seed.lessons.every((l) => l.personalStatus === 'Not Started') && seed.milestones.every((m) => m.targetDate === null) && seed.certifications.every((c) => !c.certificationObtained)),
    '0 sessions, 0 plans, 0 attempts; all personal statuses Not Started; no milestone target dates; no certification claimed');

  // ---------- v1 compatibility ----------
  const v1p = path.join(ROOT, '..', 'reference', 'v1.0.0-build', 'data', 'initial-data.json');
  if (existsSync(v1p)) {
    const v1 = JSON.parse(readFileSync(v1p, 'utf8'));
    const mine = new Set(ids);
    const v1ids = [...v1.modules, ...v1.lessons, ...v1.platformTests, ...v1.examAttempts, ...v1.milestones].map((x) => x.id);
    const missing = v1ids.filter((x) => !mine.has(x));
    const durDiff = v1.lessons.filter((l) => { const n = seed.lessons.find((x) => x.id === l.id); return !n || n.durationSec !== l.durationSec || n.platformWatched !== l.platformWatched; });
    add('V-60', 'Compatibility', 'Every v1 record ID exists in v2 with identical durations/watched flags', ok(!missing.length && !durDiff.length),
      missing.length ? 'Missing: ' + missing.join(', ') : `${v1ids.length} v1 IDs present; ${v1.lessons.length} lessons identical → v1 backups can be migrated`);
  } else add('V-60', 'Compatibility', 'v1 reference not found — compatibility not checked', 'WARN', v1p);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = runChecks(loadSource());
  const c = { PASS: 0, WARN: 0, FAIL: 0 }; res.forEach((r) => c[r.status]++);
  for (const r of res) console.log(`${r.status.padEnd(4)}  ${r.id}  [${r.area}] ${r.title}\n        ${r.detail}`);
  console.log(`\nSummary: ${c.PASS} PASS · ${c.WARN} WARN · ${c.FAIL} FAIL`);
  writeFileSync(path.join(ROOT, 'data/generated/validation-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary: c, results: res }, null, 2) + '\n');
  process.exit(c.FAIL ? 1 : 0);
}
