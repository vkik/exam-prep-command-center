"""Phase 1 acceptance tests — Exam Preparation Command Center v2.

Run:  python3 tests/e2e_phase1.py            (needs: pip install playwright && python -m playwright install chromium)
Every test uses a fresh, isolated browser context, so your real browser data is never touched.
Fixture records below exist ONLY inside throw-away test browsers to prove that v1 data survives migration;
they are never written to your store or your folder.
"""
import json, os, sys, subprocess, time, tempfile, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
V1 = ROOT.parent / 'reference' / 'v1.0.0-build'
APP = ROOT / 'index.html'
TODAY = '2026-10-31'
VIEWS = ['overview', 'planner', 'log', 'curriculum', 'assessments', 'exams', 'analytics', 'readiness', 'quality', 'settings']
results = []

def record(tid, name, ok, detail):
    results.append({'id': tid, 'name': name, 'status': 'PASS' if ok else 'FAIL', 'detail': detail})
    print(('PASS' if ok else 'FAIL'), tid, name, '—', detail)

def new_page(browser, url=None, width=1400, height=900):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
    ctx.add_init_script("window.ECC = window.ECC || {}; window.ECC.__fakeToday = '%s';" % TODAY)
    p = ctx.new_page()
    p.errors = []
    p.on('console', lambda m: p.errors.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: p.errors.append(str(e)))
    if url: p.goto(url); p.wait_for_selector('#content .view')
    return ctx, p

def store(p, key='ecc2026.v2.data'):
    raw = p.evaluate("k => localStorage.getItem(k)", key)
    return json.loads(raw) if raw else None

def make_v1_backup(browser):
    """Builds a genuine v1 backup with v1's own code, in an isolated browser, then adds test fixtures."""
    h = pathlib.Path(tempfile.mkdtemp()) / 'v1harness.html'
    js = V1 / 'assets' / 'js'
    h.write_text('<!doctype html><body><div id="toasts"></div>' + ''.join(
        '<script src="%s"></script>' % (js / f).as_uri() for f in ['questions.js', 'data.js', 'ui.js', 'validation.js', 'storage.js', 'state.js', 'testdata.js', 'backup.js']) + '</body>')
    ctx, p = new_page(browser)
    p.goto(h.as_uri())
    bk = p.evaluate("""() => {
      ECC.store.init();
      ECC.store.commit(d => {
        d.settings.dailyTargets = { gpmb: 30, dpro: 30 };
        d.settings.dailyTargetOverrides = { '2026-11-02': { gpmb: 45 } };
        d.actualSessions.push({ id: 'as-fx1', certificationId: 'gpmb', date: '2026-10-30', durationMin: 35, studyType: 'Video', moduleId: 'gpmb-m1', topic: 'FIXTURE', notes: '', label: 'User Entered', createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T10:00:00Z' });
        d.actualSessions.push({ id: 'as-fx2', certificationId: 'dpro', date: '2026-10-31', durationMin: 30, studyType: 'Reading', topic: 'FIXTURE', notes: '', label: 'User Entered', createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' });
        d.plannedSessions.push({ id: 'ps-fx1', certificationId: 'gpmb', date: '2026-11-01', plannedMinutes: 40, topic: 'FIXTURE', status: 'Planned', label: 'User Entered', createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' });
        d.weeklyReviews.push({ id: 'wr-fx1', weekStart: '2026-10-26', notes: 'FIXTURE', createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' });
        d.lessons.find(l => l.id === 'gpmb-m1-l2').personalStatus = 'Completed';
        d.lessons.find(l => l.id === 'gpmb-m1-l2').personalUpdatedAt = '2026-10-30T11:00:00Z';
        d.lessons.find(l => l.id === 'gpmb-m1-l2').platformWatched = true;
        d.courses[0].platformProgressHistory.push({ id: 'pp-fx', value: 4, watchedLessons: 3, totalLessons: 67, verifiedAt: '2026-10-30', dataSource: 'user', label: 'User Entered' });
        d.milestones.find(m => m.id === 'ms-diag').targetDate = '2026-11-08';
        d.examAttempts.push({ id: 'ea-fx1', certificationId: 'gpmb', testId: 'pt-ch2', kind: 'chapter', title: 'Chapter 2', date: '2026-10-30', scorePct: 70, passMark: null, result: 'Result not recorded', label: 'User Entered', isHistorical: false, createdAt: '2026-10-30T12:00:00Z' });
      });
      return ECC.backup.buildBackup();
    }""")
    ctx.close()
    return bk

