/* =========================================================================
   placeholders.js — Pages scheduled for later phases. They say so plainly
   and show no invented numbers.
   ========================================================================= */
(function (ECC) {
  'use strict';
  var U = ECC.ui;
  ECC.views = ECC.views || {};
  [
    ['assessments', 'Assessments', 4, 'Two rewritten 50-question diagnostics with balanced answers, topic tags and explanations — clearly labelled AI-generated practice, not official exam questions. The old v1 banks are excluded.'],
    ['exams', 'Mock & Official Exams', 4, 'The 14 PM-Tricks tests, the three separate Project DPro tracks, booking status, and evidence-gated certification.'],
    ['analytics', 'Analytics', 5, 'Trends, coverage and topic performance, with “Not Assessed” where there is no data.'],
    ['readiness', 'Readiness', 5, 'A transparent, configurable readiness indicator with data coverage.']
  ].forEach(function (p) {
    ECC.views[p[0]] = {
      title: p[1], phase: p[2],
      render: function (el) {
        el.innerHTML = '<div class="card"><h2>' + U.esc(p[1]) + '</h2><p><span class="pill p-lock">Phase ' + p[2] + '</span></p><p class="muted">' + U.esc(p[3]) + '</p>' +
          '<p class="small muted mb0">This page is built in Phase ' + p[2] + ', after your review of the earlier phases.</p></div>';
      }
    };
  });
})(window.ECC = window.ECC || {});
