/* =========================================================================
   storage.js — Local Storage for v2. Real and test data use separate keys.
   v1's key (ecc2026.data) is only ever READ, never written or removed, so
   v1 keeps working as a fallback. Unreadable data is quarantined, never deleted.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var S = ECC.storage = {};
  S.KEYS = { real: 'ecc2026.v2.data', test: 'ecc2026.v2.testdata', mode: 'ecc2026.v2.mode' };
  S.V1_KEY = 'ecc2026.data';

  S.available = function () {
    try { var k = '__ecc2_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  };
  S.getMode = function () { try { return localStorage.getItem(S.KEYS.mode) === 'test' ? 'test' : 'real'; } catch (e) { return 'real'; } };
  S.setMode = function (m) { try { localStorage.setItem(S.KEYS.mode, m); } catch (e) { /* ignore */ } };

  /* Returns { status: 'new'|'loaded'|'error', data, message, warnings, migrationLog } */
  S.load = function (mode, seed) {
    var key = S.KEYS[mode], raw;
    try { raw = localStorage.getItem(key); } catch (e) { return { status: 'error', data: null, message: 'Local Storage is not available in this browser context.' }; }
    if (!raw) return { status: 'new', data: null };
    try {
      var m = ECC.migrate.toCurrent(JSON.parse(raw), seed);
      var v = ECC.validate.state(m.data);
      if (!v.ok) {
        var rk = S.quarantine(key, raw);
        return { status: 'error', data: null, recoveryKey: rk, message: 'Stored data failed validation and was preserved under "' + rk + '". First problems: ' + v.errors.slice(0, 4).join(' | ') };
      }
      return { status: 'loaded', data: m.data, warnings: v.warnings, migrationLog: m.log };
    } catch (err) {
      var k2 = S.quarantine(key, raw);
      return { status: 'error', data: null, recoveryKey: k2, message: 'Stored data could not be read (' + err.message + '). It was preserved under "' + k2 + '".' };
    }
  };

  S.quarantine = function (key, raw) {
    var rk = key + '.recovery.' + Date.now();
    try { localStorage.setItem(rk, raw); } catch (e) { /* storage full: raw stays under the original key */ return key; }
    return rk;
  };

  S.save = function (mode, data) {
    try {
      data.meta.updatedAt = new Date().toISOString();
      localStorage.setItem(S.KEYS[mode], JSON.stringify(data));
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e && e.name === 'QuotaExceededError' ? 'Browser storage is full. Export a backup now.' : 'Could not save: ' + e.message };
    }
  };

  S.clearTest = function () { try { localStorage.removeItem(S.KEYS.test); } catch (e) { /* ignore */ } };

  /* v1 data in this browser (read-only) */
  S.readV1 = function () {
    try { var raw = localStorage.getItem(S.V1_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  };

  S.recoveryKeys = function () {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('ecc2026.v2.') === 0 && k.indexOf('.recovery.') > 0) out.push(k); } } catch (e) { /* ignore */ }
    return out.sort();
  };

  S.usageBytes = function () {
    try {
      var t = 0;
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('ecc2026.v2.') === 0) t += (localStorage.getItem(k) || '').length * 2; }
      return t;
    } catch (e) { return null; }
  };
})(window.ECC = window.ECC || {});
