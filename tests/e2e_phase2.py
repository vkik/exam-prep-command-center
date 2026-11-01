"""Phase 2 acceptance tests — Curriculum, platform snapshots, D-03 recheck, evidence-gated discrepancies.

Run:  python3 tests/e2e_phase2.py     (needs Python Playwright + Chromium)
Each test uses a fresh, isolated browser — your real browser data is never touched. Snapshot and
status values entered below exist only inside those throw-away browsers.
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'index.html').as_uri()
TODAY = '2026-10-31'
results, all_errors = [], []

def record(tid, name, ok, detail):
    results.append({'id': tid, 'name': name, 'status': 'PASS' if ok else 'FAIL', 'detail': detail})
    print(('PASS' if ok else 'FAIL'), tid, name, '—', detail)

def page(b, hash_='', w=1400, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h})
    ctx.add_init_script("window.ECC = window.ECC || {}; window.ECC.__fakeToday = '%s';" % TODAY)
    p = ctx.new_page(); p.errors = []
    p.on('console', lambda m: p.errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    p.on('pageerror', lambda e: p.errors.append(str(e)))
    p.goto(APP + hash_); p.wait_for_selector('#content .view')
    return ctx, p

def store(p): return json.loads(p.evaluate("() => localStorage.getItem('ecc2026.v2.data')"))
def done(ctx, p): all_errors.extend(p.errors); ctx.close()
def snaps(d, cid): return next(c for c in d['courses'] if c['certificationId'] == cid)['platformProgressSnapshots']

def go(p, h): p.goto(APP + h); p.wait_for_selector('#content .view')

def gpmb_snapshot(p, pct, extra_lesson_ids, evidence='Course header shows the %; screenshot saved to OneDrive', date=TODAY):
    p.goto(APP + '#/curriculum?cert=gpmb'); p.wait_for_selector('#snap-open'); p.click('#snap-open'); p.wait_for_selector('#snap-form')
    p.fill('#sn-date', date)
    if pct is not None: p.fill('#sn-pct', str(pct))
    p.fill('#sn-evidence', evidence)
    for lid in extra_lesson_ids: p.check('input[name=w][value="%s"]' % lid)
    p.click('#snap-save'); p.wait_for_timeout(250)

def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        # P2-01 GPM-b tracker
        ctx, p = page(b, '#/curriculum?cert=gpmb')
        rows = p.locator('tr[data-lesson]').count(); mods = p.locator('.cur-module').count()
        total = p.inner_text('#gpmb-total')
        watched = p.evaluate("() => [...document.querySelectorAll('tr[data-lesson]')].filter(r => r.querySelector('.plat-cell').innerText.trim() === 'Watched').map(r => r.children[1].innerText)")
        d = store(p); secs = sum(l['durationSec'] for l in d['lessons'])
        record('P2-01', 'GPM-b: 67 lessons in Modules 0–8, 17h 15m 17s, 2 watched', rows == 67 and mods == 9 and total == '17h 15m 17s' and secs == 62117 and sorted(watched) == ['Exam Details', 'Sustainability Imperative'],
               '%d rows, %d modules, %s (%d s), watched: %s' % (rows, mods, total, secs, ', '.join(watched)))
        done(ctx, p)

        # P2-02 DPro tracker + UI lock
        ctx, p = page(b, '#/curriculum?cert=dpro')
        items = p.locator('#dpro-table tr[data-module]').count(); tot = p.inner_text('#dpro-total')
        locked = p.evaluate("() => [...document.querySelectorAll('#dpro-table tr.locked')].map(r => r.dataset.module)")
        disabled = p.evaluate("() => ['dpro-m5','dpro-exam'].every(id => document.querySelector('tr[data-module=\"'+id+'\"] .st-sel').disabled)")
        open_sel = p.evaluate("() => !document.querySelector('tr[data-module=\"dpro-m4\"] .st-sel').disabled")
        record('P2-02', 'DPro: M1–M5 + 45-min exam = 300 min; M5 and exam hard-locked in the UI', items == 6 and tot == '300 min' and locked == ['dpro-m5', 'dpro-exam'] and disabled and open_sel,
               '%d items, %s; locked rows %s; their status controls disabled' % (items, tot, locked))
        done(ctx, p)

        # P2-03 lock enforced in state logic (not just UI)
        ctx, p = page(b)
        before = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')")
        a = p.evaluate("() => ECC.actions.setModuleStatus('dpro-m5', 'Completed')")
        c = p.evaluate("() => ECC.store.commit(d => { d.modules.find(m => m.id === 'dpro-exam').personalStatus = 'Completed'; })")
        u = p.evaluate("() => ECC.actions.logSnapshot('dpro', { snapshotDate: '%s', platform: 'Ready CSOD', valuePct: 50, evidence: 'Trying to unlock M5 while M4 is in progress', modules: { 'dpro-m5': { locked: false, platformStatus: 'In Progress' } } })" % TODAY)
        same = p.evaluate("() => localStorage.getItem('ecc2026.v2.data')") == before
        record('P2-03', 'Locks enforced by state logic: no completion of locked items, no unlock before prerequisite', (not a['ok']) and c is False and (not u['ok']) and same,
               'action refused: "%s"; direct commit refused; premature unlock refused: "%s"; store unchanged' % (a['error'][:60], (u.get('error') or '')[:70]))
        done(ctx, p)

        # P2-04 personal vs platform segregation
        ctx, p = page(b, '#/curriculum?cert=gpmb')
        dash = p.inner_text('#cur-personal-pct')
        p.select_option('tr[data-lesson="gpmb-m3-l2"] .st-sel', 'Completed'); p.wait_for_timeout(200)
        d = store(p); l = next(x for x in d['lessons'] if x['id'] == 'gpmb-m3-l2')
        plat = p.inner_text('#cur-platform-pct'); mine = p.inner_text('#cur-personal-pct')
        feas = p.evaluate("() => ECC.calc.feasibility().find(f => f.id === 'F-01').remaining")
        p.goto(APP + '#/curriculum?cert=dpro'); p.wait_for_selector('#dpro-table')
        p.select_option('tr[data-module="dpro-m1"] .st-sel', 'Completed'); p.wait_for_timeout(200)
        dplat = p.inner_text('#cur-platform-pct'); dmine = p.inner_text('#cur-personal-pct')
        record('P2-04', 'Platform and personal progress are separate; personal shows — until you record',
               dash == '—' and l['personalStatus'] == 'Completed' and l['personalLabel'] == 'User Entered' and l['platformWatched'] is False and plat == '2%' and mine.endswith('%') and mine != '—' and feas == 988 and dplat == '50%' and dmine == '10.0%',
               'before: "—"; after marking "Life Cycle" (59:05) complete: yours %s, platform %s, lesson still Not watched, F-01 content still 988 min; DPro M1: yours %s, platform %s' % (mine, plat, dmine, dplat))
        done(ctx, p)

        # P2-05 baseline pinned until a snapshot is logged
        ctx, p = page(b)
        p.evaluate("() => { ECC.actions.setModuleLessonsStatus('gpmb-m1', 'Completed'); ECC.actions.setModuleStatus('dpro-m4', 'Completed'); }")
        p.goto(APP + '#/overview'); p.wait_for_selector('.view-overview')
        ov = p.inner_text('.view-overview'); d = store(p)
        record('P2-05', 'Platform baselines pinned at 2% and 50% until a snapshot is logged',
               len(snaps(d, 'gpmb')) == 1 and len(snaps(d, 'dpro')) == 1 and '2%' in ov and '50%' in ov and sum(l['platformWatched'] for l in d['lessons']) == 2,
               'after 8 personal lesson completions + DPro M4: still 1 snapshot each, 2% / 50%, 2 watched')
        done(ctx, p)

        # P2-06 snapshot provenance required; history append-only
        ctx, p = page(b)
        cases = {
            'no evidence': "{ snapshotDate: '%s', platform: 'PM-Tricks', valuePct: 3, evidence: '' }" % TODAY,
            'no date': "{ snapshotDate: '', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent' }",
            'future date': "{ snapshotDate: '2026-11-05', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent' }",
            'no platform': "{ snapshotDate: '%s', platform: ' ', valuePct: 3, evidence: 'Header shows 3 percent' }" % TODAY,
            'no %': "{ snapshotDate: '%s', platform: 'PM-Tricks', valuePct: '', evidence: 'Header shows 3 percent' }" % TODAY}
        refused = [k for k, js in cases.items() if not p.evaluate("() => ECC.actions.logSnapshot('gpmb', %s).ok" % js)]
        gpmb_snapshot(p, None, [], evidence='')          # UI path: empty form
        ui_err = p.locator('#snap-errors .alert').count() == 1 and p.locator('#snap-form').count() == 1
        p.click('#modal [data-close]')
        base = json.dumps(snaps(store(p), 'gpmb')[0])
        gpmb_snapshot(p, 2, [])
        d = store(p); s = snaps(d, 'gpmb')
        hist_rows = p.locator('#snap-history tbody tr').count()
        new = s[-1]
        record('P2-06', 'Snapshots require capture date, platform and evidence; history is append-only',
               sorted(refused) == sorted(cases) and ui_err and len(s) == 2 and json.dumps(s[0]) == base and new['evidence'] and new['platform'] == 'PM-Tricks' and new['snapshotDate'] == TODAY and new['label'] == 'User Entered' and hist_rows == 2,
               'refused: %s; UI shows error and keeps dialog open; valid snapshot appended, baseline byte-identical' % ', '.join(refused))
        done(ctx, p)

        # P2-07 D-03 recheck — truncation outcome (3%)
        ctx, p = page(b, '#/quality')
        waiting = p.get_attribute('#d03-panel', 'data-state')
        gpmb_snapshot(p, 3, ['gpmb-m0-l2'])
        p.goto(APP + '#/quality'); p.wait_for_selector('#d03-panel')
        st = p.get_attribute('#d03-panel', 'data-state'); alive = p.evaluate("() => [...document.querySelectorAll('#d03-hyp tr[data-alive=true]')].map(r => r.dataset.h)")
        still_open = store(p)['discrepancies'][2]['resolution'] is None
        record('P2-07a', 'D-03 recheck: 3% after exactly one more lesson → only "truncates, 81 items" fits', waiting == 'waiting' and st == 'explained' and alive == ['H3'] and still_open,
               'before: %s; after 3 watched @ 3%%: %s, surviving %s; D-03 still open until you close it with evidence' % (waiting, st, alive))
        done(ctx, p)
        # 4% outcome
        ctx, p = page(b)
        gpmb_snapshot(p, 4, ['gpmb-m0-l2'])
        r = p.evaluate("() => { const x = ECC.calc.d03(); return { state: x.state, alive: x.alive.map(a => a.id), sep: x.separatesAt, met: x.protocolMet }; }")
        record('P2-07b', 'D-03 recheck: 4% → still ambiguous (H1 vs H4), app says when they diverge', r['state'] == 'ambiguous' and r['alive'] == ['H1', 'H4'] and r['met'] and r['sep']['watched'] == 5,
               'surviving %s; first differ at %d watched (%s)' % (r['alive'], r['sep']['watched'], ', '.join('%s→%d%%' % (v['id'], v['pct']) for v in r['sep']['values'])))
        done(ctx, p)

        # P2-08 evidence-gated closing
        ctx, p = page(b, '#/quality')
        open0 = p.evaluate("() => ECC.store.data.discrepancies.filter(x => !x.resolution).length")
        tests = {
            'no evidence': "ECC.actions.resolveDiscrepancy('D-01', { evidence: '', sourceId: 'SRC-PMT', observedOn: '%s' })" % TODAY,
            'short evidence': "ECC.actions.resolveDiscrepancy('D-01', { evidence: 'seen it', sourceId: 'SRC-PMT', observedOn: '%s' })" % TODAY,
            'no source': "ECC.actions.resolveDiscrepancy('D-01', { evidence: 'Counted 14 tests on the course card myself', observedOn: '%s' })" % TODAY,
            'unknown source': "ECC.actions.resolveDiscrepancy('D-01', { evidence: 'Counted 14 tests on the course card myself', sourceId: 'SRC-NOPE', observedOn: '%s' })" % TODAY,
            'D-04 on PMI page': "ECC.actions.resolveDiscrepancy('D-04', { evidence: 'PMI page says 75 questions and 90 minutes', sourceId: 'SRC-PMI-GPMB', observedOn: '%s' })" % TODAY,
            'direct commit w/o evidence': "({ ok: ECC.store.commit(d => { d.discrepancies[0].resolution = { evidence: '', sourceId: 'SRC-PMT', observedOn: '%s' }; }) })" % TODAY}
        rej = [k for k, js in tests.items() if not p.evaluate("() => (%s).ok" % js)]
        # UI: close D-01 via dialog with a new source
        p.click('[data-disc="D-01"] .dq-close'); p.wait_for_selector('#dq-form')
        p.click('#dq-save'); ui_rej = p.locator('#dq-errors .alert').count() == 1
        p.fill('#dq-evidence', 'Course card on PM-Tricks lists 12 tests because the 4 domain tests are grouped as 2 items (checked today).')
        p.select_option('#dq-source', '__new'); p.fill('#dq-ns-title', 'PM-Tricks course card (own check)'); p.fill('#dq-ns-url', 'PM-Tricks course page')
        p.click('#dq-save'); p.wait_for_timeout(250)
        d = store(p); d01 = d['discrepancies'][0]
        badge = p.inner_text('#nav-dq-count')
        closed_ok = d01['resolution'] and d01['values'] == {'courseCard': 12, 'sidebar': 14} and d01['resolution']['sourceId'].startswith('SRC-U-') and any(s['id'] == d01['resolution']['sourceId'] for s in d['sources'])
        hidden_when_closed = p.locator('[data-disc="D-01"]').count() == 0
        p.goto(APP + '#/quality?show=all'); p.wait_for_selector('[data-disc="D-01"] .dq-reopen')
        shown_resolved = 'Evidence:' in p.inner_text('[data-disc="D-01"]')
        p.click('[data-disc="D-01"] .dq-reopen'); p.wait_for_selector('#dq-ro'); p.fill('#dq-reason', 'Need to recount after course update'); p.click('#dq-ro .btn-primary'); p.wait_for_timeout(250)
        d = store(p); d01 = d['discrepancies'][0]
        record('P2-08', 'Discrepancies open by default; closing needs evidence + a registered source; D-04 cannot close on the PMI page',
               open0 == 8 and sorted(rej) == sorted(tests) and ui_rej and closed_ok and badge == '7' and d01['resolution'] is None and len(d01['history']) == 1 and p.inner_text('#nav-dq-count') == '8' and hidden_when_closed and shown_resolved,
               '8 open at start; refused: %s; UI close with new source → 7 open, values kept, listed under All with its evidence; reopen → 8 open, closure kept in history' % ', '.join(rej))
        done(ctx, p)

        # P2-09 DPro snapshot unlocks M5 only after M4 completes; then M5 can be marked complete, exam stays locked
        ctx, p = page(b, '#/curriculum?cert=dpro')
        p.click('#snap-open'); p.wait_for_selector('#snap-form')
        p.fill('#sn-pct', '67'); p.fill('#sn-evidence', 'Ready CSOD shows M4 completed and M5 opened')
        p.select_option('tr[data-mid="dpro-m4"] [name=st]', 'Completed'); p.fill('tr[data-mid="dpro-m4"] [name=pct]', '100')
        p.uncheck('tr[data-mid="dpro-m5"] [name=lk]'); p.select_option('tr[data-mid="dpro-m5"] [name=st]', 'In Progress'); p.fill('tr[data-mid="dpro-m5"] [name=pct]', '0')
        p.click('#snap-save'); p.wait_for_timeout(250)
        m5_enabled = p.evaluate("() => !document.querySelector('tr[data-module=\"dpro-m5\"] .st-sel').disabled")
        ex_disabled = p.evaluate("() => document.querySelector('tr[data-module=\"dpro-exam\"] .st-sel').disabled")
        ok5 = p.evaluate("() => ECC.actions.setModuleStatus('dpro-m5', 'Completed').ok")
        okx = p.evaluate("() => ECC.actions.setModuleStatus('dpro-exam', 'Completed').ok")
        d = store(p)
        record('P2-09', 'Valid DPro snapshot unlocks M5 after M4; exam stays locked until all five modules complete',
               m5_enabled and ex_disabled and ok5 and not okx and snaps(d, 'dpro')[-1]['valuePct'] == 67 and snaps(d, 'dpro')[0]['valuePct'] == 50,
               'snapshot 67% logged (50% baseline kept); M5 now markable; exam completion refused')
        done(ctx, p)

        # P2-10 persistence + backup validity after Phase 2 actions
        ctx, p = page(b)
        p.evaluate("() => { ECC.actions.setLessonStatus('gpmb-m2-l1', 'In Progress'); ECC.actions.logSnapshot('gpmb', { snapshotDate: '%s', platform: 'PM-Tricks', valuePct: 2, evidence: 'Header unchanged at 2 percent', watchedLessonIds: ['gpmb-m0-l1','gpmb-m1-l1'] }); ECC.actions.resolveDiscrepancy('D-07', { evidence: 'Ready CSOD shows the 24 Oct date as completion date on M1', sourceId: 'SRC-CSOD', observedOn: '%s' }); }" % (TODAY, TODAY))
        p.reload(); p.wait_for_selector('.view')
        d = store(p)
        valid = p.evaluate("() => ECC.validate.state(ECC.store.data)")
        record('P2-10', 'Phase 2 records survive reload and the store stays valid',
               next(l for l in d['lessons'] if l['id'] == 'gpmb-m2-l1')['personalStatus'] == 'In Progress' and len(snaps(d, 'gpmb')) == 2 and d['discrepancies'][6]['resolution'] and valid['ok'] and not valid['warnings'],
               'status, snapshot and closure persisted; validation ok, 0 warnings')
        done(ctx, p)

        # P2-11 mobile
        ctx, p = page(b, '', 390, 844)
        over = []
        for h in ['#/curriculum?cert=gpmb', '#/curriculum?cert=dpro', '#/quality']:
            p.goto(APP + h); p.wait_for_selector('.view')
            if p.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1"): over.append(h)
        p.goto(APP + '#/curriculum?cert=gpmb'); p.wait_for_selector('#snap-open'); p.click('#snap-open'); p.wait_for_selector('#snap-form')
        if p.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1"): over.append('gpmb snapshot dialog')
        p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase2-mobile-snapshot.png'))
        record('P2-11', 'Mobile 390 px: curriculum, data quality and snapshot dialog without horizontal scroll', not over, 'overflow: %s' % (over or 'none'))
        done(ctx, p)

        # P2-13 v1 data with a locked module marked complete imports safely (value preserved, not active)
        v1 = json.loads((ROOT.parent / 'reference' / 'v1.0.0-build' / 'data' / 'initial-data.json').read_text())
        next(m for m in v1['modules'] if m['id'] == 'dpro-m5')['personalStatus'] = 'Completed'
        ctx, p = page(b)
        r = p.evaluate("v1 => { const m = ECC.migrate.fromV1(v1, window.ECC_SEED); const x = m.data.modules.find(q => q.id === 'dpro-m5'); return { st: x.personalStatus, kept: x.personalStatusV1, ok: ECC.validate.state(m.data).ok, note: m.log.find(l => l.includes('locked')) }; }", v1)
        record('P2-13', 'v1 record marking a locked module complete imports safely: kept as In Progress, v1 value preserved', r['st'] == 'In Progress' and r['kept'] == 'Completed' and r['ok'] and bool(r['note']),
               'migration note: "%s"' % (r['note'] or '')[:90])
        done(ctx, p)

        # P2-14 snapshot dialogs pre-fill from the latest snapshot; only the change is entered; history append-only
        ctx, p = page(b, '#/curriculum?cert=dpro')
        p.evaluate("() => ECC.actions.logSnapshot('dpro', { snapshotDate: '%s', platform: 'Ready CSOD', valuePct: 67, evidence: 'M4 completed and M5 opened on Ready CSOD', modules: { 'dpro-m4': { platformStatus: 'Completed', platformProgressPct: 100, platformTimeSpentMin: 52 }, 'dpro-m5': { locked: false, platformStatus: 'In Progress', platformProgressPct: 0, platformTimeSpentMin: 5, lastAccessed: '%s' } } })" % (TODAY, TODAY))
        before = json.dumps(snaps(store(p), 'dpro'))
        p.click('#snap-open'); p.wait_for_selector('#snap-form')
        row = lambda mid, n: p.input_value('tr[data-mid="%s"] [name=%s]' % (mid, n))
        pre = (p.input_value('#sn-pct') == '67' and row('dpro-m4', 'st') == 'Completed' and row('dpro-m4', 'pct') == '100' and row('dpro-m4', 'time') == '52'
               and row('dpro-m1', 'time') == '68' and row('dpro-m1', 'la') == '2026-10-24' and row('dpro-m5', 'st') == 'In Progress' and not p.is_checked('tr[data-mid="dpro-m5"] [name=lk]')
               and p.is_checked('tr[data-mid="dpro-exam"] [name=lk]') and 'No changes' in p.inner_text('#sn-diff') and p.input_value('#sn-evidence') == '')
        p.fill('tr[data-mid="dpro-m5"] [name=pct]', '40'); p.fill('#sn-pct', '75')
        diff = p.inner_text('#sn-diff'); hl = p.locator('tr[data-mid="dpro-m5"].changed').count() == 1 and p.locator('tr.changed').count() == 1
        p.fill('#sn-evidence', 'M5 shows 40 percent, overall 75 percent'); p.click('#snap-save'); p.wait_for_timeout(250)
        after = snaps(store(p), 'dpro'); new = after[-1]
        kept = json.dumps(after[:-1]) == before and len(after) == 3
        ms = new['moduleStates']
        same_rest = ms['dpro-m1']['platformTimeSpentMin'] == 68 and ms['dpro-m4']['platformStatus'] == 'Completed' and ms['dpro-exam']['locked'] is True and ms['dpro-m5']['platformProgressPct'] == 40
        # GPM-b dialog
        p.evaluate("() => ECC.actions.logSnapshot('gpmb', { snapshotDate: '%s', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent', watchedLessonIds: ['gpmb-m0-l1','gpmb-m1-l1','gpmb-m0-l2'] })" % TODAY)
        go(p, '#/curriculum?cert=gpmb'); p.click('#snap-open'); p.wait_for_selector('#snap-form')
        gpre = p.input_value('#sn-pct') == '3' and p.locator('input[name=w]:checked').count() == 3 and 'No changes' in p.inner_text('#sn-diff') and '3%' in p.inner_text('#sn-prefill')
        p.check('input[name=w][value="gpmb-m0-l3"]'); gdiff = p.inner_text('#sn-diff')
        p.screenshot(path=str(ROOT / 'docs' / 'screenshot-snapshot-prefill.png'))
        record('P2-14', 'Snapshot dialogs pre-fill from the latest snapshot; only changes are entered; earlier snapshots untouched',
               pre and 'Overall %: 67% → 75%' in diff and 'Closing a Project' in diff and '% 0 → 40' in diff and hl and kept and same_rest and gpre and 'GPM-b Study Plan: now watched' in gdiff,
               'DPro opened at 67% with every item as last logged; changed only M5 % (0 → 40) and overall (→ 75) — diff listed exactly those; saved as snapshot 3, snapshots 1–2 byte-identical; GPM-b opened at 3% with 3 lessons ticked')
        done(ctx, p)

        # screenshots
        ctx, p = page(b, '#/curriculum?cert=gpmb'); p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase2-gpmb.png'))
        p.goto(APP + '#/curriculum?cert=dpro'); p.wait_for_selector('#dpro-table'); p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase2-dpro.png'), full_page=True)
        p.goto(APP + '#/quality'); p.wait_for_selector('#d03-panel'); p.locator('[data-disc="D-03"]').screenshot(path=str(ROOT / 'docs' / 'screenshot-phase2-d03.png'))
        done(ctx, p)

        record('P2-12', 'No console or page errors across all Phase 2 tests', not all_errors, '%d errors %s' % (len(all_errors), all_errors[:3]))
        b.close()
    passed = sum(r['status'] == 'PASS' for r in results)
    (ROOT / 'tests' / 'phase2-results.json').write_text(json.dumps({'phase': 2, 'passed': passed, 'total': len(results), 'results': results}, indent=2) + '\n')
    print('\n%d / %d passed' % (passed, len(results)))
    sys.exit(0 if passed == len(results) else 1)

if __name__ == '__main__':
    main()