def counts_in(p):
    return p.evaluate("() => ECC.migrate.counts(ECC.store.data)")

def main():
    server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()

            # P1-01 / P1-02 — opens without console errors on file:// and localhost
            for tid, base in [('P1-01', APP.as_uri()), ('P1-02', 'http://127.0.0.1:8765/index.html')]:
                ctx, p = new_page(b, base)
                bad = []
                for v in VIEWS:
                    p.goto(base + '#/' + v); p.wait_for_selector('.view-' + v)
                    if p.locator('.alert-conflict').count() and v != 'quality': bad.append(v)
                cur = p.evaluate("() => [...document.querySelectorAll('#nav a')].filter(a => a.getAttribute('aria-current')).map(a => a.dataset.view)")
                record(tid, 'All 10 pages open with 0 console errors (' + ('file://' if tid == 'P1-01' else 'localhost') + ')',
                       not p.errors and not bad and cur == ['settings'], '%d views, %d errors %s' % (len(VIEWS), len(p.errors), p.errors[:2] or ''))
                ctx.close()

            # P1-03 — first run seeds verified data; reload keeps a saved change
            ctx, p = new_page(b, APP.as_uri())
            d = store(p)
            seed_ok = d['schemaVersion'] == 2 and len(d['lessons']) == 67 and d['settings']['dailyTargetMin'] == {'gpmb': 40, 'dpro': 30}
            p.goto(APP.as_uri() + '#/settings'); p.wait_for_selector('#bk-export')
            with p.expect_download() as dl: p.click('#bk-export')
            backup_path = dl.value.path()
            stamp = store(p)['meta']['lastBackupAt']
            p.reload(); p.wait_for_selector('#bk-last')
            kept = store(p)['meta']['lastBackupAt'] == stamp and p.inner_text('#bk-last') != 'Never'
            record('P1-03', 'First run loads verified seed; reload keeps saved data', seed_ok and kept and stamp is not None,
                   '67 lessons, targets 40/30, schema 2; backup timestamp survived reload')

            # P1-04 — v2 backup round-trip validates
            bk2 = json.load(open(backup_path))
            ok = bk2['app'] == 'exam-preparation-command-center' and bk2['schemaVersion'] == 2 and p.evaluate("d => ECC.validate.state(d).ok", bk2['data'])
            record('P1-04', 'v2 JSON backup is valid and complete', ok, '%s, counts %s' % (os.path.basename(dl.value.suggested_filename), bk2['backupMetadata']['recordCounts']['Study sessions (actual)']))
            ctx.close()

            # P1-05 — v1 backup restores into v2 with record counts unchanged
            v1 = make_v1_backup(b)
            v1file = pathlib.Path(tempfile.mkdtemp()) / 'exam-prep-backup-v1.json'
            v1file.write_text(json.dumps(v1))
            ctx, p = new_page(b, APP.as_uri() + '#/settings')
            v1counts = p.evaluate("d => ECC.migrate.counts(d)", v1['data'])
            p.set_input_files('#bk-file', str(v1file))
            p.wait_for_selector('#rs-go')
            dialog_ok = 'unchanged by the conversion' in p.inner_text('#modal')
            p.click('#rs-go'); p.wait_for_timeout(300)
            after = counts_in(p); p.reload(); p.wait_for_selector('.view'); after_reload = counts_in(p)
            d = store(p)
            detail_ok = (d['settings']['dailyTargetMin'] == {'gpmb': 40, 'dpro': 30} and d['settings']['dailyTargetOverrides'] == {'2026-11-02': {'gpmb': 45}}
                         and next(l for l in d['lessons'] if l['id'] == 'gpmb-m1-l2')['personalStatus'] == 'Completed'
                         and len(d['archive']['v1QuestionBanks']) == 100 and d['questions'] == []
                         and d['courses'][0]['platformProgressSnapshots'][-1]['valuePct'] == 4)
            record('P1-05', 'v1 backup restores into v2 with record counts unchanged', dialog_ok and after == v1counts and after_reload == v1counts and detail_ok and not p.errors,
                   'v1 %s → v2 identical; 100 old AI questions archived, not active; targets not lowered' % {k: v for k, v in v1counts.items() if v})
            ctx.close()

            # P1-06 — v1 data in the same browser: import offered, v1 key never modified
            ctx, p = new_page(b, APP.as_uri())
            raw = json.dumps(v1['data'])
            p.evaluate("r => localStorage.setItem('ecc2026.data', r)", raw)
            p.goto(APP.as_uri() + '#/settings'); p.reload(); p.wait_for_selector('#v1-import')
            p.click('#v1-import'); p.wait_for_selector('#rs-go'); p.click('#rs-go'); p.wait_for_timeout(300)
            same = p.evaluate("() => localStorage.getItem('ecc2026.data')") == raw
            record('P1-06', 'v1 data in this browser imports; v1 copy left untouched', same and counts_in(p)['Study sessions (actual)'] == 2, 'v1 key byte-identical after import')
            ctx.close()

            # P1-07 — corrupt storage is quarantined, never deleted
            ctx, p = new_page(b, APP.as_uri())
            for tid, bad, label in [('P1-07a', '{not json', 'unreadable JSON'),
                                    ('P1-07b', None, 'valid JSON that fails validation (future-dated session)')]:
                if bad is None:
                    dd = store(p); dd['actualSessions'].append({'id': 'x1', 'certificationId': 'gpmb', 'date': '2027-01-01', 'durationMin': 30}); bad = json.dumps(dd)
                p.evaluate("r => { for (const k of Object.keys(localStorage)) if (k.includes('.recovery.')) localStorage.removeItem(k); localStorage.setItem('ecc2026.v2.data', r); }", bad)
                p.reload(); p.wait_for_selector('#modal')
                rec = p.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('ecc2026.v2.data.recovery.'))")
                kept = rec and p.evaluate("k => localStorage.getItem(k)", rec[0]) == bad
                record(tid, 'Corrupt storage preserved under a recovery key — ' + label, bool(kept) and len(store(p)['lessons']) == 67, 'recovery key %s; app started on verified seed' % (rec[0] if rec else 'MISSING'))
                p.click('#modal [data-close]')
            ctx.close()

            # P1-08 — restore rejects bad files and changes nothing
            ctx, p = new_page(b, APP.as_uri() + '#/settings')
            before = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')")
            tmp = pathlib.Path(tempfile.mkdtemp())
            badv1 = json.loads(json.dumps(v1)); badv1['data']['actualSessions'][0]['durationMin'] = 0
            cases = {'broken.json': '{oops', 'other.json': json.dumps({'app': 'something-else', 'data': {}}), 'invalid-record.json': json.dumps(badv1),
                     'future-schema.json': json.dumps({'app': 'exam-preparation-command-center', 'data': {'schemaVersion': 9}})}
            rejected = 0
            for name, text in cases.items():
                (tmp / name).write_text(text); p.set_input_files('#bk-file', str(tmp / name)); p.wait_for_selector('#modal')
                if 'nothing was changed' in p.inner_text('#modal-title') and not p.locator('#rs-go').count(): rejected += 1
                p.click('#modal [data-close]')
            unchanged = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')") == before
            # cancel on a valid file also changes nothing
            p.set_input_files('#bk-file', str(v1file)); p.wait_for_selector('#rs-go'); p.click('#modal .btn[data-close]')
            unchanged = unchanged and p.evaluate("() => localStorage.getItem('ecc2026.v2.data')") == before
            record('P1-08', 'Restore rejects invalid files; cancel keeps data', rejected == 4 and unchanged, '%d/4 rejected (broken JSON, wrong app, invalid record, newer schema); store unchanged' % rejected)
            ctx.close()

            # P1-09 — Data Quality page shows every unresolved discrepancy and source
            ctx, p = new_page(b, APP.as_uri() + '#/quality')
            ids = p.evaluate("() => [...document.querySelectorAll('[data-disc]')].map(e => e.dataset.disc)")
            srcs = p.locator('#dq-sources tbody tr').count()
            nav = p.inner_text('#nav-dq-count')
            build = p.inner_text('#dq-build')
            record('P1-09', 'Data Quality lists unresolved discrepancies, sources and validation', ids == ['D-0%d' % i for i in range(1, 9)] and srcs == 6 and nav == '8' and '0 failures' in build,
                   'discrepancies %s; %d sources; nav badge %s' % (','.join(ids), srcs, nav))
            ctx.close()

            # P1-10 — targets and workload; minimum enforced
            ctx, p = new_page(b, APP.as_uri())
            daily = p.inner_text('#kpi-daily'); wl = p.inner_text('#kpi-workload')
            f1 = p.inner_text('[data-feas="F-01"]')
            lowered = p.evaluate("() => ECC.store.commit(d => { d.settings.dailyTargetMin.dpro = 20; })")
            still = store(p)['settings']['dailyTargetMin']['dpro']
            record('P1-10', '70 min/day workload shown; a target below the 30-min minimum is refused',
                   daily.startswith('70') and '52h 30m' in wl and 'On track' in f1 and '2h 52m' in f1 and lowered is False and still == 30,
                   'daily %s, period %s, F-01 margin 2h 52m; lowering DPro to 20 refused' % (daily.split()[0] + ' min', wl))
            ctx.close()

            # P1-11 — test mode isolation
            ctx, p = new_page(b, APP.as_uri() + '#/settings')
            real_before = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')")
            p.click('#tm-on'); p.wait_for_selector('#tm-off')
            banner = p.is_visible('#test-banner')
            p.evaluate("() => ECC.store.commit(d => { d.meta.lastBackupAt = '2026-10-31T00:00:00Z'; })")
            p.click('#tm-off'); p.wait_for_selector('#tm-on')
            same = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')") == real_before
            record('P1-11', 'Test mode uses a separate store; real data byte-identical', banner and same and p.evaluate("() => !!localStorage.getItem('ecc2026.v2.testdata')"), 'banner shown; real store unchanged')
            ctx.close()

            # P1-12 — nothing fabricated
            ctx, p = new_page(b, APP.as_uri())
            d = store(p)
            clean = (not d['actualSessions'] and not d['plannedSessions'] and not d['assessmentAttempts'] and not d['questions']
                     and all(l['personalStatus'] == 'Not Started' for l in d['lessons']) and all(m['targetDate'] is None for m in d['milestones'])
                     and not any(c['certificationObtained'] for c in d['certifications']) and len(d['examAttempts']) == 1 and d['examAttempts'][0]['label'] == 'Historical')
            personal = p.inner_text('.view-overview')
            record('P1-12', 'No fictional sessions, attempts or completions; missing shown as missing', clean and 'Not yet recorded by you' in personal,
                   '0 sessions/plans/attempts/questions; only the historical 83% attempt; personal progress shown as "—"')
            ctx.close()

            # P1-13 — mobile 390 px
            ctx, p = new_page(b, APP.as_uri(), 390, 844)
            over = []
            for v in ['overview', 'quality', 'settings', 'curriculum']:
                p.goto(APP.as_uri() + '#/' + v); p.wait_for_selector('.view-' + v)
                if p.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1"): over.append(v)
            p.goto(APP.as_uri() + '#/overview'); p.wait_for_selector('.view-overview')
            p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase1-mobile.png'))
            p.click('#menu-btn'); opened = p.evaluate("() => document.getElementById('app').classList.contains('nav-open')")
            p.keyboard.press('Escape'); closed = not p.evaluate("() => document.getElementById('app').classList.contains('nav-open')")
            record('P1-13', 'Mobile layout at 390 px: no horizontal scroll; drawer opens/closes', not over and opened and closed, 'overflow on: %s' % (over or 'none'))
            ctx.close()

            ctx, p = new_page(b, APP.as_uri())
            p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase1-overview.png'), full_page=True)
            p.goto(APP.as_uri() + '#/quality'); p.wait_for_selector('.view-quality')
            p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase1-data-quality.png'), full_page=True)
            ctx.close()
            b.close()
    finally:
        server.terminate()
    passed = sum(r['status'] == 'PASS' for r in results)
    out = {'phase': 1, 'passed': passed, 'total': len(results), 'results': results}
    (ROOT / 'tests' / 'phase1-results.json').write_text(json.dumps(out, indent=2) + '\n')
    print('\n%d / %d passed' % (passed, len(results)))
    sys.exit(0 if passed == len(results) else 1)

if __name__ == '__main__':
    main()
