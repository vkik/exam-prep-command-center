/* =========================================================================
   overview.js — Phase 1 Overview: plan window, workload, platform vs personal
   progress (always separate), schedule feasibility, data-quality summary.
   Study-time figures arrive with the Study Log in Phase 3.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};

  function progressCard(certId) {
    var cert = ECC.q.cert(certId), course = ECC.q.course(certId);
    var pp = ECC.calc.platformProgress(certId), me = ECC.calc.personalProgress(certId);
    var conflict = ECC.store.data.discrepancies.filter(function (x) { return x.certificationId === certId && !x.resolution && /progress/i.test(x.title); })[0];
    return '<div class="card card-teal"><div class="card-head"><div><h3>' + U.esc(cert.name) + '</h3><div class="card-sub">' + U.esc(course.displayTitle) + ' · ' + U.esc(course.platform) + '</div></div><a class="btn btn-sm" href="#/curriculum?cert=' + certId + '">Open curriculum</a></div>' +
      '<div class="split"><div><div class="kpi-label">Platform progress</div><div class="kpi-value teal">' + U.pct(pp && pp.pct) + '</div>' +
      U.progressBar(pp && pp.pct, { label: cert.code + ' platform progress' }) +
      '<div class="kpi-foot">As shown on the platform · snapshot ' + (pp ? U.fmtDate(pp.date, 'short') : '—') + ' ' + U.badge(pp && pp.label) +
      (conflict ? ' <a href="#/quality">' + U.badge('Conflicting Data') + ' ' + conflict.id + '</a>' : '') + '</div></div>' +
      '<div><div class="kpi-label">Your progress</div><div class="kpi-value">' + (me.recorded ? U.pct(me.pct) : '—') + '</div>' +
      U.progressBar(me.recorded ? me.pct : null, { label: cert.code + ' personal progress', gold: true }) +
      '<div class="kpi-foot">' + (me.recorded ? me.completed + ' of ' + me.total + ' ' + me.unit + ' marked complete by you' : 'Not yet recorded by you (' + me.total + ' ' + me.unit + ')') + '</div></div></div></div>';
  }

  function studyBlock(today) {
    var C = ECC.calc, s = ECC.store.data.settings, ws = U.weekStart(today), we = U.addDays(ws, 6);
    if (!ECC.store.data.actualSessions.length && !ECC.store.data.plannedSessions.length) return U.empty('No study sessions recorded', 'Log actual study in the Study Log after you study. Plans are made in the Study Planner. The app never creates sessions for you.');
    return '<div class="table-wrap"><table id="ov-study"><thead><tr><th>Certification</th><th class="num">Today: actual / target</th><th class="num">Today: planned</th><th class="num">This week: actual / target</th><th class="num">This week: planned</th><th class="num">Since ' + U.fmtDate(s.startDate, 'short') + ': actual</th></tr></thead><tbody>' +
      ECC.q.certIds().map(function (c) {
        var wk = U.dateRange(ws, we), wt = 0, wp = 0, wa = 0;
        wk.forEach(function (d) { if (d >= s.startDate && d <= s.endDate) wt += C.target(c, d); wp += C.plannedMin(c, d); wa += C.actualMin(c, d); });
        var st = C.dayStatus(c, today);
        return '<tr data-cert="' + c + '"><td>' + U.esc(ECC.q.cert(c).code) + '</td><td class="num">' + st.actual + ' / ' + st.target + ' ' + '<span class="day-tag st-' + st.status.replace(' ', '') + '">' + st.status + '</span></td><td class="num">' + st.planned + '</td>' +
          '<td class="num">' + wa + ' / ' + wt + '</td><td class="num">' + wp + '</td><td class="num"><strong>' + U.fmtMin(C.studyTotals(c, s.startDate, today).total) + '</strong></td></tr>';
      }).join('') + '</tbody></table></div><p class="tiny muted">Planned minutes are shown separately and never added to actual study.</p>';
  }

  ECC.views.overview = {
    title: 'Overview',
    render: function (el) {
      var d = ECC.store.data, s = d.settings, today = U.today(), w = ECC.calc.workload();
      var daysLeft = U.daysBetween(today, s.readinessTargetDate);
      var dq = ECC.calc.discrepancies();
      el.innerHTML =
        '<div class="page-head"><div><h1 class="sr-only">Overview</h1><p>' + U.esc(s.note) + '</p></div>' + U.badge(s.label) + '</div>' +
        '<div class="grid grid-4">' +
        '<div class="card kpi"><span class="kpi-label">Days to readiness date</span><span class="kpi-value gold" id="kpi-days">' + Math.max(0, daysLeft) + '</span><span class="kpi-foot">' + U.fmtDate(s.startDate, 'short') + ' → ' + U.fmtDate(s.readinessTargetDate, 'short') + ' (planning dates)</span></div>' +
        '<div class="card kpi"><span class="kpi-label">Daily target</span><span class="kpi-value" id="kpi-daily">' + w.defaultDaily + ' min</span><span class="kpi-foot">' + ECC.q.certIds().map(function (c) { return U.esc(ECC.q.cert(c).code) + ' ' + s.dailyTargetMin[c] + ' (min ' + s.minimumDailyMin[c] + ')'; }).join(' · ') + ' ' + U.badge(s.dailyTargetLabel) + '</span></div>' +
        '<div class="card kpi"><span class="kpi-label">Planned workload, whole period</span><span class="kpi-value" id="kpi-workload">' + U.fmtMin(w.totalMin) + '</span><span class="kpi-foot">' + w.days + ' days · ' + ECC.q.certIds().map(function (c) { return U.esc(ECC.q.cert(c).code) + ' ' + U.fmtMin(w.perCert[c]); }).join(' · ') + '</span></div>' +
        '<div class="card kpi"><span class="kpi-label">Open data-quality items</span><span class="kpi-value" id="kpi-dq">' + dq.open.length + '</span><span class="kpi-foot"><a href="#/quality">Review on the Data Quality page</a></span></div>' +
        '</div>' +
        '<h2 class="section-title">Progress — platform and personal are tracked separately</h2>' +
        '<div class="grid grid-2">' + ECC.q.certIds().map(progressCard).join('') + '</div>' +
        '<h2 class="section-title">Milestone feasibility (live) — planning targets, not exam appointments</h2>' +
        '<div class="grid grid-3">' + ECC.calc.feasibility().map(ECC.planner.feasCard).join('') + '</div>' +
        '<h2 class="section-title">Study time — actual (logged by you) vs planned</h2>' + studyBlock(today);
    }
  };
})(window.ECC = window.ECC || {});
