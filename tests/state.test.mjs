// State-logic tests: loads the app's own browser modules into Node (no browser needed) and exercises
// targets, planned vs actual, manual-only logging, rescheduling and the live feasibility math.
// Run: node --test tests/state.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['data/generated/seed.js', 'src/core/ui.js', 'src/core/validate.js', 'src/core/migrate.js', 'src/core/storage.js', 'src/core/store.js', 'src/core/calc.js', 'src/core/actions.js'];

function boot(today = '2026-10-31') {
  const mem = {};
  const ctx = {
    console, Date, JSON, Math, Object, Array, Number, String, isNaN, setTimeout,
    localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } },
    document: { getElementById: () => null, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
  };
  ctx.window = ctx; ctx.ECC = { __fakeToday: today };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.ECC.store.init();
  return { E: ctx.ECC, mem };
}
const feas = (E, id) => E.calc.feasibility().find((f) => f.id === id);
const okLog = (o = {}) => ({ certificationId: 'gpmb', date: '2026-10-31', durationMin: 35, studyType: 'Video', moduleId: 'gpmb-m1', topic: 'Evolution of models', notes: 'Watched and summarised', ...o });

test('defaults: 40 + 30 = 70 min/day; 45-day budget 3150 min', () => {
  const { E } = boot();
  assert.deepEqual({ ...E.store.data.settings.dailyTargetMin }, { gpmb: 40, dpro: 30 });
  const w = E.calc.workload();
  assert.equal(w.defaultDaily, 70); assert.equal(w.days, 45); assert.equal(w.totalMin, 3150);
});

test('targets below 30 min are refused by action AND by direct commit; ≥30 accepted', () => {
  const { E } = boot();
  assert.equal(E.actions.setDailyTargets({ gpmb: 29, dpro: 30 }).ok, false);
  assert.equal(E.actions.setDailyTargets({ gpmb: 40, dpro: 0 }).ok, false);
  assert.equal(E.store.commit((d) => { d.settings.dailyTargetMin.dpro = 25; }), false);
  assert.equal(E.actions.setDayTarget('2026-11-02', { gpmb: 20 }).ok, false);
  assert.equal(E.store.commit((d) => { d.settings.dailyTargetOverrides['2026-11-02'] = { gpmb: 10 }; }), false);
  assert.deepEqual({ ...E.store.data.settings.dailyTargetMin }, { gpmb: 40, dpro: 30 });
  assert.equal(E.actions.setDailyTargets({ gpmb: 45, dpro: 30 }).ok, true);
  assert.equal(E.store.data.settings.dailyTargetLabel, 'User Entered');
});

test('feasibility math: F-01 1160/988/+172, F-02 450/120/+330, F-03 3150/1108/+2042', () => {
  const { E } = boot();
  const f1 = feas(E, 'F-01'), f2 = feas(E, 'F-02'), f3 = feas(E, 'F-03');
  assert.deepEqual([f1.days, f1.budget, f1.videoMin, f1.margin], [29, 1160, 988, 172]);
  assert.deepEqual([f2.days, f2.budget, f2.videoMin, f2.margin], [15, 450, 120, 330]);
  assert.deepEqual([f3.days, f3.budget, f3.videoMin, f3.margin], [45, 3150, 1108, 2042]);
  assert.equal(Math.round(f1.bufferPct), 15);
});

