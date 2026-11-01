/* =========================================================================
   app.js — Boot, hash router, shell (top bar, sidebar, mobile drawer).
   Adapted from v1.0.0. Views register as ECC.views[name] = { title, render(host) }.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  var current = 'overview';
  var VIEW_ORDER = ['overview', 'planner', 'log', 'curriculum', 'assessments', 'exams', 'analytics', 'readiness', 'quality', 'settings'];

  function routeFromHash() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return VIEW_ORDER.indexOf(h) >= 0 ? h : 'overview';
  }
  ECC.navigate = function (name) { location.hash = '#/' + name; };

  ECC.render = function (opts) {
    var v = ECC.views[current], el = document.getElementById('content');
    if (!v) { el.innerHTML = U.empty('Page not found'); return; }
    var y = window.scrollY;
    document.getElementById('page-title').textContent = v.title;
    document.title = v.title + ' · Exam Preparation Command Center 2026';
    U.$$('#nav a').forEach(function (a) {
      if (a.getAttribute('data-view') === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    el.innerHTML = '';
    var host = document.createElement('div');
    host.className = 'view view-' + current;
    el.appendChild(host);
    try { v.render(host); }
    catch (err) {
      console.error(err);
      el.innerHTML = U.warn('<strong>This page failed to render.</strong> ' + U.esc(err.message) + '. Your data is unchanged. Export a backup from Settings &amp; Backup.', 'conflict');
    }
    renderShell();
    if (opts && opts.keepScroll) window.scrollTo(0, y);
  };

  function renderShell() {
    var d = ECC.store.data, s = d.settings, today = U.today();
    var days = U.daysBetween(today, s.readinessTargetDate);
    document.getElementById('topbar-meta').innerHTML =
      '<span class="hide-sm">' + U.fmtDate(today, 'dow') + '</span>' +
      '<span title="Days until the readiness date (a planning date, not an exam booking)"><strong>' + Math.max(0, days) + '</strong> days to ' + U.fmtDate(s.readinessTargetDate, 'short') + '</span>' +
      '<span class="hide-sm">Today (actual / target): ' + ECC.q.certIds().map(function (c) { return U.esc(ECC.q.cert(c).code) + ' <strong>' + ECC.calc.actualMin(c, today) + '/' + ECC.calc.target(c, today) + 'm</strong>'; }).join(' · ') + '</span>';
    var open = ECC.calc.discrepancies().open.length;
    var badge = document.getElementById('nav-dq-count');
    if (badge) { badge.textContent = open; badge.hidden = !open; }
    document.getElementById('sidebar-foot').innerHTML =
      (ECC.store.mode === 'test' ? U.badge('TEST DATA') + '<br>' : '') +
      'v' + ECC.APP_VERSION + ' · schema ' + d.schemaVersion + '<br>Saved in this browser · ' + (d.meta.lastBackupAt ? 'Backup ' + U.fmtDate(d.meta.lastBackupAt.slice(0, 10), 'short') : 'No backup yet');
    document.getElementById('test-banner').hidden = ECC.store.mode !== 'test';
  }

  function setupNav() {
    var app = document.getElementById('app'), btn = document.getElementById('menu-btn');
    function close() { app.classList.remove('nav-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function () {
      var open = app.classList.toggle('nav-open'); btn.setAttribute('aria-expanded', String(open));
      if (open) { var a = U.$('#nav a[aria-current]'); if (a) a.focus(); }
    });
    document.getElementById('scrim').addEventListener('click', close);
    document.getElementById('nav').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  function boot() {
    ECC.views = ECC.views || {};
    if (!window.ECC_SEED) {
      document.getElementById('content').innerHTML = U.warn('<strong>Verified data file missing.</strong> data/generated/seed.js was not found. Run <code>node tools/build-seed.mjs</code>.', 'conflict');
      return;
    }
    if (!ECC.storage.available()) {
      document.getElementById('content').innerHTML = U.warn('<strong>Browser storage is unavailable.</strong> This window blocks site storage (private mode or strict privacy settings), so nothing can be saved. Open the app in a normal window.', 'conflict');
      return;
    }
    ECC.store.init();
    setupNav();
    ECC.store.onChange(function () { ECC.render({ keepScroll: true }); });
    window.addEventListener('hashchange', function () {
      U.closeModal(); current = routeFromHash(); ECC.render(); window.scrollTo(0, 0);
      var c = document.getElementById('content'); if (c) c.focus({ preventScroll: true });
    });
    current = routeFromHash();
    ECC.render();
    var li = ECC.store.loadInfo;
    if (li && li.status === 'error') {
      U.modal('Stored data problem', U.warn(U.esc(li.message), 'conflict') +
        '<p>The app started with the verified initial data so you can keep working. Your previous data was <strong>not deleted</strong>. Restore your latest backup from Settings &amp; Backup.</p>' +
        '<div class="form-actions"><button class="btn btn-primary" data-close>Understood</button></div>');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.ECC = window.ECC || {});
