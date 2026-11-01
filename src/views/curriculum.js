/* =========================================================================
   curriculum.js — Phase 2 Curriculum tracker.
   One page, a tab per certification. Platform data (as reported by PM-Tricks
   / Ready CSOD) and your own status always sit in separate columns and are
   changed by separate actions: platform data only through a logged snapshot
   with evidence; your status only by your explicit choice. Locked platform
   items cannot be marked complete.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};
  var STATUSES = ['Not Started', 'In Progress', 'Completed'];
  var PLATFORM_STATUSES = ['Completed', 'In Progress', 'Not Started', 'Pending Prior Training'];

  function statusSelect(id, kind, value, locked, label) {
    var opts = STATUSES.map(function (s) {
      var dis = locked && s === 'Completed';
      return '<option value="' + s + '"' + (s === value ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + s + (dis ? ' (locked)' : '') + '</option>';
    }).join('');
    return '<select class="st-sel" data-kind="' + kind + '" data-id="' + U.esc(id) + '" aria-label="Your status: ' + U.esc(label) + '"' +
      (locked ? ' disabled title="Locked on the platform — cannot be marked complete"' : '') + '>' + opts + '</select>';
  }

  function summary(certId) {
    var cert = ECC.q.cert(certId), course = ECC.q.course(certId);
    var pp = ECC.calc.platformProgress(certId), me = ECC.calc.personalProgress(certId);
    var conflicts = ECC.store.data.discrepancies.filter(function (x) { return x.certificationId === certId && !x.resolution && x.label === 'Conflicting Data'; });
    var snaps = course.platformProgressSnapshots.length;
    return '<div class="grid grid-2 cur-summary">' +
      '<section class="card card-teal" id="cur-platform" aria-labelledby="cur-platform-h"><div class="card-head"><div><h2 id="cur-platform-h">Platform progress</h2>' +
      '<div class="card-sub">As reported by ' + U.esc(course.platform) + ' — changes only when you log a snapshot</div></div>' +
      '<button class="btn btn-primary btn-sm" id="snap-open">Log platform snapshot…</button></div>' +
      '<div class="kpi-value teal" id="cur-platform-pct">' + U.pct(pp && pp.pct) + '</div>' + U.progressBar(pp && pp.pct, { label: cert.code + ' platform progress' }) +
      '<div class="kpi-foot">Snapshot ' + (pp ? U.fmtDate(pp.date) : '—') + ' ' + U.badge(pp && pp.label) + ' · ' + snaps + ' snapshot' + (snaps === 1 ? '' : 's') + ' in history' +
      (pp && pp.watched !== undefined && pp.watched !== null ? ' · ' + pp.watched + ' of ' + pp.total + ' lessons watched' : '') +
      conflicts.map(function (c) { return ' <a href="#/quality">' + U.badge('Conflicting Data') + ' ' + c.id + '</a>'; }).join('') + '</div></section>' +
      '<section class="card card-gold" id="cur-personal" aria-labelledby="cur-personal-h"><div class="card-head"><div><h2 id="cur-personal-h">Your progress</h2>' +
      '<div class="card-sub">Only what you mark yourself · weighted by duration</div></div></div>' +
      '<div class="kpi-value" id="cur-personal-pct">' + (me.recorded ? U.pct(me.pct, 1) : '—') + '</div>' + U.progressBar(me.recorded ? me.pct : null, { label: cert.code + ' personal progress', gold: true }) +
      '<div class="kpi-foot">' + (me.recorded ? me.completed + ' of ' + me.total + ' ' + me.unit + ' marked complete by you' : 'Not yet recorded by you') + '</div></section></div>';
  }

  function history(certId) {
    var course = ECC.q.course(certId), list = course.platformProgressSnapshots.slice().reverse();
    return '<h2 class="section-title">Platform snapshot history (newest first — snapshots are never edited)</h2>' +
      '<div class="table-wrap"><table id="snap-history"><thead><tr><th>Captured</th><th class="num">Overall %</th>' + (certId === 'gpmb' ? '<th class="num">Watched</th>' : '<th>Module states</th>') +
      '<th>Platform</th><th>Evidence / notes</th><th>Source</th></tr></thead><tbody>' +
      list.map(function (s) {
        var src = ECC.q.source(s.source);
        var mods = s.moduleStates ? Object.keys(s.moduleStates).map(function (k) { var m = s.moduleStates[k]; return k.replace('dpro-', '').toUpperCase() + ' ' + (m.locked ? 'locked' : m.platformStatus); }).join(' · ') : '—';
        return '<tr><td class="nowrap">' + U.fmtDate(s.snapshotDate) + '</td><td class="num">' + s.valuePct + '%</td>' +
          (certId === 'gpmb' ? '<td class="num">' + (s.watchedLessons !== undefined ? s.watchedLessons + ' / ' + s.totalLessons : '—') + '</td>' : '<td class="small">' + U.esc(mods) + '</td>') +
          '<td>' + U.esc(s.platform || course.platform) + '</td><td class="small">' + U.esc(s.evidence || (s.source === 'SRC-PMT' || s.source === 'SRC-CSOD' ? 'Baseline from the project brief' : '—')) + '</td>' +
          '<td class="nowrap">' + U.badge(s.label) + ' <span class="tiny muted">' + U.esc(src ? src.id : s.source) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------- GPM-b ---------------- */
  function gpmb(el, filter) {
    var mods = ECC.q.modules('gpmb'), course = ECC.q.course('gpmb');
    var all = ECC.q.lessons('gpmb'), total = all.reduce(function (a, l) { return a + l.durationSec; }, 0);
    var match = function (l) { return filter === 'unwatched' ? !l.platformWatched : filter === 'mine' ? l.personalStatus !== 'Completed' : true; };
    return '<div class="row-between mt"><p class="small muted mb0" id="gpmb-facts"><strong>' + all.length + ' lessons</strong> · ' + mods.length + ' modules · total <strong id="gpmb-total">' + U.fmtSec(total) + '</strong>' +
      ' · access until ' + U.fmtDate(course.accessExpires) + ' · ' + U.badge('Verified') + '</p>' +
      '<label class="small">Show <select id="cur-filter">' + U.options([{ value: 'all', label: 'All lessons' }, { value: 'unwatched', label: 'Not watched on platform' }, { value: 'mine', label: 'Not completed by you' }], filter) + '</select></label></div>' +
      mods.map(function (m) {
        var ls = all.filter(function (l) { return l.moduleId === m.id; }).sort(function (a, b) { return a.order - b.order; });
        var sum = ls.reduce(function (a, l) { return a + l.durationSec; }, 0), w = ls.filter(function (l) { return l.platformWatched; }).length;
        var mine = ls.filter(function (l) { return l.personalStatus === 'Completed'; }).length, shown = ls.filter(match);
        if (!shown.length) return '';
        return '<section class="card mt cur-module" data-module="' + m.id + '"><div class="card-head"><div><h3>Module ' + m.order + ' — ' + U.esc(m.title) + '</h3>' +
          '<div class="card-sub">' + ls.length + ' lessons · ' + U.fmtSec(sum) + ' · platform: ' + w + '/' + ls.length + ' watched · you: ' + mine + '/' + ls.length + ' complete</div></div>' +
          '<label class="small">Set all lessons <select class="bulk-sel" data-module="' + m.id + '" aria-label="Set your status for all lessons in module ' + m.order + '"><option value="">—</option>' + U.options(STATUSES) + '</select></label></div>' +
          '<div class="table-wrap"><table class="cur-table"><thead><tr><th class="num">#</th><th>Lesson</th><th class="num">Duration</th><th>Platform (PM-Tricks)</th><th>Your status</th></tr></thead><tbody>' +
          shown.map(function (l) {
            return '<tr data-lesson="' + l.id + '"><td class="num">' + l.order + '</td><td>' + U.esc(l.title) + '</td><td class="num">' + U.esc(l.duration) + '</td>' +
              '<td class="plat-cell">' + (l.platformWatched ? '<span class="pill p-done">Watched</span>' : '<span class="pill p-none">Not watched</span>') + '</td>' +
              '<td>' + statusSelect(l.id, 'lesson', l.personalStatus, false, l.title) + (l.personalUpdatedAt ? '' : ' <span class="tiny muted">not recorded</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div></section>';
      }).join('');
  }

  /* ---------------- Project DPro ---------------- */
  function dpro() {
    var mods = ECC.q.modules('dpro'), course = ECC.q.course('dpro');
    var tot = mods.reduce(function (a, m) { return a + m.durationSec; }, 0) / 60;
    return '<p class="small muted mt" id="dpro-facts"><strong>' + mods.filter(function (m) { return m.kind === 'module'; }).length + ' modules + course exam</strong> · total <strong id="dpro-total">' + tot + ' min</strong> (' + U.fmtMin(tot) + ') · ' + U.esc(course.courseType) + ' · ' + U.badge('Verified') + '</p>' +
      U.warn(U.esc(course.purposeNote) + ' ' + U.esc(course.zeroScoreNote), 'info') +
      '<div class="table-wrap mt"><table id="dpro-table" class="cur-table"><thead><tr><th>Item</th><th class="num">Duration</th><th>Platform status</th><th class="num">Platform %</th><th class="num">Time on platform</th><th>Last accessed</th><th>Displayed due</th><th>Your status</th></tr></thead><tbody>' +
      mods.map(function (m) {
        return '<tr data-module="' + m.id + '"' + (m.locked ? ' class="locked"' : '') + '><td><strong>' + U.esc(m.title) + '</strong>' +
          (m.locked ? '<div class="lock-note"><span class="pill p-lock">🔒 Locked on platform</span> <span class="tiny muted">' + U.esc(m.lockedReason || '') + '</span></div>' : '') +
          (m.topics && m.topics.length ? '<div class="tag-list mt-s">' + m.topics.map(function (t) { return '<span class="tag">' + U.esc(t) + '</span>'; }).join('') + '</div>' : (m.topicsNote ? '<div class="tiny muted">' + U.esc(m.topicsNote) + '</div>' : '')) + '</td>' +
          '<td class="num">' + (m.durationSec / 60) + ' min</td><td class="plat-cell">' + U.statusPill(m.platformStatus) + '</td>' +
          '<td class="num">' + (m.platformProgressPct === null || m.platformProgressPct === undefined ? '—' : m.platformProgressPct + '%') + (m.platformProgressNote ? '<div class="tiny muted">' + U.esc(m.platformProgressNote) + '</div>' : '') + '</td>' +
          '<td class="num">' + (m.platformTimeSpentMin === null || m.platformTimeSpentMin === undefined ? '—' : m.platformTimeSpentMin + ' min') + '</td>' +
          '<td class="nowrap">' + (m.lastAccessed ? U.fmtDate(m.lastAccessed, 'short') : '—') + '</td>' +
          '<td class="nowrap">' + (m.displayedDueDate ? U.fmtDate(m.displayedDueDate, 'short') + '<label class="tiny row"><input type="checkbox" class="due-rev" data-id="' + m.id + '"' + (m.dueDateReviewed ? ' checked' : '') + '> reviewed</label>' : '—') + '</td>' +
          '<td>' + statusSelect(m.id, 'module', m.personalStatus, m.locked, m.title) + (m.personalUpdatedAt ? '' : ' <div class="tiny muted">not recorded</div>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="tiny muted">Platform time spent is platform data and never counts as your study time. ' + U.esc(course.dueDateNote) + '</p>';
  }

  /* ---------------- snapshot dialogs ---------------- */
  function errBox(m, msg) { var b = U.$('#snap-errors', m); b.innerHTML = msg ? U.warn(U.esc(msg), 'conflict') : ''; if (msg) b.scrollIntoView({ block: 'nearest' }); }

  /* Both dialogs open pre-filled with the LATEST snapshot in history: overall %, source platform and
     every lesson/module state. You change only what differs, then add the new date and evidence.
     Saving always APPENDS a new snapshot; earlier snapshots are never edited. */
  function latest(course) { var h = course.platformProgressSnapshots; return h[h.length - 1]; }

  function commonFields(course, last) {
    return '<p class="prefill-note small" id="sn-prefill">' + U.badge(last.label) + ' Pre-filled from the snapshot of <strong>' + U.fmtDate(last.snapshotDate) + '</strong> (' + last.valuePct + '%). ' +
      'Change only what is different now, then add today’s date and evidence. That snapshot stays unchanged; this one is added after it.</p>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="sn-date">Capture date <span class="req"></span></label><input type="date" id="sn-date" name="snapshotDate" value="' + U.today() + '" max="' + U.today() + '" required></div>' +
      '<div class="field"><label for="sn-platform">Source platform <span class="req"></span></label><input id="sn-platform" name="platform" value="' + U.esc(last.platform || course.platform) + '" required></div>' +
      '<div class="field"><label for="sn-pct">Overall % shown on the platform <span class="req"></span></label><input type="number" id="sn-pct" name="valuePct" min="0" max="100" step="1" value="' + last.valuePct + '" data-prev="' + last.valuePct + '" required></div>' +
      '<div class="field full"><label for="sn-evidence">Evidence / notes for this reading <span class="req"></span></label><textarea id="sn-evidence" name="evidence" rows="2" placeholder="What you saw now and where, e.g. “M5 opened; header shows 67%; screenshot in OneDrive/Exam Preparation 2026/”" required></textarea></div></div>';
  }

  function diffBox(items) {
    return items.length ? '<strong>Changes since the last snapshot (' + items.length + '):</strong><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>'
      : '<strong>No changes since the last snapshot</strong> — saving records a confirmation reading.';
  }

  function openGpmbSnapshot() {
    var course = ECC.q.course('gpmb'), lessons = ECC.q.lessons('gpmb'), mods = ECC.q.modules('gpmb'), last = latest(course);
    var before = lessons.filter(function (l) { return l.platformWatched; }).length, d03 = ECC.calc.d03();
    var m = U.modal('Log PM-Tricks snapshot', '<form id="snap-form" novalidate>' + commonFields(course, last) +
      '<div class="snap-diff small mt" id="sn-diff" aria-live="polite"></div>' +
      '<h3 class="mt">Lessons shown as watched on PM-Tricks</h3><p class="small" id="sn-count" aria-live="polite"></p>' +
      '<div class="snap-lessons">' + mods.map(function (md) {
        return '<fieldset><legend>Module ' + md.order + ' — ' + U.esc(md.title) + '</legend>' + lessons.filter(function (l) { return l.moduleId === md.id; }).sort(function (a, b) { return a.order - b.order; }).map(function (l) {
          return '<label class="check"><input type="checkbox" name="w" value="' + l.id + '" data-prev="' + (l.platformWatched ? 1 : 0) + '"' + (l.platformWatched ? ' checked' : '') + '> ' + U.esc(l.title) + ' <span class="tiny muted">' + U.esc(l.duration) + '</span></label>';
        }).join('') + '</fieldset>';
      }).join('') + '</div><div id="snap-errors"></div>' +
      '<div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="snap-save">Save snapshot</button></div></form>', { wide: true });
    function refresh() {
      var boxes = U.$$('input[name=w]', m), n = boxes.filter(function (i) { return i.checked; }).length, diff = n - before, items = [];
      var line = '<strong>' + n + '</strong> of ' + lessons.length + ' watched (was ' + before + (diff ? ', ' + (diff > 0 ? '+' : '') + diff : ', no change') + ').';
      if (d03.state === 'waiting' && n === d03.expectedRecheckWatched) line += ' ' + U.badge('Conflicting Data') + ' <strong>This is the D-03 one-lesson recheck</strong> — enter the exact % PM-Tricks shows.';
      else if (d03.state === 'waiting' && n > d03.expectedRecheckWatched) line += ' <span class="tiny">D-03 protocol expects exactly ' + d03.expectedRecheckWatched + ' watched for the recheck; a different count still helps but is off-protocol.</span>';
      U.$('#sn-count', m).innerHTML = line;
      var pct = U.$('#sn-pct', m);
      pct.classList.toggle('changed', pct.value !== pct.getAttribute('data-prev'));
      if (pct.value !== pct.getAttribute('data-prev')) items.push('Overall %: ' + last.valuePct + '% → ' + (pct.value === '' ? '(empty)' : U.esc(pct.value) + '%'));
      boxes.forEach(function (i) {
        var ch = (i.checked ? '1' : '0') !== i.getAttribute('data-prev');
        i.parentNode.classList.toggle('changed', ch);
        if (ch) items.push(U.esc(lessons.find(function (l) { return l.id === i.value; }).title) + ': ' + (i.checked ? 'now watched' : 'no longer watched'));
      });
      U.$('#sn-diff', m).innerHTML = diffBox(items);
    }
    refresh();
    m.addEventListener('change', refresh); m.addEventListener('input', refresh);
    U.$('#snap-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = U.formData(e.target);
      var r = ECC.actions.logSnapshot('gpmb', { snapshotDate: f.snapshotDate, platform: f.platform, valuePct: f.valuePct === '' ? '' : Number(f.valuePct), evidence: f.evidence,
        watchedLessonIds: U.$$('input[name=w]:checked', m).map(function (i) { return i.value; }) });
      if (r.ok) U.closeModal(); else errBox(m, r.error);
    });
  }

  function openDproSnapshot() {
    var course = ECC.q.course('dpro'), mods = ECC.q.modules('dpro'), last = latest(course);
    var nv = function (v) { return v === null || v === undefined ? '' : String(v); };
    /* per-item values from the latest snapshot; the baseline snapshot has no per-item record, so the stored platform fields (which it set) are used */
    var prev = {};
    mods.forEach(function (md) {
      var st = (last.moduleStates && last.moduleStates[md.id]) || md;
      prev[md.id] = { st: st.platformStatus, pct: nv(st.platformProgressPct), time: nv(st.platformTimeSpentMin), la: st.lastAccessed || '', lk: !!st.locked };
    });
    var LABEL = { st: 'status', pct: '%', time: 'time', la: 'last accessed', lk: 'locked' };
    var m = U.modal('Log Ready CSOD snapshot', '<form id="snap-form" novalidate>' + commonFields(course, last) +
      '<p class="tiny muted">A module can be unlocked only after its prerequisite is Completed.</p>' +
      '<div class="table-wrap"><table class="snap-mods"><thead><tr><th>Item</th><th>Status</th><th>%</th><th>Time (min)</th><th>Last accessed</th><th>Locked</th></tr></thead><tbody>' +
      mods.map(function (md) {
        var p = prev[md.id];
        return '<tr data-mid="' + md.id + '"><td>' + U.esc(md.title) + '</td>' +
          '<td><select name="st" aria-label="Platform status ' + U.esc(md.title) + '">' + U.options(PLATFORM_STATUSES, p.st) + '</select></td>' +
          '<td><input type="number" name="pct" min="0" max="100" value="' + p.pct + '" aria-label="Platform % ' + U.esc(md.title) + '"></td>' +
          '<td><input type="number" name="time" min="0" value="' + p.time + '" aria-label="Time on platform ' + U.esc(md.title) + '"></td>' +
          '<td><input type="date" name="la" max="' + U.today() + '" value="' + p.la + '" aria-label="Last accessed ' + U.esc(md.title) + '"></td>' +
          '<td><input type="checkbox" name="lk"' + (p.lk ? ' checked' : '') + ' aria-label="Locked ' + U.esc(md.title) + '"></td></tr>';
      }).join('') + '</tbody></table></div><div class="snap-diff small mt" id="sn-diff" aria-live="polite"></div><div id="snap-errors"></div>' +
      '<div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="snap-save">Save snapshot</button></div></form>', { wide: true });
    function cur(tr) { var g = function (n) { return U.$('[name=' + n + ']', tr); }; return { st: g('st').value, pct: g('pct').value, time: g('time').value, la: g('la').value, lk: g('lk').checked }; }
    function refresh() {
      var items = [], pct = U.$('#sn-pct', m);
      pct.classList.toggle('changed', pct.value !== pct.getAttribute('data-prev'));
      if (pct.value !== pct.getAttribute('data-prev')) items.push('Overall %: ' + last.valuePct + '% → ' + (pct.value === '' ? '(empty)' : U.esc(pct.value) + '%'));
      U.$$('tr[data-mid]', m).forEach(function (tr) {
        var id = tr.getAttribute('data-mid'), c = cur(tr), p = prev[id], ch = [];
        ['st', 'pct', 'time', 'la', 'lk'].forEach(function (k) {
          var diff = c[k] !== p[k];
          U.$('[name=' + k + ']', tr).classList.toggle('changed', diff);
          if (diff) ch.push(LABEL[k] + ' ' + (k === 'lk' ? (p[k] ? 'locked' : 'open') + ' → ' + (c[k] ? 'locked' : 'open') : (p[k] === '' ? '—' : U.esc(p[k])) + ' → ' + (c[k] === '' ? '—' : U.esc(c[k]))));
        });
        tr.classList.toggle('changed', ch.length > 0);
        if (ch.length) items.push('<strong>' + U.esc(mods.find(function (x) { return x.id === id; }).title) + '</strong>: ' + ch.join('; '));
      });
      U.$('#sn-diff', m).innerHTML = diffBox(items);
    }
    refresh();
    m.addEventListener('change', refresh); m.addEventListener('input', refresh);
    U.$('#snap-form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = U.formData(e.target), modsOut = {};
      U.$$('tr[data-mid]', m).forEach(function (tr) {
        var g = function (n) { return U.$('[name=' + n + ']', tr); };
        var num = function (n) { var v = g(n).value; return v === '' ? null : Number(v); };
        modsOut[tr.getAttribute('data-mid')] = { platformStatus: g('st').value, platformProgressPct: num('pct'), platformTimeSpentMin: num('time'), lastAccessed: g('la').value || null, locked: g('lk').checked };
      });
      var r = ECC.actions.logSnapshot('dpro', { snapshotDate: f.snapshotDate, platform: f.platform, valuePct: f.valuePct === '' ? '' : Number(f.valuePct), evidence: f.evidence, modules: modsOut });
      if (r.ok) U.closeModal(); else errBox(m, r.error);
    });
  }

  ECC.views.curriculum = {
    title: 'Curriculum',
    render: function (el) {
      var cert = U.hashParam('cert') === 'dpro' ? 'dpro' : 'gpmb', filter = U.hashParam('show') || 'all';
      var c = ECC.q.cert(cert), course = ECC.q.course(cert);
      el.innerHTML = '<div class="page-head"><div><h1 class="sr-only">Curriculum</h1><p>' + U.esc(course.displayTitle) + ' (' + U.esc(course.platform) + '). ' +
        'Platform columns show what the platform reported in the latest snapshot; “Your status” is only what you set.</p></div></div>' +
        '<nav class="tabs" aria-label="Certification">' + ECC.q.certIds().map(function (id) {
          return '<a class="tab" href="#/curriculum?cert=' + id + '"' + (id === cert ? ' aria-current="page"' : '') + '>' + U.esc(ECC.q.cert(id).name) + '</a>';
        }).join('') + '</nav>' +
        summary(cert) + (cert === 'gpmb' ? gpmb(el, filter) : dpro()) + history(cert);

      U.$('#snap-open', el).addEventListener('click', cert === 'gpmb' ? openGpmbSnapshot : openDproSnapshot);
      var fs = U.$('#cur-filter', el);
      if (fs) fs.addEventListener('change', function () { location.hash = '#/curriculum?cert=gpmb' + (fs.value === 'all' ? '' : '&show=' + fs.value); });
      el.addEventListener('change', function (e) {
        var t = e.target;
        if (t.classList.contains('st-sel')) {
          var r = t.getAttribute('data-kind') === 'lesson' ? ECC.actions.setLessonStatus(t.getAttribute('data-id'), t.value) : ECC.actions.setModuleStatus(t.getAttribute('data-id'), t.value);
          if (!r.ok) ECC.render({ keepScroll: true });
        } else if (t.classList.contains('bulk-sel') && t.value) {
          var mid = t.getAttribute('data-module'), val = t.value, md = ECC.store.data.modules.find(function (x) { return x.id === mid; });
          var n = ECC.store.data.lessons.filter(function (l) { return l.moduleId === mid; }).length;
          t.value = '';
          U.confirm('Set your status for ' + n + ' lessons?', '<p>Mark every lesson in <strong>Module ' + md.order + ' — ' + U.esc(md.title) + '</strong> as <strong>' + U.esc(val) + '</strong> (your own status only — platform data is not changed).</p>',
            function () { ECC.actions.setModuleLessonsStatus(mid, val); }, { yes: 'Set ' + n + ' lessons' });
        } else if (t.classList.contains('due-rev')) {
          ECC.actions.setDueDateReviewed(t.getAttribute('data-id'), t.checked);
        }
      });
    }
  };
})(window.ECC = window.ECC || {});
