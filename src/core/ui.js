/* =========================================================================
   ui.js (reused from v1.0.0) — Shared UI helpers: escaping, dates, formatting, badges, modal,
   toasts, simple SVG charts. No business logic here.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui = {};

  /* ---------- escaping / DOM ---------- */
  U.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- dates (local calendar dates, YYYY-MM-DD) ---------- */
  U.pad = function (n) { return String(n).padStart(2, '0'); };
  U.toISODate = function (d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); };
  U.today = function () { return ECC.__fakeToday || U.toISODate(new Date()); };
  U.parseDate = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  U.addDays = function (s, n) { var d = U.parseDate(s); d.setDate(d.getDate() + n); return U.toISODate(d); };
  U.daysBetween = function (a, b) { return Math.round((U.parseDate(b) - U.parseDate(a)) / 86400000); };
  U.dateRange = function (a, b) { var out = [], d = a; while (d <= b) { out.push(d); d = U.addDays(d, 1); } return out; };
  U.weekStart = function (s) { var d = U.parseDate(s); var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return U.toISODate(d); };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  U.fmtDate = function (s, opt) {
    if (!s) return '—';
    var d = U.parseDate(String(s).slice(0, 10));
    var t = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return opt === 'dow' ? DAYS[d.getDay()] + ', ' + t : (opt === 'short' ? d.getDate() + ' ' + MONTHS[d.getMonth()] : t);
  };
  U.dow = function (s) { return DAYS[U.parseDate(s).getDay()]; };
  U.monthName = function (m) { return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]; };
  U.fmtDateTime = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return U.fmtDate(U.toISODate(d)) + ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };

  /* ---------- number / duration formatting ---------- */
  U.fmtSec = function (sec) {
    if (sec === null || sec === undefined) return '—';
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + 'h ' : '') + (h || m ? U.pad(m) + 'm ' : '') + U.pad(s) + 's';
  };
  U.fmtMin = function (min) {
    if (min === null || min === undefined || isNaN(min)) return '—';
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h ' + U.pad(m) + 'm' : m + 'm';
  };
  U.pct = function (v, digits) { return (v === null || v === undefined || isNaN(v)) ? '—' : (+v).toFixed(digits || 0) + '%'; };

  /* ---------- badges ---------- */
  var LABEL_CLASS = {
    'Verified': 'b-verified', 'User Entered': 'b-user', 'Historical': 'b-hist', 'Not Yet Verified': 'b-unver',
    'Conflicting Data': 'b-conflict', 'Unavailable': 'b-unavail', 'Estimated Planning Value': 'b-est',
    'Not Assessed': 'b-unavail', 'Insufficient Data': 'b-unavail', 'AI-generated': 'b-ai', 'TEST DATA': 'b-test'
  };
  U.badge = function (label, extraClass, title) {
    if (!label) return '';
    return '<span class="badge ' + (LABEL_CLASS[label] || extraClass || 'b-neutral') + '"' + (title ? ' title="' + U.esc(title) + '"' : '') + '>' + U.esc(label) + '</span>';
  };
  U.statusPill = function (status) {
    var cls = { 'Completed': 'p-done', 'In Progress': 'p-prog', 'Not Started': 'p-none', 'Pending Prior Training': 'p-lock',
      'Met': 'p-done', 'Partial': 'p-prog', 'Missed': 'p-miss', 'Passed': 'p-done', 'Failed': 'p-miss', 'Planned': 'p-none',
      'Done': 'p-done', 'Skipped': 'p-miss', 'Rescheduled': 'p-lock', 'Overdue': 'p-miss', 'Due soon': 'p-prog' }[status] || 'p-none';
    return '<span class="pill ' + cls + '">' + U.esc(status || '—') + '</span>';
  };

  U.warn = function (html, level) {
    return '<div class="alert alert-' + (level || 'warn') + '" role="note">' + html + '</div>';
  };

  U.progressBar = function (value, opts) {
    opts = opts || {};
    if (value === null || value === undefined) {
      return '<div class="pbar pbar-empty" aria-label="' + U.esc(opts.label || 'progress') + ': unavailable"><span class="pbar-na">Unavailable</span></div>';
    }
    var v = Math.max(0, Math.min(100, value));
    return '<div class="pbar ' + (opts.gold ? 'pbar-gold' : '') + '" role="progressbar" aria-valuenow="' + Math.round(v) + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + U.esc(opts.label || 'progress') + '"><div style="width:' + v + '%"></div></div>';
  };

  U.empty = function (title, text) {
    return '<div class="empty"><strong>' + U.esc(title) + '</strong>' + (text ? '<p>' + text + '</p>' : '') + '</div>';
  };

  U.hashParam = function (name) {
    var q = (location.hash.split('?')[1] || '');
    var m = q.match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };

  /* ---------- toast ---------- */
  U.toast = function (msg, kind) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (kind || 'ok');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
  };

  /* ---------- modal ---------- */
  var lastFocus = null;
  U.modal = function (title, bodyHtml, opts) {
    opts = opts || {};
    U.closeModal();
    lastFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.id = 'modal';
    wrap.innerHTML = '<div class="modal ' + (opts.wide ? 'modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<header class="modal-head"><h2 id="modal-title">' + U.esc(title) + '</h2>' +
      '<button class="btn-icon" data-close aria-label="Close dialog">✕</button></header>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.hasAttribute('data-close')) U.closeModal();
    });
    var f = wrap.querySelector('input, select, textarea, button:not([data-close])');
    if (f) f.focus();
    return wrap;
  };
  U.closeModal = function () {
    var m = document.getElementById('modal');
    if (m) { m.remove(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') U.closeModal(); });

  /* Promise-free confirm dialog (avoids native confirm so it is testable and styled) */
  U.confirm = function (title, html, onYes, opts) {
    opts = opts || {};
    var m = U.modal(title, '<div class="confirm-body">' + html + '</div>' +
      '<div class="form-actions"><button class="btn" data-close>Cancel</button>' +
      '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" id="confirm-yes">' + U.esc(opts.yes || 'Confirm') + '</button></div>');
    m.querySelector('#confirm-yes').addEventListener('click', function () { U.closeModal(); onYes(); });
  };

  /* ---------- form helpers ---------- */
  U.formData = function (form) {
    var o = {};
    U.$$('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value;
    });
    return o;
  };
  U.options = function (list, selected) {
    return list.map(function (o) {
      var v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o;
      return '<option value="' + U.esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    }).join('');
  };

  /* ---------- downloads ---------- */
  U.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* ---------- minimal SVG bar chart ----------
     series: [{name, cls, values:[]}], labels:[], opts:{height, target, unit} */
  U.barChart = function (labels, series, opts) {
    opts = opts || {};
    var h = opts.height || 180, padL = 36, padB = 26, padT = 10, w = Math.max(640, labels.length * (series.length * 12 + 10) + padL + 10);
    var max = opts.max || 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    if (opts.target && opts.target > max) max = opts.target;
    max = max <= 0 ? 10 : Math.ceil(max * 1.1);
    var plotH = h - padB - padT, groupW = (w - padL - 10) / labels.length, barW = Math.min(16, (groupW - 6) / series.length);
    var y = function (v) { return padT + plotH - (v / max) * plotH; };
    var svg = '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + U.esc(opts.ariaLabel || 'chart') + '" preserveAspectRatio="xMinYMid meet">';
    [0, 0.5, 1].forEach(function (f) {
      var val = Math.round(max * f), yy = y(val);
      svg += '<line class="grid" x1="' + padL + '" x2="' + (w - 6) + '" y1="' + yy + '" y2="' + yy + '"/><text class="axis" x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + val + '</text>';
    });
    if (opts.target) {
      svg += '<line class="target" x1="' + padL + '" x2="' + (w - 6) + '" y1="' + y(opts.target) + '" y2="' + y(opts.target) + '"><title>Target ' + opts.target + '</title></line>';
    }
    labels.forEach(function (lab, i) {
      var gx = padL + i * groupW + (groupW - barW * series.length) / 2;
      series.forEach(function (s, j) {
        var v = s.values[i] || 0, top = y(v);
        svg += '<rect class="bar ' + s.cls + '" x="' + (gx + j * barW) + '" y="' + top + '" width="' + (barW - 2) + '" height="' + Math.max(0, padT + plotH - top) + '"><title>' + U.esc(s.name + ' · ' + lab + ': ' + v + (opts.unit || '')) + '</title></rect>';
      });
      if (labels.length <= 16 || i % 2 === 0) {
        svg += '<text class="axis" x="' + (padL + i * groupW + groupW / 2) + '" y="' + (h - 8) + '" text-anchor="middle">' + U.esc(lab) + '</text>';
      }
    });
    svg += '</svg>';
    var legend = '<div class="legend">' + series.map(function (s) { return '<span><i class="sw ' + s.cls + '"></i>' + U.esc(s.name) + '</span>'; }).join('') +
      (opts.target ? '<span><i class="sw sw-target"></i>Target</span>' : '') + '</div>';
    return '<div class="chart-wrap">' + svg + '</div>' + legend;
  };
})(window.ECC = window.ECC || {});
