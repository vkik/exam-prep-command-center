// Data-layer tests. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource, assembleSeed, toSec } from '../tools/lib.mjs';
import { runChecks } from '../tools/validate-data.mjs';

const fresh = () => structuredClone(loadSource());
const statusOf = (src, id) => runChecks(src).find((r) => r.id === id).status;

test('verified source data has no FAIL', () => {
  assert.equal(runChecks(fresh()).filter((r) => r.status === 'FAIL').length, 0);
});
test('duration parser', () => {
  assert.equal(toSec('24:57'), 1497); assert.equal(toSec('1:19:55'), 4795); assert.throws(() => toSec('5m'));
});
test('altering one lesson duration breaks module reconciliation', () => {
  const s = fresh(); s.gpmb.modules[3].lessons[1].duration = '59:06'; assert.equal(statusOf(s, 'V-11'), 'FAIL');
});
test('removing a lesson breaks the 67-lesson count', () => {
  const s = fresh(); s.gpmb.modules[5].lessons.pop(); assert.equal(statusOf(s, 'V-10'), 'FAIL');
});
test('unknown label is rejected', () => {
  const s = fresh(); s.gpmb.modules[0].label = 'Probably'; assert.equal(statusOf(s, 'V-01'), 'FAIL');
});
test('giving the historical attempt a date is rejected', () => {
  const s = fresh(); s.gpmb.historicalAttempts[0].date = '2026-07-31'; assert.equal(statusOf(s, 'V-21'), 'FAIL');
});
test('locked DPro module with activity is rejected', () => {
  const s = fresh(); s.dpro.modules[4].lastAccessed = '2026-10-26'; assert.equal(statusOf(s, 'V-31'), 'FAIL');
});
test('readiness weights must total 100', () => {
  const s = fresh(); s.program.readinessDefaults.weights.mock = 40; assert.equal(statusOf(s, 'V-41'), 'FAIL');
});
test('seed keeps platform and personal progress separate and invents nothing', () => {
  const seed = assembleSeed(fresh());
  assert.equal(seed.courses[0].platformProgressSnapshots[0].valuePct, 2);
  assert.equal(seed.courses[1].platformProgressSnapshots[0].valuePct, 50);
  assert.ok(seed.lessons.every((l) => l.personalStatus === 'Not Started'));
  assert.equal(seed.actualSessions.length, 0);
  assert.equal(seed.examAttempts[0].correct, null);
});
test('a daily target below the 30-min minimum is rejected', () => {
  const s = fresh(); s.program.planning.dailyTargetMin.dpro = 20; assert.equal(statusOf(s, 'V-46'), 'FAIL');
});
test('approved targets 40/30 make the GPM-b milestone feasible', () => {
  assert.equal(statusOf(fresh(), 'V-43'), 'PASS');
});
test('unlocking DPro M5 before M4 is complete is rejected', () => {
  const s = fresh(); s.dpro.modules[4].locked = false; assert.equal(statusOf(s, 'V-38'), 'FAIL');
});
test('a discrepancy resolved in source data is rejected (must start open)', () => {
  const s = fresh(); s.discrepancies[0].resolution = { evidence: 'x' }; assert.equal(statusOf(s, 'V-52'), 'FAIL');
});
test('primary milestones must match your planning targets (28 Nov, 14 Nov, 14 Dec)', () => {
  const s = fresh(); s.program.milestones.find((m) => m.id === 'ms-gpmb-curr').suggestedDate = '2026-11-30'; assert.equal(statusOf(s, 'V-47'), 'FAIL');
});
