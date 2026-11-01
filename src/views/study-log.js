/* =========================================================================
   study-log.js — Phase 3 Study Log. Actual study time is recorded ONLY by
   explicit manual entry here (or from a planned session, still typed by you).
   No timers, video lengths or browser activity are ever turned into study.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};
  var SL = ECC.studyLog = {};

  function moduleOptions(cert, sel) {
    return '<option value="">— none —</option>' + ECC.q.modules(cert).map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + U.esc((m.kind === 'module' && cert === 'gpmb' ? 'Module ' + m.order + ' — ' : '') + m.title) + '</option>';
    }).join('');
  }
  SL.moduleOptions = moduleOptions;

  /* prefill: { certificationId, date, topic, moduleId, plannedSessionId } ; edit: existing session */
  SL.openDialog = function (prefill, edit) {
    var x = edit || prefill || {}, cert = x.certificationId || 'gpmb', plan = prefill && prefill.plannedSessionId;
    var m = U.modal(edit ? 'Edit study session' : 'Log study session', '<p class="small muted">Enter study you have actually done. Planned time, video length and time on a platform never count — only what you enter here.' +
      (plan ? ' <strong>This will mark the planned session as Done.</strong>' : '') + '</p>' +
      '<form id="log-form" novalidate><div class="form-grid">' +
      '<div class="field"><label for="lg-cert">Certification <span class="req"></span></label><select id="lg-cert" name="certificationId"' + (plan ? ' disabled' : '') + '>' + ECC.q.certIds().map(function (c) { return '<option value="' + c + '"' + (c === cert ? ' selected' : '') + '>' + U.esc(ECC.q.cert(c).code) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="lg-date">Date <span class="req"></span></label><input type="date" id="lg-date" name="date" max="' + U.today() + '" value="' + U.esc(x.date && x.date <= U.today() ? x.date : U.today()) + '"></div>' +
      '<div class="field"><label for="lg-dur">Duration (minutes) <span class="req"></span></label><input type="number" id="lg-dur" name="durationMin" min="1" max="720" step="1" inputmode="numeric" value="' + (edit ? edit.durationMin : '') + '"></div>' +
      '<div class="field"><label for="lg-type">Study type <span class="req"></span></label><select id="lg-type" name="studyType"><option value="">Choose…</option>' + U.options(ECC.validate.STUDY_TYPES, x.studyType) + '</select></div>' +
      '<div class="field"><label for="lg-mod">Module</label><select id="lg-mod" name="moduleId">' + moduleOptions(cert, x.moduleId) + '</select></div>' +
      '<div class="field"><label for="lg-topic">Topic</label><input id="lg-topic" name="topic" value="' + U.esc(x.topic || '') + '" placeholder="Module or topic is required"></div>' +
      '<div class="field full"><label for="lg-notes">Notes <span class="req"></span></label><textarea id="lg-notes" name="notes" rows="2" placeholder="What you covered">' + U.esc(edit ? edit.notes || '' : '') + '</textarea></div>' +
      '<div class="field"><label for="lg-start">Start time (optional)</label><input type="time" id="lg-start" name="startTime" value="' + U.esc(x.startTime || '') + '"></div>' +
      '<div class="field"><label for="lg-conf">Confidence (optional)</label><select id="lg-conf" name="confidence"><option value="">—</option>' + U.options([1, 2, 3, 4, 5].map(function (n) { return { value: n, label: n + ' — ' + ['very low', 'low', 'moderate', 'good', 'high'][n - 1] }; }), x.confidence) + '</select></div>' +
      '</div><div id="log-errors"></div><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="log-save">' + (edit ? 'Save changes' : 'Log session') + '</button></div></form>', { wide: true });
    U.$('#lg-cert', m).addEventListener('change', function (e) { U.$('#lg-mod', m).innerHTML = moduleOptions(e.target.value, null); });
    U.$('#log-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = U.formData(e.target);
      var p = { certificationId: plan ? prefill.certificationId : f.certificationId, date: f.date, durationMin: f.durationMin === '' ? '' : Number(f.durationMin), studyType: f.studyType,
        moduleId: f.moduleId || null, topic: f.topic, notes: f.notes, startTime: f.startTime || null, confidence: f.confidence === '' ? null : Number(f.confidence) };
      if (plan) p.plannedSessionId = plan;
      var r = edit ? ECC.actions.updateActual(edit.id, p) : ECC.actions.logActual(p);
      if (r.ok) U.closeModal(); else U.$('#log-errors', m).innerHTML = U.warn(U.esc(r.error), 'conflict');
    });
  };

  ECC.views.log = {
    title: 'Study Log',
    render: function (el) {
      var d = ECC.store.data, s = d.settings, fc = U.hashParam('cert') || '', ft = U.hashParam('type') || '';
      var list = d.actualSessions.filter(function (x) { return (!fc || x.certificationId === fc) && (!ft || x.studyType === ft); })
        .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || ''); });
      var tot = ECC.q.certIds().map(function (c) { return { c: c, t: ECC.calc.studyTotals(c) }; });
      el.innerHTML = '<div class="page-head"><div><h1 class="sr-only">Study Log</h1><p>Actual study only — entered by you. Planned sessions live in the Planner and never count here.</p></div>' +
        '<button class="btn btn-primary" id="log-open">+ Log study session</button></div>' +
        '<div class="grid grid-3" id="log-totals">' + tot.map(function (o) {
          return '<div class="card kpi" data-cert="' + o.c + '"><span class="kpi-label">' + U.esc(ECC.q.cert(o.c).code) + ' — actual study</span><span class="kpi-value">' + U.fmtMin(o.t.total) + '</span>' +
            '<span class="kpi-foot">' + o.t.sessions + ' sessions · video ' + U.fmtMin(o.t.video) + ' · notes/reading/revision/practice ' + U.fmtMin(o.t.buffer) + '</span></div>';
        }).join('') +
        '<div class="card kpi"><span class="kpi-label">Both — actual study</span><span class="kpi-value" id="log-total-all">' + U.fmtMin(ECC.calc.studyTotals().total) + '</span><span class="kpi-foot">Since ' + U.fmtDate(s.startDate, 'short') + ' · targets: ' + ECC.q.certIds().map(function (c) { return ECC.q.cert(c).code + ' ' + s.dailyTargetMin[c]; }).join(' · ') + ' min/day</span></div></div>' +
        '<div class="row mt"><label class="small">Certification <select id="flt-cert"><option value="">All</option>' + ECC.q.certIds().map(function (c) { return '<option value="' + c + '"' + (c === fc ? ' selected' : '') + '>' + U.esc(ECC.q.cert(c).code) + '</option>'; }).join('') + '</select></label>' +
        '<label class="small">Type <select id="flt-type"><option value="">All</option>' + U.options(ECC.validate.STUDY_TYPES, ft) + '</select></label></div>' +
        (list.length ? '<div class="table-wrap mt"><table id="log-table"><thead><tr><th>Date</th><th>Cert.</th><th class="num">Minutes</th><th>Type</th><th>Module / topic</th><th>Notes</th><th class="num">Conf.</th><th></th></tr></thead><tbody>' +
          list.map(function (x) {
            var md = x.moduleId ? d.modules.find(function (m) { return m.id === x.moduleId; }) : null;
            return '<tr data-id="' + x.id + '"><td class="nowrap">' + U.fmtDate(x.date, 'short') + (x.startTime ? ' <span class="tiny muted">' + x.startTime + '</span>' : '') + '</td><td>' + U.esc(ECC.q.certName(x.certificationId)) + '</td>' +
              '<td class="num">' + x.durationMin + '</td><td>' + U.esc(x.studyType) + '</td><td class="small">' + U.esc([md ? md.title : '', x.topic].filter(Boolean).join(' · ')) + (x.plannedSessionId ? ' <span class="tag">from plan</span>' : '') + '</td>' +
              '<td class="small">' + U.esc(x.notes || '') + '</td><td class="num">' + (x.confidence || '—') + '</td>' +
              '<td class="nowrap"><button class="btn btn-sm lg-edit" data-id="' + x.id + '">Edit</button> <button class="btn btn-sm btn-ghost lg-del" data-id="' + x.id + '" aria-label="Delete session">✕</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="mt">' + U.empty('No study sessions recorded', 'Use “Log study session” after you study. Nothing is logged automatically.') + '</div>');
      U.$('#log-open', el).addEventListener('click', function () { SL.openDialog({ certificationId: fc || 'gpmb' }); });
      var go = function () { var c = U.$('#flt-cert', el).value, t = U.$('#flt-type', el).value; location.hash = '#/log' + (c || t ? '?' + [c ? 'cert=' + c : '', t ? 'type=' + encodeURIComponent(t) : ''].filter(Boolean).join('&') : ''); };
      U.$('#flt-cert', el).addEventListener('change', go); U.$('#flt-type', el).addEventListener('change', go);
      el.addEventListener('click', function (e) {
        var ed = e.target.closest('.lg-edit'), dl = e.target.closest('.lg-del');
        if (ed) SL.openDialog(null, d.actualSessions.find(function (x) { return x.id === ed.getAttribute('data-id'); }));
        if (dl) U.confirm('Delete this study session?', '<p>This removes the minutes from your actual study. A planned session linked to it goes back to Planned.</p>', function () { ECC.actions.deleteActual(dl.getAttribute('data-id')); }, { danger: true, yes: 'Delete' });
      });
    }
  };
})(window.ECC = window.ECC || {});
