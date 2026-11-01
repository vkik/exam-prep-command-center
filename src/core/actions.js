/* =========================================================================
   actions.js — The only way views change data in Phase 2. Each action checks
   its own rules, then commits through the store, whose whole-state validation
   is a second, independent gate. Returns { ok, error }.
   Rules enforced here:
   - personal status is set only by an explicit action (never inferred from
     platform data), and locked platform items can never be marked complete;
   - platform snapshots need a capture date, source platform and evidence;
     they are appended, never edited;
   - discrepancies close only with written evidence + a registered source.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var A = ECC.actions = {};
  var PERSONAL = ['Not Started', 'In Progress', 'Completed'];
  var D = function () { return ECC.store.data; };
  var now = function () { return new Date().toISOString(); };
  var fail = function (msg) { if (ECC.ui) ECC.ui.toast(msg, 'err'); return { ok: false, error: msg }; };
  var commit = function (fn, msg) {
    ECC.store.lastError = null;
    var ok = ECC.store.commit(fn, msg);
    return ok ? { ok: true } : { ok: false, error: ECC.store.lastError || 'Rejected by validation' };
  };
  var uid = function (p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  /* ---------- personal status ---------- */
  A.setLessonStatus = function (lessonId, status) {
    if (PERSONAL.indexOf(status) < 0) return fail('Unknown status.');
    var l = D().lessons.find(function (x) { return x.id === lessonId; });
    if (!l) return fail('Lesson not found.');
    return commit(function (d) {
      var t = d.lessons.find(function (x) { return x.id === lessonId; });
      t.personalStatus = status; t.personalUpdatedAt = now(); t.personalLabel = 'User Entered';
      t.completedAt = status === 'Completed' ? (t.completedAt || now()) : null;
    }, '"' + l.title + '" — your status: ' + status);
  };

  A.setModuleLessonsStatus = function (moduleId, status) {
    if (PERSONAL.indexOf(status) < 0) return fail('Unknown status.');
    var ids = D().lessons.filter(function (l) { return l.moduleId === moduleId; }).map(function (l) { return l.id; });
    if (!ids.length) return fail('Module has no lessons.');
    return commit(function (d) {
      d.lessons.forEach(function (t) {
        if (ids.indexOf(t.id) < 0) return;
        t.personalStatus = status; t.personalUpdatedAt = now(); t.personalLabel = 'User Entered';
        t.completedAt = status === 'Completed' ? (t.completedAt || now()) : null;
      });
    }, ids.length + ' lessons — your status: ' + status);
  };

  A.setModuleStatus = function (moduleId, status) {
    if (PERSONAL.indexOf(status) < 0) return fail('Unknown status.');
    var m = D().modules.find(function (x) { return x.id === moduleId; });
    if (!m) return fail('Module not found.');
    if (m.locked && status === 'Completed') return fail('"' + m.title + '" is locked on the platform, so it cannot be marked complete.');
    return commit(function (d) {
      var t = d.modules.find(function (x) { return x.id === moduleId; });
      t.personalStatus = status; t.personalUpdatedAt = now(); t.personalLabel = 'User Entered';
    }, '"' + m.title + '" — your status: ' + status);
  };

  A.setDueDateReviewed = function (moduleId, reviewed) {
    return commit(function (d) { var t = d.modules.find(function (x) { return x.id === moduleId; }); t.dueDateReviewed = !!reviewed; t.dueDateReviewedAt = reviewed ? now() : null; },
      reviewed ? 'Due date marked as reviewed' : 'Due date marked as not reviewed');
  };

  /* ---------- platform snapshots ----------
     p = { snapshotDate, platform, valuePct, evidence,
           watchedLessonIds?: [...]           (GPM-b: full set watched on the platform)
           modules?: { id: { platformStatus, platformProgressPct, platformTimeSpentMin, lastAccessed, locked } }  (DPro) } */
  A.logSnapshot = function (certId, p) {
    var course = ECC.q.course(certId), V = ECC.validate, today = ECC.ui.today();
    if (!course) return fail('Course not found.');
    if (!V.isDate(p.snapshotDate)) return fail('Capture date is required.');
    if (p.snapshotDate > today) return fail('Capture date cannot be in the future.');
    if (!p.platform || !String(p.platform).trim()) return fail('Source platform is required.');
    var v = Number(p.valuePct);
    if (p.valuePct === '' || p.valuePct === null || p.valuePct === undefined || isNaN(v) || v < 0 || v > 100) return fail('Overall platform progress must be 0–100%.');
    if (!p.evidence || String(p.evidence).trim().length < 10) return fail('Evidence / notes are required (at least 10 characters): say what you saw and where.');
    var snapId = uid('pp');
    var res = commit(function (d) {
      var c = d.courses.find(function (x) { return x.id === course.id; });
      var snap = { id: snapId, valuePct: v, snapshotDate: p.snapshotDate, platform: String(p.platform).trim(), evidence: String(p.evidence).trim(),
        source: 'SRC-USER', label: 'User Entered', loggedAt: now() };
      if (p.watchedLessonIds) {
        var set = {}; p.watchedLessonIds.forEach(function (id) { set[id] = true; });
        var changes = [];
        d.lessons.forEach(function (l) {
          if (l.certificationId !== certId) return;
          var w = !!set[l.id];
          if (w !== l.platformWatched) { changes.push({ id: l.id, from: l.platformWatched, to: w }); l.platformWatched = w; l.platformWatchedSource = 'SRC-USER'; l.platformWatchedAt = p.snapshotDate; }
        });
        snap.watchedLessons = d.lessons.filter(function (l) { return l.certificationId === certId && l.platformWatched; }).length;
        snap.totalLessons = d.lessons.filter(function (l) { return l.certificationId === certId; }).length;
        snap.lessonChanges = changes;
      }
      if (p.modules) {
        snap.moduleStates = {};
        Object.keys(p.modules).forEach(function (mid) {
          var t = d.modules.find(function (x) { return x.id === mid; }), n = p.modules[mid];
          if (!t) return;
          ['platformStatus', 'platformProgressPct', 'platformTimeSpentMin', 'lastAccessed', 'locked'].forEach(function (k) { if (n[k] !== undefined) t[k] = n[k]; });
          if (t.locked) { t.platformStatus = 'Pending Prior Training'; t.platformProgressPct = null; }
          t.source = 'SRC-USER'; t.label = 'User Entered'; t.snapshotDate = p.snapshotDate;
          snap.moduleStates[mid] = { platformStatus: t.platformStatus, platformProgressPct: t.platformProgressPct, platformTimeSpentMin: t.platformTimeSpentMin, lastAccessed: t.lastAccessed, locked: !!t.locked };
        });
      }
      c.platformProgressSnapshots.push(snap);
    }, 'Platform snapshot logged: ' + v + '%');
    if (res.ok) res.id = snapId;
    return res;
  };

  /* ---------- sources ---------- */
  A.addSource = function (o) {
    if (!o || !o.title || String(o.title).trim().length < 3) return fail('A source needs a title.');
    var id = 'SRC-U-' + Date.now().toString(36).toUpperCase();
    var r = commit(function (d) { d.sources.push({ id: id, title: String(o.title).trim(), url: o.url ? String(o.url).trim() : '', capturedAt: ECC.ui.today(), label: 'User Entered', addedBy: 'you' }); });
    if (r.ok) r.id = id;
    return r;
  };

  /* ---------- discrepancies ----------
     r = { evidence, sourceId, observedOn, outcome } */
  A.resolveDiscrepancy = function (id, r) {
    var x = D().discrepancies.find(function (q) { return q.id === id; }), V = ECC.validate;
    if (!x) return fail('Discrepancy not found.');
    if (x.resolution) return fail(id + ' is already closed.');
    r = r || {};
    if (!r.evidence || String(r.evidence).trim().length < V.MIN_EVIDENCE) return fail('Closing ' + id + ' needs written evidence (at least ' + V.MIN_EVIDENCE + ' characters): what you saw, where and when.');
    var newSrc = null;
    if (r.newSource) {
      if (!r.newSource.title || String(r.newSource.title).trim().length < 3) return fail('Name the new source (at least 3 characters).');
      newSrc = { id: 'SRC-U-' + Date.now().toString(36).toUpperCase(), title: String(r.newSource.title).trim(), url: r.newSource.url ? String(r.newSource.url).trim() : '',
        capturedAt: ECC.ui.today(), label: 'User Entered', addedBy: 'you' };
      r.sourceId = newSrc.id;
    } else if (!r.sourceId || !ECC.q.source(r.sourceId)) return fail('Closing ' + id + ' needs a verified source from the source registry.');
    if ((x.disallowedSources || []).indexOf(r.sourceId) >= 0) return fail(id + ' cannot be closed on ' + r.sourceId + ' alone. ' + x.toResolve);
    if (!V.isDate(r.observedOn) || r.observedOn > ECC.ui.today()) return fail('Give the date you checked the source (not in the future).');
    return commit(function (d) {
      if (newSrc) d.sources.push(newSrc);
      var t = d.discrepancies.find(function (q) { return q.id === id; });
      t.resolution = { evidence: String(r.evidence).trim(), sourceId: r.sourceId, observedOn: r.observedOn, outcome: r.outcome ? String(r.outcome).trim() : '',
        resolvedAt: now(), label: 'User Entered' };
    }, id + ' closed with evidence. Original values kept.');
  };

  A.reopenDiscrepancy = function (id, reason) {
    var x = D().discrepancies.find(function (q) { return q.id === id; });
    if (!x || !x.resolution) return fail('Nothing to reopen.');
    if (!reason || String(reason).trim().length < 5) return fail('Say briefly why you are reopening it.');
    return commit(function (d) {
      var t = d.discrepancies.find(function (q) { return q.id === id; });
      t.history = (t.history || []).concat([{ resolution: t.resolution, reopenedAt: now(), reason: String(reason).trim() }]);
      t.resolution = null;
    }, id + ' reopened');
  };

  /* =======================  Phase 3: targets, planner, study log, milestones  ======================= */
  var isInt = function (v, lo, hi) { var n = Number(v); return v !== '' && v !== null && v !== undefined && Math.floor(n) === n && n >= lo && n <= hi; };
  var minOf = function (c) { return D().settings.minimumDailyMin[c]; };
  var certOk = function (c) { return ECC.q.certIds().indexOf(c) >= 0; };
  var hhmm = function (t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(t); };

  /* Default daily targets. Below a certification's 30-min minimum → refused. */
  A.setDailyTargets = function (t) {
    var bad = ECC.q.certIds().filter(function (c) { return !isInt(t[c], 0, 600) || Number(t[c]) < minOf(c); });
    if (bad.length) return fail('Daily target for ' + bad.map(ECC.q.certName).join(' and ') + ' must be a whole number of at least ' + minOf(bad[0]) + ' minutes.');
    return commit(function (d) {
      ECC.q.certIds().forEach(function (c) { d.settings.dailyTargetMin[c] = Number(t[c]); });
      d.settings.dailyTargetLabel = 'User Entered'; d.settings.dailyTargetSource = 'SRC-USER'; d.settings.dailyTargetUpdatedAt = now();
    }, 'Daily targets: ' + ECC.q.certIds().map(function (c) { return ECC.q.certName(c) + ' ' + t[c]; }).join(' · ') + ' min');
  };

  /* Per-day target. Empty value = use the default. Below the minimum → refused. */
  A.setDayTarget = function (date, t) {
    if (!ECC.validate.isDate(date)) return fail('Invalid date.');
    var o = {}, bad = [];
    ECC.q.certIds().forEach(function (c) {
      if (t[c] === '' || t[c] === null || t[c] === undefined) return;
      if (!isInt(t[c], 0, 600) || Number(t[c]) < minOf(c)) bad.push(c); else o[c] = Number(t[c]);
    });
    if (bad.length) return fail('Target for ' + bad.map(ECC.q.certName).join(' and ') + ' on ' + date + ' must be at least ' + minOf(bad[0]) + ' minutes.');
    return commit(function (d) {
      if (Object.keys(o).length) d.settings.dailyTargetOverrides[date] = o; else delete d.settings.dailyTargetOverrides[date];
    }, Object.keys(o).length ? 'Target for ' + date + ' updated' : 'Target for ' + date + ' reset to default');
  };

  function planFields(p, isNew) {
    if (!certOk(p.certificationId)) return 'Choose a certification.';
    if (!ECC.validate.isDate(p.date)) return 'Choose a date.';
    if (isNew && p.date < ECC.ui.today()) return 'Planned sessions are for today or later (log past study in the Study Log).';
    if (!isInt(p.plannedMinutes, 1, 720)) return 'Planned minutes must be a whole number from 1 to 720.';
    if (p.startTime && !hhmm(p.startTime)) return 'Start time must be HH:MM.';
    if (!((p.topic && String(p.topic).trim()) || p.moduleId)) return 'Give a module or topic.';
    return null;
  }
  A.addPlanned = function (p) {
    var err = planFields(p, true); if (err) return fail(err);
    var id = uid('ps');
    var r = commit(function (d) {
      d.plannedSessions.push({ id: id, certificationId: p.certificationId, date: p.date, startTime: p.startTime || null, plannedMinutes: Number(p.plannedMinutes),
        moduleId: p.moduleId || null, topic: (p.topic || '').trim(), notes: (p.notes || '').trim(), status: 'Planned', linkedActualId: null,
        label: 'User Entered', createdAt: now(), updatedAt: now() });
    }, 'Planned ' + p.plannedMinutes + ' min (' + ECC.q.certName(p.certificationId) + ') on ' + p.date);
    if (r.ok) r.id = id; return r;
  };
  A.updatePlanned = function (id, p) {
    var x = D().plannedSessions.find(function (q) { return q.id === id; });
    if (!x) return fail('Planned session not found.');
    if (x.status !== 'Planned') return fail('Only sessions that are still planned can be edited.');
    var m = Object.assign({}, x, p); var err = planFields(m, false); if (err) return fail(err);
    return commit(function (d) {
      var t = d.plannedSessions.find(function (q) { return q.id === id; });
      ['certificationId', 'date', 'startTime', 'moduleId', 'topic', 'notes'].forEach(function (k) { if (p[k] !== undefined) t[k] = p[k] || (k === 'topic' || k === 'notes' ? '' : null); });
      if (p.plannedMinutes !== undefined) t.plannedMinutes = Number(p.plannedMinutes);
      t.updatedAt = now();
    }, 'Planned session updated');
  };
  A.deletePlanned = function (id) {
    var x = D().plannedSessions.find(function (q) { return q.id === id; });
    if (!x) return fail('Planned session not found.');
    if (x.status === 'Done') return fail('This plan has study logged against it. Delete the study session first.');
    return commit(function (d) {
      d.plannedSessions = d.plannedSessions.filter(function (q) { return q.id !== id; });
      d.plannedSessions.forEach(function (q) { if (q.rescheduledTo === id) { q.rescheduledTo = null; q.status = 'Skipped'; } if (q.rescheduledFrom === id) q.rescheduledFrom = null; });
    }, 'Planned session deleted');
  };
  A.skipPlanned = function (id) {
    var x = D().plannedSessions.find(function (q) { return q.id === id; });
    if (!x || x.status !== 'Planned') return fail('Only planned sessions can be skipped.');
    return commit(function (d) { var t = d.plannedSessions.find(function (q) { return q.id === id; }); t.status = 'Skipped'; t.updatedAt = now(); }, 'Marked as skipped');
  };
  /* Moves an unfinished (planned, missed or skipped) session to a new date. The original stays in history as Rescheduled. */
  A.reschedulePlanned = function (id, newDate) {
    var x = D().plannedSessions.find(function (q) { return q.id === id; });
    if (!x) return fail('Planned session not found.');
    if (['Planned', 'Skipped'].indexOf(x.status) < 0) return fail('Only unfinished sessions can be rescheduled.');
    if (!ECC.validate.isDate(newDate) || newDate < ECC.ui.today()) return fail('Choose today or a later date.');
    if (newDate === x.date) return fail('Choose a different date.');
    var nid = uid('ps');
    var r = commit(function (d) {
      var t = d.plannedSessions.find(function (q) { return q.id === id; });
      d.plannedSessions.push({ id: nid, certificationId: t.certificationId, date: newDate, startTime: t.startTime || null, plannedMinutes: t.plannedMinutes,
        moduleId: t.moduleId || null, topic: t.topic || '', notes: t.notes || '', status: 'Planned', linkedActualId: null, rescheduledFrom: t.id,
        label: 'User Entered', createdAt: now(), updatedAt: now() });
      t.status = 'Rescheduled'; t.rescheduledTo = nid; t.updatedAt = now();
    }, 'Rescheduled to ' + newDate);
    if (r.ok) r.id = nid; return r;
  };
  A.rescheduleMany = function (ids, newDate) {
    if (!ECC.validate.isDate(newDate) || newDate < ECC.ui.today()) return fail('Choose today or a later date.');
    var list = D().plannedSessions.filter(function (q) { return ids.indexOf(q.id) >= 0 && ['Planned', 'Skipped'].indexOf(q.status) >= 0 && q.date !== newDate; });
    if (!list.length) return fail('Nothing to reschedule.');
    return commit(function (d) {
      list.forEach(function (o) {
        var t = d.plannedSessions.find(function (q) { return q.id === o.id; }), nid = uid('ps');
        d.plannedSessions.push({ id: nid, certificationId: t.certificationId, date: newDate, startTime: t.startTime || null, plannedMinutes: t.plannedMinutes,
          moduleId: t.moduleId || null, topic: t.topic || '', notes: t.notes || '', status: 'Planned', linkedActualId: null, rescheduledFrom: t.id,
          label: 'User Entered', createdAt: now(), updatedAt: now() });
        t.status = 'Rescheduled'; t.rescheduledTo = nid; t.updatedAt = now();
      });
    }, list.length + ' session' + (list.length === 1 ? '' : 's') + ' rescheduled to ' + newDate);
  };

  /* ---- Study log: explicit manual entry only. Unknown fields (timers, video length, browser usage) are refused. ---- */
  var ACTUAL_FIELDS = ['certificationId', 'date', 'durationMin', 'studyType', 'moduleId', 'topic', 'notes', 'startTime', 'confidence', 'plannedSessionId'];
  function actualFields(p) {
    var extra = Object.keys(p).filter(function (k) { return ACTUAL_FIELDS.indexOf(k) < 0; });
    if (extra.length) return 'Study time can only be entered manually; these fields are not accepted: ' + extra.join(', ') + '.';
    if (!certOk(p.certificationId)) return 'Choose a certification.';
    if (!ECC.validate.isDate(p.date)) return 'Choose the date you studied.';
    if (p.date > ECC.ui.today()) return 'The date is in the future — only study already done can be logged.';
    if (!isInt(p.durationMin, 1, 720)) return 'Duration must be a whole number of minutes from 1 to 720 (zero or negative is not allowed).';
    if (ECC.validate.STUDY_TYPES.indexOf(p.studyType) < 0) return 'Choose a study type.';
    if (!((p.topic && String(p.topic).trim()) || p.moduleId)) return 'Give the module or topic.';
    if (!(p.notes && String(p.notes).trim())) return 'Add notes on what you studied.';
    if (p.startTime && !hhmm(p.startTime)) return 'Start time must be HH:MM.';
    if (p.confidence !== undefined && p.confidence !== null && p.confidence !== '' && !isInt(p.confidence, 1, 5)) return 'Confidence must be 1–5.';
    return null;
  }
  A.logActual = function (p) {
    var err = actualFields(p); if (err) return fail(err);
    var plan = p.plannedSessionId ? D().plannedSessions.find(function (q) { return q.id === p.plannedSessionId; }) : null;
    if (p.plannedSessionId && (!plan || plan.status !== 'Planned')) return fail('That planned session is not open for logging.');
    if (plan && plan.certificationId !== p.certificationId) return fail('The planned session is for the other certification.');
    var id = uid('as');
    var r = commit(function (d) {
      d.actualSessions.push({ id: id, certificationId: p.certificationId, date: p.date, startTime: p.startTime || null, durationMin: Number(p.durationMin),
        studyType: p.studyType, moduleId: p.moduleId || null, topic: (p.topic || '').trim(), notes: String(p.notes).trim(),
        confidence: p.confidence === '' || p.confidence === undefined || p.confidence === null ? null : Number(p.confidence),
        plannedSessionId: plan ? plan.id : null, entryMethod: 'manual', label: 'User Entered', createdAt: now(), updatedAt: now() });
      if (plan) { var t = d.plannedSessions.find(function (q) { return q.id === plan.id; }); t.status = 'Done'; t.linkedActualId = id; t.updatedAt = now(); }
    }, 'Logged ' + p.durationMin + ' min of ' + ECC.q.certName(p.certificationId) + ' study');
    if (r.ok) r.id = id; return r;
  };
  A.updateActual = function (id, p) {
    var x = D().actualSessions.find(function (q) { return q.id === id; });
    if (!x) return fail('Study session not found.');
    var m = {}; ACTUAL_FIELDS.forEach(function (k) { if (k !== 'plannedSessionId' && (p[k] !== undefined ? p[k] : x[k]) !== undefined) m[k] = p[k] !== undefined ? p[k] : x[k]; });
    if (x.importedFrom && !(m.notes && String(m.notes).trim())) m.notes = '(imported from v1)';
    var extra = Object.keys(p).filter(function (k) { return ACTUAL_FIELDS.indexOf(k) < 0; });
    var err = extra.length ? 'Study time can only be entered manually; these fields are not accepted: ' + extra.join(', ') + '.' : actualFields(m); if (err) return fail(err);
    if (x.plannedSessionId) { var pl = D().plannedSessions.find(function (q) { return q.id === x.plannedSessionId; }); if (pl && pl.certificationId !== m.certificationId) return fail('This session is linked to a plan for the other certification.'); }
    return commit(function (d) {
      var t = d.actualSessions.find(function (q) { return q.id === id; });
      ['certificationId', 'date', 'studyType', 'moduleId', 'topic', 'notes', 'startTime'].forEach(function (k) { if (m[k] !== undefined) t[k] = m[k] || (k === 'moduleId' || k === 'startTime' ? null : ''); });
      t.durationMin = Number(m.durationMin);
      t.confidence = m.confidence === '' || m.confidence === undefined || m.confidence === null ? null : Number(m.confidence);
      t.updatedAt = now();
    }, 'Study session updated');
  };
  A.deleteActual = function (id) {
    if (!D().actualSessions.some(function (q) { return q.id === id; })) return fail('Study session not found.');
    return commit(function (d) {
      d.actualSessions = d.actualSessions.filter(function (q) { return q.id !== id; });
      d.plannedSessions.forEach(function (q) { if (q.linkedActualId === id) { q.linkedActualId = null; q.status = 'Planned'; q.updatedAt = now(); } });
    }, 'Study session deleted');
  };

  /* ---- milestones ---- */
  A.setMilestoneDate = function (id, date) {
    var m = D().milestones.find(function (q) { return q.id === id; });
    if (!m) return fail('Milestone not found.');
    if (date && !ECC.validate.isDate(date)) return fail('Invalid date.');
    return commit(function (d) { var t = d.milestones.find(function (q) { return q.id === id; }); t.targetDate = date || null; t.updatedAt = now(); },
      date ? 'Milestone date set to ' + date : 'Milestone back to its planned date');
  };
  A.setMilestoneStatus = function (id, status) {
    return commit(function (d) { var t = d.milestones.find(function (q) { return q.id === id; }); t.status = status; t.completedAt = status === 'Completed' ? now() : null; t.updatedAt = now(); }, 'Milestone: ' + status);
  };
})(window.ECC = window.ECC || {});
