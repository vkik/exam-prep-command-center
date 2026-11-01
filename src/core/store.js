/* =========================================================================
   store.js — Single in-memory store. Every change goes through commit():
   apply → validate → save → re-render. If validation fails the change is
   rolled back and nothing is saved.
   ========================================================================= */
(function (ECC) {
  'use strict';
  ECC.APP_VERSION = '2.0.0-phase3';
  var store = ECC.store = { data: null, mode: 'real', loadInfo: null, listeners: [] };

  store.freshSeed = function (mode) {
    var d = JSON.parse(JSON.stringify(window.ECC_SEED));
    var now = new Date().toISOString();
    d.meta = { createdAt: now, updatedAt: now, lastBackupAt: null, appVersion: ECC.APP_VERSION, dataVersion: d.dataVersion, testMode: mode === 'test' };
    return d;
  };

  store.init = function () {
    store.mode = ECC.storage.getMode();
    var r = ECC.storage.load(store.mode, window.ECC_SEED);
    store.loadInfo = r;
    if (r.status === 'loaded') store.data = r.data;
    else {
      store.data = store.freshSeed(store.mode);
      ECC.storage.save(store.mode, store.data);
    }
  };

  store.commit = function (fn, message) {
    var before = JSON.stringify(store.data);
    try { fn(store.data); }
    catch (e) { store.data = JSON.parse(before); store.lastError = e.message; ECC.ui.toast('Not saved: ' + e.message, 'err'); return false; }
    var v = ECC.validate.state(store.data);
    if (!v.ok) {
      store.data = JSON.parse(before);
      store.lastError = v.errors[0];
      ECC.ui.toast('Not saved: ' + v.errors[0], 'err');
      return false;
    }
    var r = ECC.storage.save(store.mode, store.data);
    if (!r.ok) ECC.ui.toast(r.message, 'err'); else if (message) ECC.ui.toast(message);
    store.listeners.forEach(function (l) { l(); });
    return r.ok;
  };
  store.onChange = function (fn) { store.listeners.push(fn); };

  store.replaceAll = function (data) {
    store.data = data;
    var r = ECC.storage.save(store.mode, store.data);
    store.listeners.forEach(function (l) { l(); });
    return r;
  };

  /* Selectors */
  var q = ECC.q = {};
  var D = function () { return store.data; };
  q.cert = function (id) { return D().certifications.find(function (c) { return c.id === id; }); };
  q.course = function (certId) { return D().courses.find(function (c) { return c.certificationId === certId; }); };
  q.modules = function (certId) { return D().modules.filter(function (m) { return m.certificationId === certId; }).sort(function (a, b) { return a.order - b.order; }); };
  q.lessons = function (certId) { return D().lessons.filter(function (l) { return !certId || l.certificationId === certId; }); };
  q.latestSnapshot = function (course) { var h = course.platformProgressSnapshots; return h && h.length ? h[h.length - 1] : null; };
  q.source = function (id) { return (D().sources || []).find(function (s) { return s.id === id; }); };
  q.certIds = function () { return D().certifications.map(function (c) { return c.id; }); };
  q.certName = function (id) { var c = id && q.cert(id); return c ? c.code : 'Both'; };
})(window.ECC = window.ECC || {});