test('feasibility recomputes live from targets, per-day targets, platform data and your milestone dates', () => {
  const { E } = boot();
  E.actions.setDailyTargets({ gpmb: 45, dpro: 30 });
  assert.equal(feas(E, 'F-01').budget, 29 * 45);                     // 1305
  assert.equal(feas(E, 'F-03').budget, 45 * 75);                     // 3375
  E.actions.setDayTarget('2026-11-01', { gpmb: 60 });
  assert.equal(feas(E, 'F-01').budget, 29 * 45 + 15);                // 1320
  // one more lesson watched on the platform (Course Agenda 1:43) reduces remaining video
  const ids = E.store.data.lessons.filter((l) => l.platformWatched).map((l) => l.id).concat('gpmb-m0-l2');
  assert.equal(E.actions.logSnapshot('gpmb', { snapshotDate: '2026-10-31', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent', watchedLessonIds: ids }).ok, true);
  assert.equal(feas(E, 'F-01').videoMin, Math.round((62117 - 1497 - 1330 - 103) / 60));  // 986
  // your own date for the milestone replaces the planned date
  E.actions.setMilestoneDate('ms-gpmb-curr', '2026-12-01');
  const f = feas(E, 'F-01');
  assert.equal(f.days, 32); assert.equal(f.dateLabel, 'User Entered'); assert.equal(f.budget, 32 * 45 + 15);
});

test('logging actual study never changes remaining platform content (platform-only rule)', () => {
  const { E } = boot();
  assert.equal(E.actions.logActual(okLog({ durationMin: 120 })).ok, true);
  assert.equal(feas(E, 'F-01').videoMin, 988);
  assert.equal(feas(E, 'F-01').logged.video, 120);
});

test('study log validation: future date, zero/negative/fractional duration and missing required fields are refused', () => {
  const { E } = boot();
  const bad = {
    future: okLog({ date: '2026-11-01' }), zero: okLog({ durationMin: 0 }), negative: okLog({ durationMin: -5 }), fraction: okLog({ durationMin: 2.5 }),
    tooLong: okLog({ durationMin: 721 }), noType: okLog({ studyType: '' }), badType: okLog({ studyType: 'Browsing' }), noNotes: okLog({ notes: ' ' }),
    noTopic: okLog({ topic: '', moduleId: null }), noCert: okLog({ certificationId: 'x' }), badStart: okLog({ startTime: '25:00' }), badConf: okLog({ confidence: 6 }),
    wrongModule: okLog({ moduleId: 'dpro-m1' }),
  };
  for (const [k, p] of Object.entries(bad)) assert.equal(E.actions.logActual(p).ok, false, k);
  assert.equal(E.store.data.actualSessions.length, 0);
  assert.equal(E.actions.logActual(okLog()).ok, true);                         // optional fields omitted
  assert.equal(E.actions.logActual(okLog({ startTime: '06:30', confidence: 4 })).ok, true);
  assert.equal(E.store.data.actualSessions.length, 2);
});

test('only explicit manual entry: automatic sources are refused', () => {
  const { E } = boot();
  assert.equal(E.actions.logActual(okLog({ source: 'timer' })).ok, false);
  assert.equal(E.actions.logActual(okLog({ entryMethod: 'auto' })).ok, false);
  assert.equal(E.actions.logActual(okLog({ videoLengthSec: 1497 })).ok, false);
  assert.equal(E.store.commit((d) => { d.actualSessions.push({ id: 'as-x', certificationId: 'gpmb', date: '2026-10-31', durationMin: 25, studyType: 'Video', topic: 'x', notes: 'x', entryMethod: 'timer', label: 'User Entered' }); }), false);
  assert.equal(E.store.data.actualSessions.length, 0);
});

test('planned vs actual stay separate; a plan is Done only with a logged session', () => {
  const { E } = boot();
  const p = E.actions.addPlanned({ certificationId: 'gpmb', date: '2026-10-31', plannedMinutes: 40, topic: 'PRiSM basics' });
  assert.equal(p.ok, true);
  assert.equal(E.calc.actualMin('gpmb', '2026-10-31'), 0); assert.equal(E.calc.plannedMin('gpmb', '2026-10-31'), 40);
  assert.equal(E.calc.dayStatus('gpmb', '2026-10-31').status, 'Not Started');
  assert.equal(E.store.commit((d) => { d.plannedSessions[0].status = 'Done'; }), false);            // Done without study
  assert.equal(E.store.commit((d) => { d.plannedSessions[0].actualMinutes = 40; }), false);         // actual minutes on a plan
  assert.equal(E.actions.addPlanned({ certificationId: 'gpmb', date: '2026-10-30', plannedMinutes: 40, topic: 'x' }).ok, false); // plans are for today or later
  assert.equal(E.actions.logActual(okLog({ durationMin: 30, plannedSessionId: p.id })).ok, true);
  const plan = E.store.data.plannedSessions[0];
  assert.equal(plan.status, 'Done'); assert.equal(E.calc.actualMin('gpmb', '2026-10-31'), 30); assert.equal(E.calc.plannedMin('gpmb', '2026-10-31'), 40);
  assert.equal(E.calc.dayStatus('gpmb', '2026-10-31').status, 'Partial');
  E.actions.deleteActual(E.store.data.actualSessions[0].id);
  assert.equal(E.store.data.plannedSessions[0].status, 'Planned');
});

test('rescheduling: missed and skipped plans move to a new date; history kept', () => {
  const { E } = boot();
  const a = E.actions.addPlanned({ certificationId: 'dpro', date: '2026-10-31', plannedMinutes: 30, topic: 'M4 Implementing' }).id;
  const b = E.actions.addPlanned({ certificationId: 'gpmb', date: '2026-11-01', plannedMinutes: 40, topic: 'Ethics' }).id;
  E.__fakeToday = '2026-11-03';
  assert.equal(E.calc.planState(E.store.data.plannedSessions.find((x) => x.id === a)), 'Missed');
  assert.equal(E.calc.missedPlans().length, 2);
  assert.equal(E.actions.reschedulePlanned(a, '2026-11-02').ok, false);           // not into the past
  const r = E.actions.reschedulePlanned(a, '2026-11-04'); assert.equal(r.ok, true);
  const old = E.store.data.plannedSessions.find((x) => x.id === a), neu = E.store.data.plannedSessions.find((x) => x.id === r.id);
  assert.equal(old.status, 'Rescheduled'); assert.equal(old.rescheduledTo, r.id); assert.equal(neu.rescheduledFrom, a); assert.equal(neu.status, 'Planned');
  assert.equal(E.calc.plannedMin('dpro', '2026-10-31'), 0); assert.equal(E.calc.plannedMin('dpro', '2026-11-04'), 30);
  assert.equal(E.actions.skipPlanned(b).ok, true);
  assert.equal(E.actions.rescheduleMany([b], '2026-11-05').ok, true);
  assert.equal(E.calc.missedPlans().length, 0);
});

test('state survives a save/load round trip and stays valid', () => {
  const { E, mem } = boot();
  E.actions.setDailyTargets({ gpmb: 50, dpro: 35 });
  E.actions.logActual(okLog());
  E.store.init();
  assert.equal(E.store.data.settings.dailyTargetMin.gpmb, 50);
  assert.equal(E.store.data.actualSessions.length, 1);
  assert.equal(E.validate.state(E.store.data).ok, true);
  assert.ok(mem['ecc2026.v2.data']);
});
