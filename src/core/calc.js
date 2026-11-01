/* =========================================================================
   calc.js — Pure calculations over the store. Results are derived on demand
   and never written back, so they cannot drift from the records.
   Platform progress and personal progress are computed separately and never
   combined.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var C = ECC.calc = {};
  var U = function () { return ECC.ui; };
  var D = function () { return ECC.store.data; };

  /* Daily target for one certification on one date (per-day override wins). */
  C.target = function (cert, date) {
    var o = (D().settings.dailyTargetOverrides || {})[date];
    if (o && o[cert] !== undefined && o[cert] !== null) return Number(o[cert]);
    return Number(D().settings.dailyTargetMin[cert]);
  };
  C.dailyTotal = function (date) { return ECC.q.certIds().reduce(function (a, c) { return a + C.target(c, date); }, 0); };

  /* Sum of daily targets from a..b inclusive */
  C.budget = function (cert, a, b) {
    if (!a || !b || b < a) return 0;
    return U().dateRange(a, b).reduce(function (t, d) { return t + C.target(cert, d); }, 0);
  };

  /* Whole-plan workload */
  C.workload = function () {
    var s = D().settings, days = U().daysBetween(s.startDate, s.endDate) + 1;
    var per = {}; ECC.q.certIds().forEach(function (c) { per[c] = C.budget(c, s.startDate, s.endDate); });
    var total = Object.keys(per).reduce(function (a, k) { return a + per[k]; }, 0);
    return { days: days, perCert: per, totalMin: total, dailyDefault: s.dailyTargetMin, minimum: s.minimumDailyMin,
      defaultDaily: ECC.q.certIds().reduce(function (a, c) { return a + s.dailyTargetMin[c]; }, 0) };
  };

  /* Platform progress (as shown on the platform) — latest snapshot only. */
  C.platformProgress = function (cert) {
    var course = ECC.q.course(cert), snap = ECC.q.latestSnapshot(course);
    return snap ? { pct: snap.valuePct, date: snap.snapshotDate, label: snap.label, watched: snap.watchedLessons, total: snap.totalLessons } : null;
  };

  /* Personal progress (your own status), weighted by duration; counts shown too. */
  C.personalProgress = function (cert) {
    var items = cert === 'gpmb' ? ECC.q.lessons('gpmb') : ECC.q.modules(cert);
    var tot = 0, done = 0, n = 0, rec = 0;
    items.forEach(function (x) { tot += x.durationSec; if (x.personalUpdatedAt) rec++; if (x.personalStatus === 'Completed') { done += x.durationSec; n++; } });
    return { pct: tot ? (done / tot) * 100 : null, recorded: rec > 0, completed: n, total: items.length, unit: cert === 'gpmb' ? 'lessons' : 'items' };
  };

  /* Remaining PLATFORM content (minutes) — GPM-b: lessons not yet watched on PM-Tricks; DPro: items not completed on Ready CSOD. */
  C.remainingContentMin = function (cert) {
    if (cert === 'gpmb') return Math.round(ECC.q.lessons('gpmb').filter(function (l) { return !l.platformWatched; }).reduce(function (a, l) { return a + l.durationSec; }, 0) / 60);
    return Math.round(ECC.q.modules(cert).filter(function (m) { return m.platformStatus !== 'Completed'; }).reduce(function (a, m) { return a + m.durationSec; }, 0) / 60);
  };

  /* ---------------- planned vs actual (kept separate) ---------------- */
  C.BUFFER_TYPES = ['Reading', 'Notes', 'Practice Questions', 'Mock Exam', 'Revision'];
  C.actualMin = function (cert, date) {
    return D().actualSessions.filter(function (x) { return (!cert || x.certificationId === cert) && x.date === date; }).reduce(function (a, x) { return a + x.durationMin; }, 0);
  };
  /* Planned minutes still on the plan for that day (rescheduled-away sessions don't count there). Never study time. */
  C.plannedMin = function (cert, date) {
    return D().plannedSessions.filter(function (x) { return (!cert || x.certificationId === cert) && x.date === date && x.status !== 'Rescheduled'; }).reduce(function (a, x) { return a + x.plannedMinutes; }, 0);
  };
  C.planState = function (p) {
    if (p.status === 'Planned' && p.date < U().today()) return 'Missed';
    return p.status;
  };
  C.dayStatus = function (cert, date) {
    var t = C.target(cert, date), a = C.actualMin(cert, date), today = U().today();
    var st = date > today ? 'Future' : a >= t ? 'Met' : a > 0 ? 'Partial' : date === today ? 'Not Started' : 'Missed';
    return { target: t, actual: a, planned: C.plannedMin(cert, date), status: st };
  };
  C.studyTotals = function (cert, from, to) {
    var list = D().actualSessions.filter(function (x) { return (!cert || x.certificationId === cert) && (!from || x.date >= from) && (!to || x.date <= to); });
    var byType = {}; ECC.validate.STUDY_TYPES.forEach(function (t) { byType[t] = 0; });
    list.forEach(function (x) { byType[x.studyType] += x.durationMin; });
    var total = list.reduce(function (a, x) { return a + x.durationMin; }, 0);
    return { total: total, sessions: list.length, byType: byType, video: byType.Video, buffer: total - byType.Video };
  };
  C.missedPlans = function () {
    return D().plannedSessions.filter(function (p) { return C.planState(p) === 'Missed' || p.status === 'Skipped'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  };

  /* ---------------- feasibility (live) ----------------
     For each milestone with a feasibility check: remaining PLATFORM content (video at 1x for GPM-b; module/exam
     minutes for DPro) against the sum of daily targets from today to the milestone date (per-day overrides
     included). Whatever the budget leaves after the content is the buffer for notes, reading, revision,
     practice questions and mock exams. Recomputed on every render from current targets and platform data. */
  C.feasibility = function () {
    var s = D().settings, today = U().today(), from = today > s.startDate ? today : s.startDate;
    return D().milestones.filter(function (m) { return m.feasibilityCheck; }).map(function (m) {
      var certs = m.certificationId ? [m.certificationId] : ECC.q.certIds(), date = m.targetDate || m.suggestedDate;
      var days = date >= from ? U().daysBetween(from, date) + 1 : 0;
      var budget = 0, remaining = 0, daily = 0;
      certs.forEach(function (c) { budget += C.budget(c, from, date); remaining += C.remainingContentMin(c); daily += s.dailyTargetMin[c]; });
      var logged = { video: 0, buffer: 0 };
      certs.forEach(function (c) { var t = C.studyTotals(c, s.startDate, today); logged.video += t.video; logged.buffer += t.buffer; });
      var buffer = budget - remaining;
      return { id: m.feasibilityCheck, milestone: m, cert: m.certificationId, certs: certs, date: date, dateIsUserSet: !!m.targetDate,
        dateLabel: m.targetDate ? 'User Entered' : m.suggestedDateLabel, from: from, days: days, dailyTarget: daily,
        budget: budget, remaining: remaining, videoMin: remaining, bufferMin: Math.max(0, buffer), margin: buffer,
        bufferPct: budget ? Math.max(0, buffer) / budget * 100 : null, logged: logged,
        status: days === 0 ? 'past' : buffer >= 0 ? 'ok' : 'short', perDayNeeded: days ? remaining / days : null };
    });
  };

  C.discrepancies = function () {
    var list = D().discrepancies;
    var open = list.filter(function (x) { return !x.resolution; });
    return { all: list, open: open, resolved: list.filter(function (x) { return !!x.resolution; }) };
  };
})(window.ECC = window.ECC || {});

