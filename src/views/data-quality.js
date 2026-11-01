/* =========================================================================
   data-quality.js — Data Quality page: validation status (build-time and
   live), discrepancy register, verification checklist, source registry,
   labels. Unresolved items always stay visible. Discrepancies close
   only with written evidence and a registered source; values are never overwritten.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};

  var LABEL_HELP = {
    'Verified': 'From a platform snapshot or official source recorded on 31 Oct 2026',
    'User Entered': 'Recorded or decided by you',
    'Historical': 'A real record from before this plan',
    'Not Yet Verified': 'Listed or found publicly, but not yet confirmed by you',
    'Conflicting Data': 'Sources disagree; every value is kept',
    'Unavailable': 'Not known — shown as missing, never as 0',
    'Estimated Planning Value': 'A planning suggestion, not a fact'
  };

  function valuesTable(v) {
    return '<div class="tag-list">' + Object.keys(v || {}).map(function (k) {
      return '<span class="tag"><strong>' + U.esc(k) + ':</strong> ' + U.esc(typeof v[k] === 'object' ? JSON.stringify(v[k]) : v[k]) + '</span>';
    }).join('') + '</div>';
  }

  function d03Panel() {
    var r = ECC.calc.d03();
    var msg = {
      waiting: 'Waiting for the recheck: watch exactly one more GPM-b lesson, then log a PM-Tricks snapshot with ' + r.expectedRecheckWatched + ' watched lessons and the exact % shown.',
      explained: 'Explained by one rule: <strong>' + (r.alive[0] ? U.esc(r.alive[0].name) : '') + '</strong>. You can close D-03 with this as evidence.',
      ambiguous: 'Still ambiguous — ' + r.alive.length + ' rules fit every snapshot so far.' + (r.separatesAt ? ' They first predict different values at <strong>' + r.separatesAt.watched + ' watched lessons</strong> (' + r.separatesAt.values.map(function (v) { return v.id + ' → ' + v.pct + '%'; }).join(', ') + ').' : ''),
      unexplained: 'No tested rule fits every snapshot. Keep D-03 open and note what the platform shows.'
    }[r.state];
    return '<div class="d03 mt" id="d03-panel" data-state="' + r.state + '"><h4>Recheck protocol (live)</h4>' +
      U.warn(msg + (r.offProtocol ? ' <em>Note: no snapshot with exactly ' + r.expectedRecheckWatched + ' watched lessons was logged — the protocol step itself is not yet met.</em>' : ''), r.state === 'explained' ? 'ok' : r.state === 'unexplained' ? 'conflict' : 'info') +
      '<div class="table-wrap"><table id="d03-obs"><caption class="sr-only">PM-Tricks readings used for D-03</caption><thead><tr><th>Captured</th><th class="num">Watched</th><th class="num">Platform %</th><th>Role</th><th>Label</th></tr></thead><tbody>' +
      r.snapshots.map(function (sn, i) {
        var role = i === 0 ? 'Baseline' : sn === r.recheck ? 'One-lesson recheck' : 'Later reading';
        return '<tr><td>' + U.fmtDate(sn.snapshotDate, 'short') + '</td><td class="num">' + sn.watchedLessons + ' / ' + sn.totalLessons + '</td><td class="num">' + sn.valuePct + '%</td><td>' + role + '</td><td>' + U.badge(sn.label) + '</td></tr>';
      }).join('') + (r.state === 'waiting' ? '<tr class="muted"><td>Next</td><td class="num">' + r.expectedRecheckWatched + ' / 67</td><td class="num">?</td><td colspan="2">Log it from Curriculum → Log platform snapshot</td></tr>' : '') + '</tbody></table></div>' +
      '<div class="table-wrap mt"><table id="d03-hyp"><thead><tr><th>Rule</th><th>Status</th><th class="num">Predicts at ' + r.nextWatched + ' watched</th></tr></thead><tbody>' +
      r.hypotheses.map(function (h) {
        var e = h.eliminatedBy;
        return '<tr data-h="' + h.id + '" data-alive="' + h.alive + '"><td>' + h.id + ' ' + U.esc(h.name) + '</td><td>' + (h.alive ? '<span class="pill p-done">Fits all readings</span>' : '<span class="pill p-miss">Ruled out</span> <span class="tiny muted">by ' + e.valuePct + '% at ' + e.watchedLessons + ' watched</span>') +
          '</td><td class="num">' + (h.alive ? h.predictNext(r.nextWatched) + '%' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function discCard(x) {
    var res = x.resolution, resolved = !!res;
    var src = res ? ECC.q.source(res.sourceId) : null;
    return '<article class="card dq-item" data-disc="' + x.id + '" data-open="' + (!resolved) + '">' +
      '<div class="card-head"><div><h3><span class="dq-id">' + x.id + '</span> ' + U.esc(x.title) + '</h3>' +
      '<div class="card-sub">' + U.esc(x.certificationId ? ECC.q.certName(x.certificationId) : 'Both / general') + '</div></div>' +
      '<div class="row">' + U.badge(x.label) + '<span class="pill ' + (resolved ? 'p-done' : 'p-prog') + '">' + U.esc(resolved ? 'Resolved' : x.status) + '</span></div></div>' +
      valuesTable(x.values) +
      '<p class="small mt">' + U.esc(x.detail) + '</p>' +
      '<div class="metric-line"><span>How it is handled</span><span>' + U.esc(x.handling) + '</span></div>' +
      '<div class="metric-line"><span>To resolve</span><span>' + U.esc(x.toResolve) + '</span></div>' +
      '<div class="metric-line"><span>Closing requires</span><span>' + U.esc(x.closeRequires || 'Evidence') + (x.disallowedSources ? ' Not accepted on its own: ' + x.disallowedSources.map(U.esc).join(', ') + '.' : '') + '</span></div>' +
      (x.id === 'D-03' ? d03Panel() : '') +
      (resolved ? '<div class="resolution mt">' + U.warn('<strong>Closed ' + U.fmtDate(res.resolvedAt.slice(0, 10)) + '</strong> ' + U.badge(res.label) +
        '<br><strong>Evidence:</strong> ' + U.esc(res.evidence) + '<br><strong>Source:</strong> ' + U.esc(src ? src.id + ' — ' + src.title : res.sourceId) + ' · checked ' + U.fmtDate(res.observedOn) +
        (res.outcome ? '<br><strong>Outcome:</strong> ' + U.esc(res.outcome) : '') + '<br><span class="tiny">The original conflicting values above are kept unchanged.</span>', 'ok') + '</div>' : '') +
      ((x.history || []).length ? '<details class="mt"><summary class="small">Earlier closures (' + x.history.length + ')</summary><ul class="small">' + x.history.map(function (h) {
        return '<li>Closed ' + U.fmtDate(h.resolution.resolvedAt.slice(0, 10)) + ' on ' + U.esc(h.resolution.sourceId) + '; reopened ' + U.fmtDate(h.reopenedAt.slice(0, 10)) + ': ' + U.esc(h.reason) + '</li>';
      }).join('') + '</ul></details>' : '') +
      '<div class="form-actions">' + (resolved ? '<button class="btn btn-sm dq-reopen" data-id="' + x.id + '">Reopen…</button>' : '<button class="btn btn-sm btn-gold dq-close" data-id="' + x.id + '">Close with evidence…</button>') + '</div>' +
      '</article>';
  }

  function openClose(id) {
    var x = ECC.store.data.discrepancies.find(function (q) { return q.id === id; }), dis = x.disallowedSources || [];
    var opts = (ECC.store.data.sources || []).map(function (s) {
      var no = dis.indexOf(s.id) >= 0;
      return '<option value="' + U.esc(s.id) + '"' + (no ? ' disabled' : '') + '>' + U.esc(s.id + ' — ' + s.title) + (no ? ' (not accepted for ' + id + ')' : '') + '</option>';
    }).join('');
    var m = U.modal('Close ' + id + ' with evidence', '<p class="small"><strong>' + U.esc(x.title) + '</strong></p><p class="small muted">' + U.esc(x.toResolve) + '</p>' +
      '<form id="dq-form" novalidate><div class="form-grid">' +
      '<div class="field full"><label for="dq-evidence">Evidence <span class="req"></span></label><textarea id="dq-evidence" name="evidence" rows="3" placeholder="What exactly you saw, where, and when (at least ' + ECC.validate.MIN_EVIDENCE + ' characters)"></textarea></div>' +
      '<div class="field full"><label for="dq-source">Verified source <span class="req"></span></label><select id="dq-source" name="sourceId"><option value="">Choose a source…</option>' + opts + '<option value="__new">+ Add a new source…</option></select></div>' +
      '<div class="field full new-src" hidden><label for="dq-ns-title">New source — title <span class="req"></span></label><input id="dq-ns-title" name="nsTitle" placeholder="e.g. GPM Global — GPM-b certification page"></div>' +
      '<div class="field full new-src" hidden><label for="dq-ns-url">New source — URL or where it is</label><input id="dq-ns-url" name="nsUrl" placeholder="https://… or “PM-Tricks course page, Exam Details lesson”"></div>' +
      '<div class="field"><label for="dq-date">Date you checked <span class="req"></span></label><input type="date" id="dq-date" name="observedOn" value="' + U.today() + '" max="' + U.today() + '"></div>' +
      '<div class="field full"><label for="dq-outcome">Outcome (optional)</label><input id="dq-outcome" name="outcome" placeholder="e.g. Course card counts the 4 domain tests as 2"></div>' +
      '</div><div id="dq-errors"></div><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="dq-save">Close ' + id + '</button></div></form>', { wide: true });
    U.$('#dq-source', m).addEventListener('change', function (e) { U.$$('.new-src', m).forEach(function (n) { n.hidden = e.target.value !== '__new'; }); });
    U.$('#dq-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = U.formData(e.target);
      var r = ECC.actions.resolveDiscrepancy(id, { evidence: f.evidence, sourceId: f.sourceId === '__new' ? null : f.sourceId, observedOn: f.observedOn, outcome: f.outcome,
        newSource: f.sourceId === '__new' ? { title: f.nsTitle, url: f.nsUrl } : null });
      if (r.ok) U.closeModal(); else U.$('#dq-errors', m).innerHTML = U.warn(U.esc(r.error), 'conflict');
    });
  }

  function openReopen(id) {
    var m = U.modal('Reopen ' + id, '<form id="dq-ro" novalidate><div class="field"><label for="dq-reason">Why are you reopening it? <span class="req"></span></label><input id="dq-reason" name="reason"></div>' +
      '<p class="tiny muted">The earlier closure and its evidence are kept in the history.</p><div id="dq-errors"></div><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary">Reopen</button></div></form>');
    U.$('#dq-ro', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var r = ECC.actions.reopenDiscrepancy(id, U.formData(e.target).reason);
      if (r.ok) U.closeModal(); else U.$('#dq-errors', m).innerHTML = U.warn(U.esc(r.error), 'conflict');
    });
  }

  ECC.views.quality = {
    title: 'Data Quality',
    render: function (el) {
      var d = ECC.store.data, bv = window.ECC_VALIDATION || { summary: {}, results: [] };
      var live = ECC.validate.state(d), dq = ECC.calc.discrepancies();
      var filter = U.hashParam('show') === 'all' ? 'all' : 'open';
      var list = filter === 'all' ? dq.all : dq.open;
      var li = ECC.store.loadInfo || {};
      var warnRows = bv.results.filter(function (r) { return r.status !== 'PASS'; });
      el.innerHTML =
        '<div class="page-head"><div><h1 class="sr-only">Data Quality</h1><p>Every figure in the app carries a label and a source. Discrepancies stay open here until you close them with evidence; their original values are never overwritten.</p></div></div>' +
        '<div class="grid grid-3">' +
        '<div class="card kpi" id="dq-build"><span class="kpi-label">Source-data validation</span><span class="kpi-value ' + (bv.summary.FAIL ? '' : 'teal') + '">' + (bv.summary.FAIL ? bv.summary.FAIL + ' fail' : 'Passed') + '</span>' +
        '<span class="kpi-foot">' + (bv.summary.PASS || 0) + ' pass · ' + (bv.summary.WARN || 0) + ' warnings · ' + (bv.summary.FAIL || 0) + ' failures · data ' + U.esc(bv.dataVersion || '—') + '</span></div>' +
        '<div class="card kpi" id="dq-live"><span class="kpi-label">Your stored data (checked now)</span><span class="kpi-value ' + (live.ok ? 'teal' : '') + '">' + (live.ok ? 'Valid' : live.errors.length + ' errors') + '</span>' +
        '<span class="kpi-foot">' + live.warnings.length + ' warnings · schema ' + d.schemaVersion + ' · ' + (ECC.store.mode === 'test' ? 'TEST store' : 'real store') + '</span></div>' +
        '<div class="card kpi"><span class="kpi-label">Discrepancies</span><span class="kpi-value gold" id="dq-open">' + dq.open.length + ' open</span><span class="kpi-foot">' + dq.resolved.length + ' resolved · ' + dq.all.length + ' in register</span></div>' +
        '</div>' +
        (live.warnings.length ? U.warn('<strong>Warnings on your stored data:</strong><ul>' + live.warnings.map(function (w) { return '<li>' + U.esc(w) + '</li>'; }).join('') + '</ul>') : '') +
        (li.status === 'error' ? U.warn('<strong>Stored data problem at start-up.</strong> ' + U.esc(li.message), 'conflict') : '') +
        '<h2 class="section-title">Discrepancy register</h2>' +
        '<div class="row mb"><div class="seg" role="group" aria-label="Filter discrepancies">' +
        '<a class="btn btn-sm' + (filter === 'open' ? ' btn-primary' : '') + '" href="#/quality" aria-pressed="' + (filter === 'open') + '">Unresolved (' + dq.open.length + ')</a>' +
        '<a class="btn btn-sm' + (filter === 'all' ? ' btn-primary' : '') + '" href="#/quality?show=all" aria-pressed="' + (filter === 'all') + '">All (' + dq.all.length + ')</a></div></div>' +
        '<div class="stack" id="dq-list">' + (list.length ? list.map(discCard).join('') : U.empty('No unresolved discrepancies')) + '</div>' +
        '<h2 class="section-title">Validation checks needing attention</h2>' +
        '<div class="table-wrap"><table id="dq-checks"><thead><tr><th>Check</th><th>Status</th><th>Area</th><th>Detail</th></tr></thead><tbody>' +
        warnRows.map(function (r) { return '<tr><td class="nowrap">' + r.id + ' ' + U.esc(r.title) + '</td><td>' + (r.status === 'FAIL' ? '<span class="pill p-miss">FAIL</span>' : '<span class="pill p-prog">WARN</span>') + '</td><td>' + U.esc(r.area) + '</td><td class="small">' + U.esc(r.detail) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '<details class="card mt"><summary>All ' + bv.results.length + ' source-data checks</summary><div class="table-wrap mt"><table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>' +
        bv.results.map(function (r) { return '<tr><td class="nowrap">' + r.id + ' ' + U.esc(r.title) + '</td><td>' + r.status + '</td><td class="small">' + U.esc(r.detail) + '</td></tr>'; }).join('') + '</tbody></table></div></details>' +
        '<h2 class="section-title">Source registry</h2>' +
        '<div class="table-wrap"><table id="dq-sources"><thead><tr><th>ID</th><th>Source</th><th>Captured / retrieved</th><th>Note</th></tr></thead><tbody>' +
        (d.sources || []).map(function (s) {
          return '<tr><td class="nowrap">' + U.esc(s.id) + '</td><td>' + (s.url ? '<a href="' + U.esc(s.url) + '" target="_blank" rel="noopener">' + U.esc(s.title) + '</a>' : U.esc(s.title)) + '</td><td class="nowrap">' + U.esc(s.capturedAt || s.retrievedAt || '') + '</td><td class="small">' + U.esc(s.note || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<h2 class="section-title">Labels</h2>' +
        '<div class="table-wrap"><table><tbody>' + Object.keys(LABEL_HELP).map(function (k) { return '<tr><td class="nowrap">' + U.badge(k) + '</td><td class="small">' + LABEL_HELP[k] + '</td></tr>'; }).join('') + '</tbody></table></div>';
      el.addEventListener('click', function (e) {
        var c = e.target.closest('.dq-close'), o = e.target.closest('.dq-reopen');
        if (c) openClose(c.getAttribute('data-id'));
        if (o) openReopen(o.getAttribute('data-id'));
      });
    }
  };
})(window.ECC = window.ECC || {});
