/* =========================================================================
   settings.js — Phase 1 Settings & Backup: storage status, JSON backup,
   validated restore (v1 or v2 backups), import of v1 data found in this
   browser, test mode. Restore and import change nothing until you confirm,
   and change nothing at all if validation fails.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};
  var B = ECC.backup = {};

  B.build = function () {
    var at = new Date().toISOString();
    ECC.store.commit(function (d) { d.meta.lastBackupAt = at; });
    var d = ECC.store.data;
    return { app: ECC.validate.APP_ID, appVersion: ECC.APP_VERSION, schemaVersion: d.schemaVersion, exportedAt: at, testMode: ECC.store.mode === 'test',
      backupMetadata: { id: 'bk-' + Date.now().toString(36), createdAt: at, recordCounts: ECC.migrate.counts(d), note: 'Store a copy in OneDrive/Exam Preparation 2026/.' }, data: d };
  };
  B.exportJSON = function () {
    var b = B.build();
    U.download('exam-prep-backup-v2-' + U.today() + (ECC.store.mode === 'test' ? '-TEST' : '') + '.json', JSON.stringify(b, null, 2));
    U.toast('Backup downloaded — copy it to your OneDrive folder');
  };

  function countsTable(cur, inc) {
    return '<div class="table-wrap"><table id="rs-counts"><thead><tr><th>Records</th><th class="num">Current</th><th class="num">Incoming</th></tr></thead><tbody>' +
      Object.keys(inc).map(function (k) { return '<tr><td>' + U.esc(k) + '</td><td class="num">' + cur[k] + '</td><td class="num">' + inc[k] + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  /* Shared path for a backup file and for v1 data found in this browser. */
  B.prepare = function (dataIn, sourceLabel) {
    var m;
    try { m = ECC.migrate.toCurrent(JSON.parse(JSON.stringify(dataIn)), window.ECC_SEED); }
    catch (e) { return U.modal('Import failed — nothing was changed', U.warn(U.esc(e.message), 'conflict')); }
    var v = ECC.validate.state(m.data);
    if (!v.ok) {
      return U.modal('Import failed — nothing was changed', U.warn('<strong>The data did not pass validation.</strong><ul>' +
        v.errors.slice(0, 15).map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>' + (v.errors.length > 15 ? '<p>…and ' + (v.errors.length - 15) + ' more.</p>' : ''), 'conflict'));
    }
    var cur = ECC.migrate.counts(ECC.store.data), inc = ECC.migrate.counts(m.data);
    var preserved = m.before ? Object.keys(m.before).every(function (k) { return m.before[k] === m.after[k]; }) : true;
    var mm = U.modal('Confirm import', '<p><strong>' + U.esc(sourceLabel) + '</strong></p>' +
      (m.before ? U.warn('Converted from v1 (schema 1) to v2. Record counts ' + (preserved ? 'are unchanged by the conversion.' : '<strong>changed during conversion</strong> — review before confirming.'), preserved ? 'ok' : 'conflict') : '') +
      (m.log.length ? '<details><summary>' + m.log.length + ' conversion notes</summary><ul class="small" id="rs-log">' + m.log.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></details>' : '') +
      (v.warnings.length ? U.warn('<ul>' + v.warnings.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>') : '') +
      countsTable(cur, inc) +
      '<p class="small mt">Confirming <strong>replaces</strong> the data currently in this ' + (ECC.store.mode === 'test' ? 'TEST' : 'real') + ' store. The source is not modified.</p>' +
      '<div class="form-actions"><button class="btn" id="rs-backup-first">Export current first</button><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rs-go">Replace my data</button></div>', { wide: true });
    U.$('#rs-backup-first', mm).addEventListener('click', B.exportJSON);
    U.$('#rs-go', mm).addEventListener('click', function () {
      U.closeModal();
      m.data.meta.restoredAt = new Date().toISOString(); m.data.meta.restoredFrom = sourceLabel;
      m.data.meta.testMode = ECC.store.mode === 'test';
      var r = ECC.store.replaceAll(m.data);
      U.toast(r.ok ? 'Data imported' : r.message, r.ok ? 'ok' : 'err');
    });
  };

  B.restoreFromText = function (text, fileName) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return U.modal('Restore failed — nothing was changed', U.warn('<strong>The file is not valid JSON.</strong> ' + U.esc(e.message), 'conflict')); }
    var env = ECC.validate.envelope(obj);
    if (!env.ok) return U.modal('Restore failed — nothing was changed', U.warn('<ul>' + env.errors.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>', 'conflict'));
    B.prepare(obj.data, fileName + ' · exported ' + (obj.exportedAt ? U.fmtDateTime(obj.exportedAt) : '?') + ' · app v' + (obj.appVersion || '?') + ' · schema ' + obj.data.schemaVersion);
  };

  ECC.views.settings = {
    title: 'Settings & Backup',
    render: function (el) {
      var d = ECC.store.data, s = d.settings, v1 = ECC.storage.readV1(), rec = ECC.storage.recoveryKeys(), bytes = ECC.storage.usageBytes();
      el.innerHTML =
        '<div class="page-head"><div><h1 class="sr-only">Settings &amp; Backup</h1><p>Data is saved in this browser only. Export a backup regularly and keep it in OneDrive. Daily targets and milestone dates are edited in the Study Planner.</p></div></div>' +
        '<div class="grid grid-2">' +
        '<section class="card"><div class="card-head"><h2>Backup &amp; restore</h2></div>' +
        '<p class="small muted">Backups include every record and a record count. Restore accepts v2 and v1 backups; it validates everything first and changes nothing on any error.</p>' +
        '<div class="row"><button class="btn btn-primary" id="bk-export">Export JSON backup</button>' +
        '<label class="btn" for="bk-file">Restore from JSON…</label><input type="file" id="bk-file" accept=".json,application/json" class="sr-only"></div>' +
        '<div class="metric-line mt"><span>Last backup</span><strong id="bk-last">' + (d.meta.lastBackupAt ? U.fmtDateTime(d.meta.lastBackupAt) : 'Never') + '</strong></div>' +
        '</section>' +
        '<section class="card"><div class="card-head"><h2>Version 1 data</h2></div>' +
        (v1 ? '<p class="small">v1 data was found in this browser (' + ((v1.actualSessions || []).length) + ' study sessions, ' + ((v1.plannedSessions || []).length) + ' planned). It stays untouched; v1 keeps working as a fallback.</p><button class="btn" id="v1-import">Review &amp; import v1 data…</button>'
          : '<p class="small muted" id="v1-none">No v1 data found in this browser. To bring v1 records over, export a backup from v1 and use “Restore from JSON…”.</p>') +
        '</section>' +
        '<section class="card"><div class="card-head"><h2>Storage</h2></div>' +
        '<div class="metric-line"><span>Store</span><strong id="st-mode">' + (ECC.store.mode === 'test' ? 'TEST (synthetic, separate)' : 'Real') + '</strong></div>' +
        '<div class="metric-line"><span>Schema / app version</span><strong>' + d.schemaVersion + ' / ' + ECC.APP_VERSION + '</strong></div>' +
        '<div class="metric-line"><span>Data version (verified seed)</span><strong>' + U.esc(d.meta.dataVersion || d.dataVersion) + '</strong></div>' +
        '<div class="metric-line"><span>Space used</span><strong>' + (bytes === null ? '—' : (bytes / 1024).toFixed(0) + ' KB of ~5 MB') + '</strong></div>' +
        '<div class="metric-line"><span>Daily targets</span><strong>' + ECC.q.certIds().map(function (c) { return ECC.q.cert(c).code + ' ' + s.dailyTargetMin[c]; }).join(' · ') + ' min</strong></div>' +
        (rec.length ? U.warn('<strong>Recovery copies kept:</strong> ' + rec.map(U.esc).join(', ') + '. They are never deleted automatically.') : '') +
        '</section>' +
        '<section class="card"><div class="card-head"><h2>Test mode</h2></div>' +
        '<p class="small muted">A separate store for trying things out. Your real records are not read or changed while it is on.</p>' +
        (ECC.store.mode === 'test' ? '<div class="row"><button class="btn btn-gold" id="tm-off">Return to real data</button><button class="btn" id="tm-reset">Reset test store</button></div>' : '<button class="btn" id="tm-on">Switch to test mode</button>') +
        '</section></div>';

      U.$('#bk-export', el).addEventListener('click', B.exportJSON);
      U.$('#bk-file', el).addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        var r = new FileReader(); r.onload = function () { B.restoreFromText(r.result, f.name); }; r.readAsText(f); e.target.value = '';
      });
      var vi = U.$('#v1-import', el);
      if (vi) vi.addEventListener('click', function () { B.prepare(ECC.storage.readV1(), 'v1 data in this browser (key ' + ECC.storage.V1_KEY + ')'); });
      function switchMode(m) { ECC.storage.setMode(m); ECC.store.init(); ECC.render(); U.toast(m === 'test' ? 'Test mode on' : 'Back to real data'); }
      var on = U.$('#tm-on', el), off = U.$('#tm-off', el), rs = U.$('#tm-reset', el);
      if (on) on.addEventListener('click', function () { switchMode('test'); });
      if (off) off.addEventListener('click', function () { switchMode('real'); });
      if (rs) rs.addEventListener('click', function () { ECC.storage.clearTest(); switchMode('test'); });
    }
  };
})(window.ECC = window.ECC || {});