/* -------------------------------------------------------------------------
   D-03 recheck: which rule could produce the PM-Tricks overall %?
   Each hypothesis predicts the displayed % from the watched-lesson count.
   A hypothesis is eliminated by any GPM-b snapshot it fails to predict.
   ------------------------------------------------------------------------- */
(function (ECC) {
  'use strict';
  var C = ECC.calc;
  C.D03_HYPOTHESES = [
    { id: 'H1', name: 'Rounds down (truncates), 67 lessons', f: function (w) { return Math.floor(w / 67 * 100); } },
    { id: 'H2', name: 'Rounds to nearest, 67 lessons', f: function (w) { return Math.round(w / 67 * 100); } },
    { id: 'H3', name: 'Rounds down (truncates), 67 lessons + 14 tests = 81 items', f: function (w) { return Math.floor(w / 81 * 100); } },
    { id: 'H4', name: 'Rounds to nearest, 81 items', f: function (w) { return Math.round(w / 81 * 100); } }
  ];
  C.d03 = function () {
    var course = ECC.q.course('gpmb'), snaps = (course.platformProgressSnapshots || []).filter(function (s) { return typeof s.watchedLessons === 'number'; });
    var base = snaps[0], rows = C.D03_HYPOTHESES.map(function (h) {
      var misses = snaps.filter(function (s) { return h.f(s.watchedLessons) !== s.valuePct; });
      return { id: h.id, name: h.name, alive: !misses.length, eliminatedBy: misses[0] || null,
        predictNext: function (w) { return h.f(w); } };
    });
    var alive = rows.filter(function (r) { return r.alive; });
    var after = snaps.slice(1), latest = snaps[snaps.length - 1];
    var recheck = after.find(function (s) { return s.watchedLessons === base.watchedLessons + 1; }) || null;
    var nextW = latest.watchedLessons + 1;
    var predictions = alive.map(function (r) { return { id: r.id, pct: C.D03_HYPOTHESES.find(function (h) { return h.id === r.id; }).f(nextW) }; });
    var distinct = predictions.map(function (p) { return p.pct; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var state;
    if (!after.length) state = 'waiting';
    else if (alive.length === 1) state = 'explained';
    else if (!alive.length) state = 'unexplained';
    else state = 'ambiguous';
    /* find the smallest watched count that separates the surviving hypotheses */
    var separatesAt = null;
    if (alive.length > 1) for (var w = latest.watchedLessons + 1; w <= 67; w++) {
      var vals = alive.map(function (r) { return C.D03_HYPOTHESES.find(function (h) { return h.id === r.id; }).f(w); });
      if (vals.some(function (v) { return v !== vals[0]; })) { separatesAt = { watched: w, values: alive.map(function (r, i) { return { id: r.id, pct: vals[i] }; }) }; break; }
    }
    return { snapshots: snaps, baseline: base, recheck: recheck, expectedRecheckWatched: base.watchedLessons + 1,
      protocolMet: !!recheck, offProtocol: after.length && !recheck, hypotheses: rows, alive: alive, state: state,
      nextWatched: nextW, nextPredictions: predictions, nextDistinguishes: distinct.length > 1, separatesAt: separatesAt };
  };
})(window.ECC);
