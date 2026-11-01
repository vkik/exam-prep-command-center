/* =========================================================================
   planner.js — Phase 3 Study Planner: Day, Week and Planning-window views,
   editable daily targets (never below 30 min per certification), planned
   sessions with rescheduling, milestones and live feasibility.
   Planned minutes are shown beside actual minutes and never added to them.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui, C = ECC.calc;
  ECC.views = ECC.views || {};
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function link(view, date) { return '#/planner?view=' + view + (date ? '&date=' + date : ''); }
  function clampDate(d, s) { return d < s.startDate ? s.startDate : d > s.endDate ? s.endDate : d; }
  function stTag(st) { return '<span class="day-tag st-' + st.replace(' ', '') + '">' + st + '</span>'; }
  function msOn(date) { return ECC.store.data.milestones.filter(function (m) { return (m.targetDate || m.suggestedDate) === date; }); }
  function planStatePill(p) { var st = C.planState(p); return U.statusPill(st === 'Missed' ? 'Overdue' : st); }

  /* ---------------- planned-session dialog ---------------- */
  function openPlan(prefill, edit) {
    var x = edit || prefill || {}, cert = x.certificationId || 'gpmb';
    var m = U.modal(edit ? 'Edit planned session' : 'Plan a study session', '<p class="small muted">Planned time is a plan only — it never counts as study. Log actual study after you do it.</p>' +
      '<form id="plan-form" novalidate><div class="form-grid">' +
      '<div class="field"><label for="pl-cert">Certification <span class="req"></span></label><select id="pl-cert" name="certificationId">' + ECC.q.certIds().map(function (c) { return '<option value="' + c + '"' + (c === cert ? ' selected' : '') + '>' + U.esc(ECC.q.cert(c).code) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="pl-date">Date <span class="req"></span></label><input type="date" id="pl-date" name="date" min="' + U.today() + '" value="' + U.esc(x.date || U.today()) + '"></div>' +
      '<div class="field"><label for="pl-min">Planned minutes <span class="req"></span></label><input type="number" id="pl-min" name="plannedMinutes" min="1" max="720" value="' + U.esc(x.plannedMinutes || '') + '"></div>' +
      '<div class="field"><label for="pl-start">Start time (optional)</label><input type="time" id="pl-start" name="startTime" value="' + U.esc(x.startTime || '') + '"></div>' +
      '<div class="field"><label for="pl-mod">Module</label><select id="pl-mod" name="moduleId">' + ECC.studyLog.moduleOptions(cert, x.moduleId) + '</select></div>' +
      '<div class="field"><label for="pl-topic">Topic</label><input id="pl-topic" name="topic" value="' + U.esc(x.topic || '') + '" placeholder="Module or topic is required"></div>' +
      '<div class="field full"><label for="pl-notes">Notes</label><input id="pl-notes" name="notes" value="' + U.esc(x.notes || '') + '"></div>' +
      '</div><div id="plan-errors"></div><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="plan-save">' + (edit ? 'Save' : 'Add to plan') + '</button></div></form>', { wide: true });
    U.$('#pl-cert', m).addEventListener('change', function (e) { U.$('#pl-mod', m).innerHTML = ECC.studyLog.moduleOptions(e.target.value, null); });
    U.$('#plan-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = U.formData(e.target);
      var p = { certificationId: f.certificationId, date: f.date, plannedMinutes: f.plannedMinutes === '' ? '' : Number(f.plannedMinutes), startTime: f.startTime || null, moduleId: f.moduleId || null, topic: f.topic, notes: f.notes };
      var r = edit ? ECC.actions.updatePlanned(edit.id, p) : ECC.actions.addPlanned(p);
      if (r.ok) U.closeModal(); else U.$('#plan-errors', m).innerHTML = U.warn(U.esc(r.error), 'conflict');
    });
  }

  function openReschedule(ids) {
    var m = U.modal('Reschedule ' + (ids.length === 1 ? 'session' : ids.length + ' sessions'), '<form id="rs-form" novalidate><div class="field"><label for="rs-date">New date <span class="req"></span></label>' +
      '<input type="date" id="rs-date" name="date" min="' + U.today() + '" value="' + U.today() + '"></div><p class="tiny muted">The original stays in history as “Rescheduled”.</p><div id="rs-errors"></div>' +
      '<div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="rs-save">Reschedule</button></div></form>');
    U.$('#rs-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var dt = U.formData(e.target).date;
      var r = ids.length === 1 ? ECC.actions.reschedulePlanned(ids[0], dt) : ECC.actions.rescheduleMany(ids, dt);
      if (r.ok) U.closeModal(); else U.$('#rs-errors', m).innerHTML = U.warn(U.esc(r.error), 'conflict');
    });
  }

  /* ---------------- views ---------------- */
  function windowView(s) {
    var start = s.startDate, end = s.endDate, today = U.today();
    var first = U.weekStart(start), last = U.addDays(U.weekStart(end), 6), days = U.dateRange(first, last);
    return '<div class="cal" id="plan-window" role="grid" aria-label="Planning window">' + DOW.map(function (d) { return '<div class="cal-dow" role="columnheader">' + d + '</div>'; }).join('') +
      days.map(function (d) {
        var out = d < start || d > end;
        if (out) return '<div class="cal-day out" aria-hidden="true"><div class="cal-num">' + U.parseDate(d).getDate() + '</div></div>';
        var lines = ECC.q.certIds().map(function (c) {
          var st = C.dayStatus(c, d);
          return '<div class="cal-line"><span>' + (c === 'gpmb' ? 'G' : 'D') + '</span><b class="st-' + st.status.replace(' ', '') + '">' + st.actual + '/' + st.target + '</b>' + (st.planned ? '<span class="tiny">P ' + st.planned + '</span>' : '<span></span>') + '</div>';
        }).join('');
        var ms = msOn(d);
        return '<a class="cal-day' + (d === today ? ' today' : '') + '" href="' + link('day', d) + '" data-date="' + d + '" role="gridcell" aria-label="' + U.fmtDate(d, 'dow') + '">' +
          '<div class="cal-num"><span>' + U.parseDate(d).getDate() + (U.parseDate(d).getDate() === 1 || d === start ? ' ' + U.fmtDate(d, 'short').split(' ')[1] : '') + '</span>' +
          (ms.length ? '<span class="ms-dot" title="' + U.esc(ms.map(function (m) { return m.title; }).join('; ')) + '">◆</span>' : '') + '</div>' + lines + '</a>';
      }).join('') + '</div>' +
      '<p class="tiny muted mt">Each line: actual / target minutes (G = GPM-b, D = Project DPro); “P” = planned minutes, shown separately. ◆ = milestone (planning target).</p>';
  }

  function weekView(s, date) {
    var ws = U.weekStart(date), days = U.dateRange(ws, U.addDays(ws, 6));
    var tot = {}; ECC.q.certIds().forEach(function (c) { tot[c] = { t: 0, p: 0, a: 0 }; });
    var rows = days.map(function (d) {
      var inWin = d >= s.startDate && d <= s.endDate;
      return '<tr data-date="' + d + '"' + (inWin ? '' : ' class="muted"') + '><td class="nowrap"><a href="' + link('day', d) + '">' + U.fmtDate(d, 'dow') + '</a></td>' +
        ECC.q.certIds().map(function (c) {
          var st = C.dayStatus(c, d);
          if (inWin) { tot[c].t += st.target; tot[c].p += st.planned; tot[c].a += st.actual; }
          return '<td class="num">' + (inWin ? st.target : '—') + '</td><td class="num">' + st.planned + '</td><td class="num"><strong>' + st.actual + '</strong></td><td>' + (inWin ? stTag(st.status) : '') + '</td>';
        }).join('') + '<td class="small">' + msOn(d).map(function (m) { return '◆ ' + U.esc(m.title); }).join('<br>') + '</td></tr>';
    }).join('');
    return '<div class="row-between"><a class="btn btn-sm" href="' + link('week', U.addDays(ws, -7)) + '">← Previous week</a><strong>Week of ' + U.fmtDate(ws) + '</strong><a class="btn btn-sm" href="' + link('week', U.addDays(ws, 7)) + '">Next week →</a></div>' +
      '<div class="table-wrap mt"><table id="week-table"><thead><tr><th rowspan="2">Day</th>' + ECC.q.certIds().map(function (c) { return '<th colspan="4">' + U.esc(ECC.q.cert(c).code) + '</th>'; }).join('') + '<th rowspan="2">Milestones</th></tr>' +
      '<tr>' + ECC.q.certIds().map(function () { return '<th class="num">Target</th><th class="num">Planned</th><th class="num">Actual</th><th>Status</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr id="week-totals"><th>Week total</th>' + ECC.q.certIds().map(function (c) { return '<th class="num">' + tot[c].t + '</th><th class="num">' + tot[c].p + '</th><th class="num">' + tot[c].a + '</th><th></th>'; }).join('') + '<th></th></tr></tfoot></table></div>' +
      '<p class="tiny muted">Planned and actual are separate columns; planned minutes are never added to actual.</p>';
  }

  function dayView(s, date) {
    var d = ECC.store.data, ov = s.dailyTargetOverrides[date] || {}, today = U.today();
    return '<div class="row-between"><a class="btn btn-sm" href="' + link('day', U.addDays(date, -1)) + '">← Previous day</a><strong id="day-title">' + U.fmtDate(date, 'dow') + (date === today ? ' · today' : '') + '</strong><a class="btn btn-sm" href="' + link('day', U.addDays(date, 1)) + '">Next day →</a></div>' +
      (msOn(date).length ? U.warn(msOn(date).map(function (m) { return '◆ <strong>' + U.esc(m.title) + '</strong>'; }).join('<br>') + '<br><span class="tiny">Planning target — not a confirmed exam appointment.</span>', 'info') : '') +
      '<div class="grid grid-2 mt">' + ECC.q.certIds().map(function (c) {
        var st = C.dayStatus(c, date);
        var plans = d.plannedSessions.filter(function (p) { return p.certificationId === c && p.date === date; });
        var acts = d.actualSessions.filter(function (a) { return a.certificationId === c && a.date === date; });
        return '<section class="card" data-cert="' + c + '"><div class="card-head"><div><h3>' + U.esc(ECC.q.cert(c).name) + '</h3><div class="card-sub">Target ' + st.target + ' min' + (ov[c] !== undefined ? ' (set for this day)' : ' (default)') + '</div></div>' + stTag(st.status) + '</div>' +
          '<div class="split"><div><div class="kpi-label">Planned</div><div class="kpi-value" data-k="planned">' + st.planned + 'm</div></div><div><div class="kpi-label">Actual (logged)</div><div class="kpi-value teal" data-k="actual">' + st.actual + 'm</div></div></div>' +
          '<form class="day-target row mt" data-cert="' + c + '" novalidate><label class="small">Target for this day <input type="number" name="t" min="' + s.minimumDailyMin[c] + '" max="600" value="' + (ov[c] !== undefined ? ov[c] : '') + '" placeholder="' + s.dailyTargetMin[c] + '" aria-label="Target for ' + U.esc(ECC.q.cert(c).code) + ' on this day"></label>' +
          '<button class="btn btn-sm" type="submit">Set</button>' + (ov[c] !== undefined ? '<button class="btn btn-sm btn-ghost day-reset" type="button" data-cert="' + c + '">Use default</button>' : '') + '<span class="tiny muted">min ' + s.minimumDailyMin[c] + '</span></form>' +
          '<h4 class="mt">Planned sessions</h4>' + (plans.length ? '<ul class="plan-list">' + plans.map(function (p) {
            var md = p.moduleId ? d.modules.find(function (m) { return m.id === p.moduleId; }) : null, open = p.status === 'Planned', past = C.planState(p) === 'Missed';
            return '<li data-plan="' + p.id + '"><div class="row-between"><span><strong>' + p.plannedMinutes + ' min</strong>' + (p.startTime ? ' · ' + p.startTime : '') + ' · ' + U.esc([md ? md.title : '', p.topic].filter(Boolean).join(' · ')) + '</span>' + planStatePill(p) + '</div>' +
              (p.rescheduledFrom ? '<div class="tiny muted">Rescheduled from an earlier date</div>' : '') + (p.status === 'Rescheduled' ? '<div class="tiny muted">Moved to ' + U.esc((d.plannedSessions.find(function (q) { return q.id === p.rescheduledTo; }) || {}).date || '?') + '</div>' : '') +
              '<div class="row mt-s">' + (open && date <= today ? '<button class="btn btn-sm btn-primary pl-log" data-id="' + p.id + '">Log actual…</button>' : '') +
              (open || p.status === 'Skipped' ? '<button class="btn btn-sm pl-res" data-id="' + p.id + '">Reschedule…</button>' : '') +
              (open && !past ? '<button class="btn btn-sm pl-edit" data-id="' + p.id + '">Edit</button>' : '') + (open ? '<button class="btn btn-sm btn-ghost pl-skip" data-id="' + p.id + '">Skip</button>' : '') +
              (p.status !== 'Done' && p.status !== 'Rescheduled' ? '<button class="btn btn-sm btn-ghost pl-del" data-id="' + p.id + '" aria-label="Delete planned session">✕</button>' : '') + '</div></li>';
          }).join('') + '</ul>' : '<p class="small muted">None planned.</p>') +
          (date >= today ? '<button class="btn btn-sm pl-add" data-cert="' + c + '">+ Plan a session</button>' : '') +
          '<h4 class="mt">Logged study</h4>' + (acts.length ? '<ul class="plan-list">' + acts.map(function (a) { return '<li>' + a.durationMin + ' min · ' + U.esc(a.studyType) + ' · ' + U.esc(a.topic || '') + '</li>'; }).join('') + '</ul>' : '<p class="small muted">Nothing logged.</p>') +
          (date <= today ? '<button class="btn btn-sm lg-add" data-cert="' + c + '">+ Log study…</button>' : '') + '</section>';
      }).join('') + '</div>';
  }

  function feasCard(f) {
    var title = f.milestone.title + (f.cert ? '' : ' (both certifications)');
    var pill = f.status === 'ok' ? '<span class="pill p-done">On track</span>' : f.status === 'short' ? '<span class="pill p-miss">Short</span>' : '<span class="pill p-lock">Date passed</span>';
    var vPct = f.budget ? Math.min(100, f.videoMin / f.budget * 100) : 0;
    return '<div class="card feas" data-feas="' + f.id + '"><div class="card-head"><div><h3>' + U.esc(title) + '</h3><div class="card-sub">' + f.id + ' · by ' + U.fmtDate(f.date) + ' ' + U.badge(f.dateLabel) + '</div></div>' + pill + '</div>' +
      '<div class="budget-bar" role="img" aria-label="Budget split: content ' + f.videoMin + ' minutes, buffer ' + f.bufferMin + ' minutes"><div class="bb-video" style="width:' + vPct + '%"></div><div class="bb-buffer" style="width:' + (f.margin >= 0 ? 100 - vPct : 0) + '%"></div></div>' +
      '<div class="legend"><span><span class="sw c-gpmb"></span>' + (f.cert === 'dpro' ? 'Course content' : f.cert ? 'Video watching' : 'Video + course content') + '</span><span><span class="sw c-dpro"></span>Notes · revision · practice buffer</span></div>' +
      '<div class="metric-line"><span>Budget: ' + f.days + ' days of targets (' + f.dailyTarget + ' min/day default)</span><strong data-k="budget">' + U.fmtMin(f.budget) + '</strong></div>' +
      '<div class="metric-line"><span>' + (f.cert === 'dpro' ? 'Remaining course content' : f.cert ? 'Remaining video (1× speed)' : 'Remaining video + course content') + '</span><strong data-k="video">' + U.fmtMin(f.videoMin) + '</strong></div>' +
      '<div class="metric-line"><span>' + (f.margin >= 0 ? 'Buffer for notes, revision &amp; practice' : 'Deficit') + '</span><strong data-k="margin" class="' + (f.margin >= 0 ? '' : 'err') + '">' + (f.margin >= 0 ? U.fmtMin(f.bufferMin) + (f.bufferPct !== null ? ' (' + f.bufferPct.toFixed(0) + '%)' : '') : '−' + U.fmtMin(-f.margin)) + '</strong></div>' +
      '<div class="metric-line"><span>Logged so far (actual)</span><span>video ' + U.fmtMin(f.logged.video) + ' · other ' + U.fmtMin(f.logged.buffer) + '</span></div></div>';
  }
  ECC.planner = { feasCard: feasCard };

  function milestonesTable() {
    var d = ECC.store.data;
    return '<div class="table-wrap"><table id="ms-table"><thead><tr><th>Milestone</th><th>Cert.</th><th>Date</th><th>Your date</th><th>Status</th></tr></thead><tbody>' +
      d.milestones.slice().sort(function (a, b) { return (a.targetDate || a.suggestedDate) < (b.targetDate || b.suggestedDate) ? -1 : 1; }).map(function (m) {
        return '<tr data-ms="' + m.id + '"' + (m.primary ? ' class="primary"' : '') + '><td>' + (m.primary ? '<strong>' + U.esc(m.title) + '</strong>' : U.esc(m.title)) + '</td><td>' + U.esc(m.certificationId ? ECC.q.certName(m.certificationId) : 'Both') + '</td>' +
          '<td class="nowrap">' + U.fmtDate(m.targetDate || m.suggestedDate) + ' ' + U.badge(m.targetDate ? 'User Entered' : m.suggestedDateLabel) + '</td>' +
          '<td><input type="date" class="ms-date" data-id="' + m.id + '" value="' + (m.targetDate || '') + '" aria-label="Your date for ' + U.esc(m.title) + '"></td>' +
          '<td><select class="ms-status" data-id="' + m.id + '" aria-label="Status of ' + U.esc(m.title) + '">' + U.options(['Not Started', 'In Progress', 'Completed'], m.status) + '</select></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  ECC.views.planner = {
    title: 'Study Planner',
    render: function (el) {
      var d = ECC.store.data, s = d.settings, view = U.hashParam('view') || 'window';
      if (['day', 'week', 'window'].indexOf(view) < 0) view = 'window';
      var date = U.hashParam('date'); date = ECC.validate.isDate(date) ? date : clampDate(U.today(), s);
      var missed = C.missedPlans(), feas = C.feasibility(), w = C.workload();
      el.innerHTML = '<div class="page-head"><div><h1 class="sr-only">Study Planner</h1><p>' + U.esc(s.milestoneNote || s.note) + '</p></div>' +
        '<button class="btn btn-primary" id="plan-add-top">+ Plan a session</button></div>' +
        '<nav class="tabs" aria-label="Planner view">' + [['day', 'Day'], ['week', 'Week'], ['window', 'Planning window']].map(function (v) {
          return '<a class="tab" href="' + link(v[0], v[0] === 'window' ? '' : date) + '"' + (v[0] === view ? ' aria-current="page"' : '') + '>' + v[1] + '</a>'; }).join('') + '</nav>' +
        '<div class="grid planner-top"><section class="card" id="targets-card"><div class="card-head"><div><h2>Daily targets</h2><div class="card-sub">Default for every day · minimum ' + s.minimumDailyMin.gpmb + ' min per certification · ' + U.badge(s.dailyTargetLabel) + '</div></div></div>' +
        '<form id="targets-form" class="row" novalidate>' + ECC.q.certIds().map(function (c) { return '<label class="small">' + U.esc(ECC.q.cert(c).code) + ' <input type="number" name="' + c + '" min="' + s.minimumDailyMin[c] + '" max="600" value="' + s.dailyTargetMin[c] + '" class="tgt-in"> min</label>'; }).join('') +
        '<button class="btn btn-sm btn-primary" type="submit" id="targets-save">Save targets</button></form>' +
        '<p class="small mt mb0" id="targets-summary">' + w.defaultDaily + ' min/day by default · whole period ' + U.fmtMin(w.totalMin) + ' (' + ECC.q.certIds().map(function (c) { return ECC.q.cert(c).code + ' ' + U.fmtMin(w.perCert[c]); }).join(', ') + ')</p></section>' +
        (missed.length ? '<section class="card card-gold" id="missed-card"><div class="card-head"><div><h2>Unfinished planned sessions</h2><div class="card-sub">' + missed.length + ' overdue or skipped</div></div>' +
          '<button class="btn btn-sm" id="res-all">Reschedule all…</button></div><ul class="plan-list">' + missed.slice(0, 6).map(function (p) {
            return '<li data-plan="' + p.id + '"><div class="row-between"><span>' + U.fmtDate(p.date, 'short') + ' · ' + U.esc(ECC.q.certName(p.certificationId)) + ' · ' + p.plannedMinutes + ' min · ' + U.esc(p.topic || '') + '</span>' + planStatePill(p) + '</div><button class="btn btn-sm pl-res mt-s" data-id="' + p.id + '">Reschedule…</button></li>';
          }).join('') + '</ul></section>' : '') + '</div>' +
        '<div class="mt" id="plan-view" data-view="' + view + '">' + (view === 'day' ? dayView(s, date) : view === 'week' ? weekView(s, date) : windowView(s)) + '</div>' +
        '<h2 class="section-title">Milestone feasibility (live) — planning targets, not exam appointments</h2>' +
        '<div class="grid grid-3" id="feas-grid">' + feas.map(feasCard).join('') + '</div>' +
        '<p class="tiny muted">Remaining content comes from platform data (watched / completed on the platform). Budget = your daily targets from today to the milestone, including per-day changes. What is left after the content is your buffer for notes, reading, revision, practice questions and mock exams.</p>' +
        '<h2 class="section-title">All milestones</h2>' + milestonesTable();

      U.$('#plan-add-top', el).addEventListener('click', function () { openPlan({ date: date >= U.today() ? date : U.today() }); });
      U.$('#targets-form', el).addEventListener('submit', function (e) { e.preventDefault(); ECC.actions.setDailyTargets(U.formData(e.target)); });
      var ra = U.$('#res-all', el); if (ra) ra.addEventListener('click', function () { openReschedule(missed.map(function (p) { return p.id; })); });
      U.$$('.day-target', el).forEach(function (f) {
        f.addEventListener('submit', function (e) { e.preventDefault(); var c = f.getAttribute('data-cert'), o = {}; var cur = s.dailyTargetOverrides[date] || {};
          ECC.q.certIds().forEach(function (k) { o[k] = k === c ? f.t.value : (cur[k] !== undefined ? cur[k] : ''); }); ECC.actions.setDayTarget(date, o); });
      });
      el.addEventListener('click', function (e) {
        var t = e.target.closest('button'); if (!t) return;
        var id = t.getAttribute('data-id'), plan = id ? d.plannedSessions.find(function (p) { return p.id === id; }) : null;
        if (t.classList.contains('day-reset')) { var c = t.getAttribute('data-cert'), cur = Object.assign({}, s.dailyTargetOverrides[date] || {}); cur[c] = ''; ECC.actions.setDayTarget(date, cur); }
        else if (t.classList.contains('pl-add')) openPlan({ certificationId: t.getAttribute('data-cert'), date: date });
        else if (t.classList.contains('lg-add')) ECC.studyLog.openDialog({ certificationId: t.getAttribute('data-cert'), date: date });
        else if (t.classList.contains('pl-log')) ECC.studyLog.openDialog({ certificationId: plan.certificationId, date: plan.date, topic: plan.topic, moduleId: plan.moduleId, plannedSessionId: plan.id });
        else if (t.classList.contains('pl-res')) openReschedule([id]);
        else if (t.classList.contains('pl-edit')) openPlan(null, plan);
        else if (t.classList.contains('pl-skip')) ECC.actions.skipPlanned(id);
        else if (t.classList.contains('pl-del')) U.confirm('Delete this planned session?', '<p>It is only a plan; no study time is affected.</p>', function () { ECC.actions.deletePlanned(id); }, { danger: true, yes: 'Delete' });
      });
      el.addEventListener('change', function (e) {
        var t = e.target;
        if (t.classList.contains('ms-date')) ECC.actions.setMilestoneDate(t.getAttribute('data-id'), t.value || null);
        if (t.classList.contains('ms-status')) ECC.actions.setMilestoneStatus(t.getAttribute('data-id'), t.value);
      });
    }
  };
})(window.ECC = window.ECC || {});
