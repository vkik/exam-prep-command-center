/* =========================================================================
   validate.js — Validation of the whole store and of backup files (schema 2).
   Shared by load, commit and restore. Errors block; warnings are shown on the
   Data Quality page. Nothing here modifies data.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var V = ECC.validate = {};

  V.SCHEMA_VERSION = 2;
  V.MIN_EVIDENCE = 20;
  V.STUDY_TYPES = ['Video', 'Reading', 'Notes', 'Practice Questions', 'Mock Exam', 'Revision'];
  V.PLAN_STATUSES = ['Planned', 'Done', 'Skipped', 'Rescheduled'];
  V.APP_ID = 'exam-preparation-command-center';
  V.LABELS = ['Verified', 'User Entered', 'Historical', 'Not Yet Verified', 'Conflicting Data', 'Unavailable', 'Estimated Planning Value', 'TEST DATA'];
  var PERSONAL = ['Not Started', 'In Progress', 'Completed'];
  var ARRAYS = ['certifications', 'courses', 'modules', 'lessons', 'platformTests', 'examAttempts', 'discrepancies', 'milestones',
    'plannedSessions', 'actualSessions', 'weeklyReviews', 'assessments', 'questions', 'assessmentAttempts', 'importLog'];

  V.isDate = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')); };
  var isInt = function (n, lo, hi) { return typeof n === 'number' && Math.floor(n) === n && n >= lo && n <= hi; };
  var isPct = function (n) { return typeof n === 'number' && n >= 0 && n <= 100; };

  V.state = function (d) {
    var errors = [], warnings = [];
    var E = function (m) { errors.push(m); }, W = function (m) { warnings.push(m); };
    if (!d || typeof d !== 'object') return { ok: false, errors: ['Data is not an object.'], warnings: [] };
    if (d.schemaVersion !== V.SCHEMA_VERSION) E('schemaVersion must be ' + V.SCHEMA_VERSION + ' (found ' + d.schemaVersion + ').');
    ['settings', 'meta', 'archive'].forEach(function (k) { if (!d[k] || typeof d[k] !== 'object') E('Missing object: ' + k); });
    ARRAYS.forEach(function (k) { if (!Array.isArray(d[k])) E('Missing list: ' + k); });
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    /* IDs unique across the main collections */
    var seen = {};
    ['certifications', 'courses', 'modules', 'lessons', 'platformTests', 'examAttempts', 'discrepancies', 'milestones',
      'plannedSessions', 'actualSessions', 'weeklyReviews', 'assessmentAttempts'].forEach(function (k) {
      d[k].forEach(function (r, i) {
        if (!r || typeof r.id !== 'string' || !r.id) return E(k + '[' + i + '] has no id.');
        if (seen[r.id]) E('Duplicate id "' + r.id + '" (' + k + ' and ' + seen[r.id] + ').');
        seen[r.id] = k;
      });
    });

    /* Labels */
    (function walk(o, path) {
      if (Array.isArray(o)) return o.forEach(function (x, i) { walk(x, path + '[' + i + ']'); });
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) {
        if (k === 'label' && typeof o[k] === 'string' && V.LABELS.indexOf(o[k]) < 0) E('Unknown label "' + o[k] + '" at ' + path);
        if (k !== 'archive') walk(o[k], path + '.' + k);
      });
    })(d, 'data');

    var certIds = d.certifications.map(function (c) { return c.id; });

    /* Settings & minimums */
    var s = d.settings;
    ['startDate', 'endDate', 'readinessTargetDate'].forEach(function (k) { if (!V.isDate(s[k])) E('settings.' + k + ' is not a valid date.'); });
    if (V.isDate(s.startDate) && V.isDate(s.endDate) && s.endDate <= s.startDate) E('settings.endDate must be after startDate.');
    if (!s.dailyTargetMin || !s.minimumDailyMin) E('settings.dailyTargetMin and minimumDailyMin are required.');
    else certIds.forEach(function (c) {
      if (!isInt(s.dailyTargetMin[c], 0, 600)) E('Daily target for ' + c + ' must be 0–600 whole minutes.');
      else if (s.dailyTargetMin[c] < s.minimumDailyMin[c]) E('Daily target for ' + c + ' (' + s.dailyTargetMin[c] + ') is below its minimum (' + s.minimumDailyMin[c] + ').');
    });
    Object.keys(s.dailyTargetOverrides || {}).forEach(function (date) {
      if (!V.isDate(date)) return E('Override date "' + date + '" is invalid.');
      var o = s.dailyTargetOverrides[date];
      certIds.forEach(function (c) {
        if (o[c] === undefined || o[c] === null) return;
        if (!isInt(Number(o[c]), 0, 600)) E('Override ' + date + ' ' + c + ' must be 0–600.');
        else if (s.minimumDailyMin && Number(o[c]) < s.minimumDailyMin[c]) E('Daily target for ' + c + ' on ' + date + ' (' + o[c] + ' min) is below its ' + s.minimumDailyMin[c] + '-min minimum.');
      });
    });

    /* Curriculum */
    d.lessons.forEach(function (l) {
      if (!isInt(l.durationSec, 1, 86400)) E('Lesson ' + l.id + ' has an invalid duration.');
      if (typeof l.platformWatched !== 'boolean') E('Lesson ' + l.id + ' platformWatched must be true/false.');
      if (PERSONAL.indexOf(l.personalStatus) < 0) E('Lesson ' + l.id + ' has invalid personal status.');
    });
    var today0 = ECC.ui ? ECC.ui.today() : null;
    var modById = {}; d.modules.forEach(function (m) { modById[m.id] = m; });
    d.modules.forEach(function (m) {
      if (PERSONAL.indexOf(m.personalStatus) < 0) E('Module ' + m.id + ' has invalid personal status.');
      if (m.platformProgressPct !== undefined && m.platformProgressPct !== null && !isPct(m.platformProgressPct)) E('Module ' + m.id + ' platform progress must be 0–100.');
      if (m.locked && m.platformStatus === 'Completed') E('"' + m.title + '" is locked on the platform and cannot be marked completed there.');
      if (m.locked && m.personalStatus === 'Completed') E('"' + m.title + '" is locked on the platform, so it cannot be marked complete.');
      if (m.platformStatus === 'Completed' && m.platformProgressPct !== undefined && m.platformProgressPct !== null && m.platformProgressPct !== 100) E('"' + m.title + '" is Completed on the platform but not at 100%.');
      if (m.unlocksAfter && !m.locked) {
        var missing = m.unlocksAfter.filter(function (pid) { return !modById[pid] || modById[pid].platformStatus !== 'Completed'; });
        if (missing.length) E('"' + m.title + '" cannot be unlocked until ' + missing.map(function (pid) { return modById[pid] ? modById[pid].title : pid; }).join(', ') + ' is completed on the platform.');
      }
    });
    var srcIds = (d.sources || []).map(function (x) { return x.id; });
    d.courses.forEach(function (c) {
      var snaps = c.platformProgressSnapshots || [];
      snaps.forEach(function (p) {
        if (!isPct(p.valuePct)) E('Course ' + c.id + ' snapshot ' + p.id + ' must be 0–100%.');
        if (!V.isDate(p.snapshotDate)) E('Course ' + c.id + ' snapshot ' + p.id + ' has no valid capture date.');
        else if (today0 && p.snapshotDate > today0) E('Snapshot ' + p.id + ' is dated in the future.');
        if (srcIds.indexOf(p.source) < 0) E('Snapshot ' + p.id + ' has an unregistered source.');
        if (p.source === 'SRC-USER' && !p.importedFrom) {
          if (!p.platform) E('Snapshot ' + p.id + ' must name the source platform.');
          if (!(p.evidence && String(p.evidence).trim().length >= 10)) E('Snapshot ' + p.id + ' needs evidence or notes (at least 10 characters).');
        }
      });
      var last = snaps[snaps.length - 1];
      if (last && typeof last.watchedLessons === 'number' && c.certificationId) {
        var flagged = d.lessons.filter(function (l) { return l.certificationId === c.certificationId && l.platformWatched; }).length;
        if (flagged !== last.watchedLessons) W(c.displayTitle + ': latest snapshot says ' + last.watchedLessons + ' watched lessons, but ' + flagged + ' lessons are flagged watched.');
      }
      for (var i = 1; i < snaps.length; i++) if (snaps[i].snapshotDate < snaps[i - 1].snapshotDate) W(c.displayTitle + ': snapshot ' + snaps[i].id + ' is dated before the previous one.');
    });

    /* User records */
    var today = ECC.ui ? ECC.ui.today() : null;
    var modIds = {}; d.modules.forEach(function (m) { modIds[m.id] = m.certificationId; });
    var actById = {}; d.actualSessions.forEach(function (x) { actById[x.id] = x; });
    var planById = {}; d.plannedSessions.forEach(function (x) { planById[x.id] = x; });
    var hhmm = function (t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); };
    d.actualSessions.forEach(function (x) {
      var who = 'Study session ' + (x.date || '') + ' (' + x.id + ')';
      if (certIds.indexOf(x.certificationId) < 0) E(who + ' has an unknown certification.');
      if (!V.isDate(x.date)) E(who + ' has an invalid date.');
      else if (today && x.date > today) E(who + ' is dated in the future — only study already done can be logged.');
      if (!isInt(x.durationMin, 1, 720)) E(who + ': duration must be a whole number of minutes from 1 to 720.');
      if (V.STUDY_TYPES.indexOf(x.studyType) < 0) E(who + ': study type must be one of ' + V.STUDY_TYPES.join(', ') + '.');
      if (x.entryMethod !== 'manual') E(who + ' was not entered manually — study time can only be recorded by explicit manual entry.');
      if (x.label !== 'User Entered' && x.label !== 'TEST DATA') E(who + ' must be labelled User Entered.');
      if (!x.importedFrom) {
        if (!((x.topic && String(x.topic).trim()) || x.moduleId)) E(who + ' needs a module or topic.');
        if (!(x.notes && String(x.notes).trim())) E(who + ' needs notes.');
      }
      if (x.moduleId && modIds[x.moduleId] === undefined) E(who + ' refers to an unknown module.');
      else if (x.moduleId && modIds[x.moduleId] !== x.certificationId) E(who + ': module belongs to the other certification.');
      if (x.startTime && !hhmm(x.startTime)) E(who + ': start time must be HH:MM.');
      if (x.confidence !== undefined && x.confidence !== null && x.confidence !== '' && !isInt(Number(x.confidence), 1, 5)) E(who + ': confidence must be 1–5.');
      if (x.plannedSessionId && !planById[x.plannedSessionId]) E(who + ' is linked to a planned session that does not exist.');
    });
    d.plannedSessions.forEach(function (x) {
      var who = 'Planned session ' + (x.date || '') + ' (' + x.id + ')';
      if (certIds.indexOf(x.certificationId) < 0) E(who + ' has an unknown certification.');
      if (!V.isDate(x.date)) E(who + ' has an invalid date.');
      if (!isInt(x.plannedMinutes, 1, 720)) E(who + ': planned minutes must be 1–720.');
      if (V.PLAN_STATUSES.indexOf(x.status) < 0) E(who + ': status must be one of ' + V.PLAN_STATUSES.join(', ') + '.');
      if (x.status === 'Done') {
        var a = actById[x.linkedActualId];
        if (!a) E(who + ' is marked Done without a logged study session — planned time never counts as study.');
        else if (a.certificationId !== x.certificationId) E(who + ' is linked to a session for the other certification.');
      }
      if (x.status !== 'Done' && x.linkedActualId) E(who + ' has a linked session but is not Done.');
      if (x.status === 'Rescheduled' && !(x.rescheduledTo && planById[x.rescheduledTo])) E(who + ' is Rescheduled but its new session is missing.');
      if (x.startTime && !hhmm(x.startTime)) E(who + ': start time must be HH:MM.');
      if (x.actualMinutes !== undefined || x.durationMin !== undefined) E(who + ' carries actual minutes — planned and actual time must stay separate.');
    });
    d.milestones.forEach(function (m) {
      if (['Not Started', 'In Progress', 'Completed'].indexOf(m.status) < 0) E('Milestone ' + m.id + ' has an invalid status.');
    });
    d.examAttempts.forEach(function (a) {
      if (a.date === null && !a.isHistorical) E('Exam attempt ' + a.id + ' has no date (only historical records may omit it).');
      if (a.date !== null && !V.isDate(a.date)) E('Exam attempt ' + a.id + ' has an invalid date.');
      if (a.scorePct !== null && a.scorePct !== undefined && !isPct(a.scorePct)) E('Exam attempt ' + a.id + ' score must be 0–100%.');
    });
    d.certifications.forEach(function (c) {
      if (c.certificationObtained && !c.certificationEvidence) E(c.code + ' is marked obtained without evidence.');
    });
    d.milestones.forEach(function (m) {
      if (m.targetDate !== null && !V.isDate(m.targetDate)) E('Milestone ' + m.id + ' target date is invalid.');
    });
    d.discrepancies.forEach(function (x) {
      var r = x.resolution;
      if (!r) return;
      if (!(r.evidence && String(r.evidence).trim().length >= V.MIN_EVIDENCE)) E(x.id + ' cannot be closed without written evidence (at least ' + V.MIN_EVIDENCE + ' characters).');
      if (!r.sourceId || srcIds.indexOf(r.sourceId) < 0) E(x.id + ' cannot be closed without a verified source from the source registry.');
      else if ((x.disallowedSources || []).indexOf(r.sourceId) >= 0) E(x.id + ' cannot be closed on ' + r.sourceId + ' — that source is not accepted for this item.');
      if (!V.isDate(r.observedOn)) E(x.id + ' resolution needs the date you checked the source.');
      else if (today0 && r.observedOn > today0) E(x.id + ' resolution date is in the future.');
    });
    (d.sources || []).forEach(function (x) {
      if (x.id.indexOf('SRC-U-') === 0 && !(x.title && String(x.title).trim().length >= 3)) E('Source ' + x.id + ' needs a title.');
    });
    return { ok: !errors.length, errors: errors, warnings: warnings };
  };

  /* Backup envelope (v1 or v2). Returns { ok, errors, version } — data is validated after migration by the caller. */
  V.envelope = function (obj) {
    var errors = [];
    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['The file does not contain a JSON object.'] };
    if (obj.app !== V.APP_ID) errors.push('This is not an Exam Preparation Command Center backup (app = ' + JSON.stringify(obj.app) + ').');
    if (!obj.data || typeof obj.data !== 'object') errors.push('The backup has no "data" section.');
    else if (typeof obj.data.schemaVersion !== 'number') errors.push('The backup data has no schema version.');
    else if (obj.data.schemaVersion > V.SCHEMA_VERSION) errors.push('This backup comes from a newer version (schema ' + obj.data.schemaVersion + '). Update the app first.');
    return { ok: !errors.length, errors: errors, version: obj && obj.data ? obj.data.schemaVersion : null };
  };
})(window.ECC = window.ECC || {});
