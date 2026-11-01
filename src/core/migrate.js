/* =========================================================================
   migrate.js — Brings older data up to schema 2.
   v1 (schema 1) → v2: start from the verified v2 seed, then overlay every
   user-owned value from v1 by record ID. Nothing the user recorded is dropped:
   values that v2 does not use actively (the old AI-generated question banks,
   an in-progress attempt on them) are moved to `archive`, never deleted.
   v1 data itself is never modified.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var M = ECC.migrate = {};
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var byId = function (list) { var m = {}; (list || []).forEach(function (r) { if (r && r.id) m[r.id] = r; }); return m; };

  /* Record counts used to compare before/after (and in the restore dialog). */
  M.counts = function (d) {
    var snaps = 0; (d.courses || []).forEach(function (c) { snaps += (c.platformProgressSnapshots || c.platformProgressHistory || []).length; });
    return {
      'Study sessions (actual)': (d.actualSessions || []).length,
      'Planned sessions': (d.plannedSessions || []).length,
      'Weekly reviews': (d.weeklyReviews || []).length,
      'Diagnostic attempts': (d.assessmentAttempts || []).length,
      'Exam / practice attempts': (d.examAttempts || []).length,
      'Lessons you marked complete': (d.lessons || []).filter(function (l) { return l.personalStatus === 'Completed'; }).length,
      'Modules you marked complete': (d.modules || []).filter(function (l) { return l.personalStatus === 'Completed'; }).length,
      'Milestones with your dates': (d.milestones || []).filter(function (m) { return m.targetDate; }).length,
      'Platform progress snapshots': snaps
    };
  };

  M.fromV1 = function (v1, seedIn) {
    var log = [], d = clone(seedIn), now = new Date().toISOString();
    var note = function (m) { log.push(m); };
    var s1 = v1.settings || {}, s = d.settings;

    /* --- settings --- */
    ['startDate', 'endDate', 'readinessTargetDate'].forEach(function (k) {
      if (s1[k] && s1[k] !== s[k]) { note('Kept your v1 ' + k + ' ' + s1[k] + ' (v2 default was ' + s[k] + ').'); s[k] = s1[k]; }
    });
    var t1 = s1.dailyTargets || {};
    Object.keys(s.dailyTargetMin).forEach(function (c) {
      var a = Number(t1[c]), b = s.dailyTargetMin[c];
      if (!isNaN(a) && a > b) { s.dailyTargetMin[c] = a; note('Kept your higher v1 daily target for ' + c + ': ' + a + ' min (approved v2 target ' + b + ').'); }
      else if (!isNaN(a) && a !== b) note('Daily target for ' + c + ': v1 had ' + a + ' min; using the approved ' + b + ' min (never lowered).');
    });
    s.dailyTargetOverrides = clone(s1.dailyTargetOverrides || {});
    if (s1.readinessWeights) s.readiness.weights = clone(s1.readinessWeights);
    if (s1.readinessThresholds) s.readiness.thresholds = clone(s1.readinessThresholds);
    if (typeof s1.readinessMinCoverage === 'number') s.readiness.minCoveragePct = s1.readinessMinCoverage;
    if (typeof s1.readinessIncludeHistorical === 'boolean') s.readiness.includeHistorical = s1.readinessIncludeHistorical;
    if (typeof s1.mockAttemptsForReadiness === 'number') s.readiness.mockAttemptsAveraged = s1.mockAttemptsForReadiness;

    /* --- certifications --- */
    var c1 = byId(v1.certifications);
    d.certifications.forEach(function (c) {
      var o = c1[c.id]; if (!o) return;
      ['examStatus', 'examBookingDate', 'certificationObtained', 'certificationEvidence'].forEach(function (k) { if (o[k] !== undefined) c[k] = o[k]; });
      if (o.officialExam && o.officialExam.details) { c.officialExam.userDetails = clone(o.officialExam.details); note(c.code + ': carried over the exam details you recorded in v1.'); }
    });

    /* --- courses: snapshots added by the user, resources --- */
    var co1 = byId(v1.courses);
    d.courses.forEach(function (c) {
      var o = co1[c.id]; if (!o) return;
      var have = {}; c.platformProgressSnapshots.forEach(function (p) { have[p.id] = true; });
      (o.platformProgressHistory || []).forEach(function (p) {
        if (have[p.id]) return;
        c.platformProgressSnapshots.push({ id: p.id, valuePct: p.value, watchedLessons: p.watchedLessons, totalLessons: p.totalLessons,
          snapshotDate: (p.verifiedAt || '').slice(0, 10), source: 'SRC-USER', platform: c.platform, label: p.label || 'User Entered', evidence: p.note || p.userNote || '', importedFrom: 'v1' });
        note(c.displayTitle + ': imported platform snapshot ' + p.value + '% (' + (p.verifiedAt || '').slice(0, 10) + ').');
      });
      if (o.resources && c.resources) {
        var r1 = byId(o.resources);
        c.resources.forEach(function (r) { var x = r1[r.id]; if (x) { ['inspected', 'userNote', 'inspectedAt', 'label'].forEach(function (k) { if (x[k] !== undefined) r[k] = x[k]; }); } });
      }
    });

    /* --- modules & lessons --- */
    var m1 = byId(v1.modules);
    d.modules.forEach(function (m) {
      var o = m1[m.id]; if (!o) return;
      ['personalStatus', 'personalUpdatedAt', 'personalNotes', 'dueDateReviewed'].forEach(function (k) { if (o[k] !== undefined) m[k] = o[k]; });
      if (m.locked && o.locked !== false && m.personalStatus === 'Completed') {
        m.personalStatusV1 = 'Completed'; m.personalStatus = 'In Progress';
        note(m.title + ': v1 had it marked complete, but it is locked on the platform; kept as In Progress (v1 value saved in personalStatusV1).');
      }
      if (m.certificationId === 'dpro') {
        var changed = [];
        [['platformStatus', 'platformStatus'], ['platformProgress', 'platformProgressPct'], ['platformTimeSpentMin', 'platformTimeSpentMin'],
          ['lastAccessed', 'lastAccessed'], ['views', 'views'], ['locked', 'locked'], ['displayedDueDate', 'displayedDueDate']].forEach(function (p) {
          if (o[p[0]] !== undefined && JSON.stringify(o[p[0]]) !== JSON.stringify(m[p[1]])) { m[p[1]] = o[p[0]]; changed.push(p[1]); }
        });
        if (changed.length) { m.label = 'User Entered'; m.source = 'SRC-USER'; note(m.title + ': kept your updated platform fields (' + changed.join(', ') + ').'); }
      }
    });
    var l1 = byId(v1.lessons);
    d.lessons.forEach(function (l) {
      var o = l1[l.id]; if (!o) return;
      ['personalStatus', 'personalUpdatedAt', 'completedAt', 'personalNotes'].forEach(function (k) { if (o[k] !== undefined) l[k] = o[k]; });
      if (typeof o.platformWatched === 'boolean' && o.platformWatched !== l.platformWatched) {
        l.platformWatched = o.platformWatched; l.platformWatchedSource = 'SRC-USER'; l.platformWatchedAt = o.platformWatchedVerifiedAt || null;
        note('Lesson "' + l.title + '": kept your platform-watched update (' + o.platformWatched + ').');
      }
    });

    /* --- attempts & milestones --- */
    var e2 = byId(d.examAttempts);
    (v1.examAttempts || []).forEach(function (a) {
      if (e2[a.id]) { if (a.notes && a.notes !== e2[a.id].note) e2[a.id].userNotes = a.notes; return; }
      var x = clone(a); if (x.passMark !== undefined && x.passMarkPct === undefined) x.passMarkPct = x.passMark;
      d.examAttempts.push(x);
    });
    var ms2 = byId(d.milestones);
    (v1.milestones || []).forEach(function (m) {
      var t = ms2[m.id];
      if (!t) { d.milestones.push(clone(m)); note('Kept your own milestone "' + m.title + '".'); return; }
      ['targetDate', 'status', 'completedAt', 'evidence', 'updatedAt'].forEach(function (k) { if (m[k] !== undefined) t[k] = m[k]; });
    });

    /* --- user collections copied as recorded --- */
    ['plannedSessions', 'actualSessions', 'weeklyReviews', 'assessmentAttempts'].forEach(function (k) { d[k] = clone(v1[k] || []); });
    d.actualSessions.forEach(function (x) { x.entryMethod = 'manual'; x.importedFrom = 'v1'; if (!x.label) x.label = 'User Entered'; });
    d.plannedSessions.forEach(function (x) {
      x.importedFrom = 'v1';
      if (['Planned', 'Done', 'Skipped', 'Rescheduled'].indexOf(x.status) < 0) { x.statusV1 = x.status; x.status = 'Planned'; }
      if (x.status === 'Done' && !d.actualSessions.some(function (a) { return a.id === x.linkedActualId; })) { x.statusV1 = 'Done'; x.status = 'Planned'; x.linkedActualId = null; note('Planned session ' + x.date + ' was Done in v1 without a logged session; kept as Planned (v1 status saved).'); }
      if (x.status === 'Rescheduled' && !x.rescheduledTo) { x.statusV1 = 'Rescheduled'; x.status = 'Skipped'; }
    });
    var below = {};
    Object.keys(s.dailyTargetOverrides).forEach(function (date) {
      var o = s.dailyTargetOverrides[date];
      Object.keys(o).forEach(function (c) {
        if (o[c] !== null && o[c] !== undefined && s.minimumDailyMin[c] !== undefined && Number(o[c]) < s.minimumDailyMin[c]) {
          var val = o[c]; (below[date] = below[date] || {})[c] = val; delete o[c];
          note('v1 per-day target ' + c + ' ' + val + ' min on ' + date + ' is below the 30-min minimum; not applied (kept in archive).');
        }
      });
      if (!Object.keys(o).length) delete s.dailyTargetOverrides[date];
    });
    if (Object.keys(below).length) d.archive.v1OverridesBelowMinimum = below;
    d.assessments = clone(v1.assessments || []).map(function (a) { a.status = 'Inactive — old bank excluded; rewritten bank arrives in Phase 4'; return a; });

    /* --- old question banks: archived, not active --- */
    var qs = v1.questions || [], active = [], archived = [];
    qs.forEach(function (q) { (q.source === 'User Entered' || q.source === 'User Imported' ? active : archived).push(clone(q)); });
    d.questions = active;
    d.archive.v1QuestionBanks = archived;
    if (archived.length) note('Archived ' + archived.length + ' v1 AI-generated diagnostic questions (excluded from active use; kept, not deleted).');
    if (active.length) note('Kept ' + active.length + ' questions you entered or imported yourself.');
    if (v1.activeAttempt) { d.archive.v1ActiveAttempt = clone(v1.activeAttempt); note('An unfinished v1 diagnostic attempt was archived (its question bank is no longer active).'); }

    /* --- meta --- */
    var mt = v1.meta || {};
    d.meta = { createdAt: mt.createdAt || now, updatedAt: now, lastBackupAt: mt.lastBackupAt || null, appVersion: ECC.APP_VERSION,
      dataVersion: seedIn.dataVersion, testMode: !!mt.testMode, migratedFromV1: { at: now, v1AppVersion: mt.appVersion || null } };
    var before = M.counts(v1), after = M.counts(d);
    d.importLog.push({ id: 'imp-' + Date.now().toString(36), at: now, from: 'v1 (schema 1)', notes: log, countsBefore: before, countsAfter: after });
    return { data: d, log: log, before: before, after: after };
  };

  /* Bring any stored/backup data to schema 2. Throws on unknown versions. */
  M.toCurrent = function (data, seed) {
    if (!data || typeof data.schemaVersion !== 'number') throw new Error('Data has no schema version.');
    if (data.schemaVersion === 2) return { data: data, log: [], before: null, after: null };
    if (data.schemaVersion === 1) return M.fromV1(data, seed);
    throw new Error('No migration path from schema ' + data.schemaVersion + '.');
  };
})(window.ECC = window.ECC || {});
