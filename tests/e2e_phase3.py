"""Phase 3 acceptance tests — Planner, Study Log, milestones and live feasibility.

Run:  python3 tests/e2e_phase3.py     (needs Python Playwright + Chromium)
Each test uses a fresh, isolated browser; nothing touches your real browser data. Study entries typed
below exist only inside those throw-away browsers.
"""
import json, sys, pathlib
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'index.html').as_uri()
TODAY = '2026-10-31'
results, all_errors = [], []

def record(tid, name, ok, detail):
    results.append({'id': tid, 'name': name, 'status': 'PASS' if ok else 'FAIL', 'detail': detail})
    print(('PASS' if ok else 'FAIL'), tid, name, '—', detail)

def page(b, hash_='', w=1400, h=900, today=TODAY):
    ctx = b.new_context(viewport={'width': w, 'height': h})
    ctx.add_init_script("window.ECC = window.ECC || {}; window.ECC.__fakeToday = '%s';" % today)
    p = ctx.new_page(); p.errors = []
    p.on('console', lambda m: p.errors.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: p.errors.append(str(e)))
    p.goto(APP + hash_); p.wait_for_selector('#content .view')
    return ctx, p

def store(p): return json.loads(p.evaluate("() => localStorage.getItem('ecc2026.v2.data')"))
def done(ctx, p): all_errors.extend(p.errors); ctx.close()
def go(p, h): p.goto(APP + h); p.wait_for_selector('#content .view')
def feas(p, fid): return p.evaluate("id => { const f = ECC.calc.feasibility().find(x => x.id === id); return { days: f.days, budget: f.budget, video: f.videoMin, margin: f.margin }; }", fid)

def log_via_ui(p, fields):
    p.wait_for_selector('#log-form')
    for sel, val in fields.items():
        if sel in ('#lg-type', '#lg-mod', '#lg-conf', '#lg-cert'): p.select_option(sel, val)
        else: p.fill(sel, str(val))
    p.click('#log-save'); p.wait_for_timeout(200)

def expected_budget(start, end, per_day, overrides=None):
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end); tot = 0
    while d0 <= d1:
        tot += (overrides or {}).get(d0.isoformat(), per_day); d0 += timedelta(days=1)
    return tot

def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        # P3-01 three planner views + default targets
        ctx, p = page(b, '#/planner')
        cells = p.locator('#plan-window a.cal-day').count()
        first = p.get_attribute('#plan-window a.cal-day >> nth=0', 'data-date'); last = p.get_attribute('#plan-window a.cal-day >> nth=-1', 'data-date')
        tg = p.evaluate("() => [...document.querySelectorAll('#targets-form input')].map(i => i.value)")
        go(p, '#/planner?view=week&date=2026-11-02'); wk = p.locator('#week-table tbody tr').count(); wtot = p.inner_text('#week-totals')
        go(p, '#/planner?view=day&date=2026-10-31'); dcards = p.locator('#plan-view section[data-cert]').count()
        record('P3-01', 'Day, Week and Planning-window views; default targets 40 + 30 = 70', cells == 45 and first == '2026-10-31' and last == '2026-12-14' and tg == ['40', '30'] and wk == 7 and '280' in wtot and '210' in wtot and dcards == 2,
               'window %d days (%s → %s); week of 2 Nov: 7 rows, target totals 280 / 210; day: 2 certification cards; targets %s' % (cells, first, last, '/'.join(tg)))
        done(ctx, p)

        # P3-02 targets editable; below 30 refused (UI, action, store, per-day)
        ctx, p = page(b, '#/planner')
        p.fill('#targets-form input[name=gpmb]', '25'); p.click('#targets-save'); p.wait_for_timeout(200)
        ui_refused = store(p)['settings']['dailyTargetMin'] == {'gpmb': 40, 'dpro': 30}
        act = p.evaluate("() => ECC.actions.setDailyTargets({ gpmb: 40, dpro: 29 }).ok")
        com = p.evaluate("() => ECC.store.commit(d => { d.settings.dailyTargetMin.gpmb = 10; })")
        go(p, '#/planner?view=day&date=2026-11-02'); p.fill('section[data-cert=dpro] .day-target input', '20'); p.click('section[data-cert=dpro] .day-target button[type=submit]'); p.wait_for_timeout(200)
        day_refused = '2026-11-02' not in store(p)['settings']['dailyTargetOverrides']
        go(p, '#/planner'); p.fill('#targets-form input[name=gpmb]', '45'); p.fill('#targets-form input[name=dpro]', '35'); p.click('#targets-save'); p.wait_for_timeout(200)
        s = store(p)['settings']; summ = p.inner_text('#targets-summary')
        record('P3-02', 'Targets editable in the UI; any target below 30 min refused (UI, action, store, per-day)',
               ui_refused and act is False and com is False and day_refused and s['dailyTargetMin'] == {'gpmb': 45, 'dpro': 35} and s['dailyTargetLabel'] == 'User Entered' and summ.startswith('80 min/day'),
               'GPM-b 25 (UI), DPro 29 (action), GPM-b 10 (direct), DPro 20 for one day — all refused; 45/35 saved → "%s"' % summ[:40])
        done(ctx, p)

        # P3-03 / P3-04 planned vs actual through the UI
        ctx, p = page(b, '#/planner?view=day&date=2026-10-31')
        p.click('section[data-cert=gpmb] .pl-add'); p.wait_for_selector('#plan-form')
        p.fill('#pl-min', '40'); p.select_option('#pl-mod', 'gpmb-m3'); p.fill('#pl-topic', 'PRiSM life cycle'); p.click('#plan-save'); p.wait_for_timeout(200)
        planned = p.inner_text('section[data-cert=gpmb] [data-k=planned]'); actual = p.inner_text('section[data-cert=gpmb] [data-k=actual]')
        top = p.inner_text('#topbar-meta'); log_total = p.evaluate("() => ECC.calc.studyTotals().total")
        past = p.evaluate("() => ECC.actions.addPlanned({ certificationId: 'gpmb', date: '2026-10-30', plannedMinutes: 30, topic: 'x' }).ok")
        record('P3-03', 'A planned session is stored and shown as planned only — never counted as study',
               planned == '40m' and actual == '0m' and 'GPM-b 0/40m' in top and log_total == 0 and past is False and store(p)['plannedSessions'][0]['status'] == 'Planned',
               'planned 40m, actual 0m, top bar "GPM-b 0/40m", total actual study 0; planning in the past refused')
        p.click('section[data-cert=gpmb] .pl-log'); log_via_ui(p, {'#lg-dur': 35, '#lg-type': 'Video', '#lg-notes': 'Watched Life Cycle lesson, took notes'})
        d = store(p); plan = d['plannedSessions'][0]; act = d['actualSessions'][0]
        planned2 = p.inner_text('section[data-cert=gpmb] [data-k=planned]'); actual2 = p.inner_text('section[data-cert=gpmb] [data-k=actual]')
        go(p, '#/planner?view=week&date=2026-10-31'); wt = p.inner_text('#week-totals')
        go(p, '#/overview'); ov = p.inner_text('#ov-study')
        record('P3-04', 'Logging against a plan: plan becomes Done; planned and actual stay separate everywhere',
               plan['status'] == 'Done' and plan['linkedActualId'] == act['id'] and act['entryMethod'] == 'manual' and act['label'] == 'User Entered' and planned2 == '40m' and actual2 == '35m' and 'Partial' in p.inner_text('#ov-study') and '35 / 40' in ov,
               'plan Done (linked), actual 35 min manual/User Entered; day: planned 40m vs actual 35m; week totals "%s"; overview "35 / 40 Partial"' % ' '.join(wt.split())[:60])
        done(ctx, p)

        # P3-05 logger validation via UI and actions
        ctx, p = page(b, '#/log')
        p.click('#log-open'); log_via_ui(p, {'#lg-dur': 0, '#lg-type': 'Reading', '#lg-topic': 'Guide ch.1', '#lg-notes': 'Read'})
        ui_zero = p.locator('#log-errors .alert').count() == 1 and 'zero' in p.inner_text('#log-errors')
        p.evaluate("() => { document.getElementById('lg-date').removeAttribute('max'); }"); p.fill('#lg-date', '2026-11-05'); p.fill('#lg-dur', '30'); p.click('#log-save'); p.wait_for_timeout(150)
        ui_future = 'future' in p.inner_text('#log-errors')
        p.fill('#lg-date', TODAY); p.fill('#lg-notes', ''); p.click('#log-save'); p.wait_for_timeout(150)
        ui_notes = 'notes' in p.inner_text('#log-errors').lower()
        p.click('#modal [data-close]')
        base = "{ certificationId: 'dpro', date: '%s', durationMin: 30, studyType: 'Reading', topic: 'Logframe', notes: 'Read guide' }" % TODAY
        bad = {'negative': "durationMin: -5", 'fraction': "durationMin: 2.5", 'future': "date: '2026-11-01'", 'no type': "studyType: ''",
               'no topic/module': "topic: '', moduleId: null", 'bad start time': "startTime: '7pm'", 'confidence 6': "confidence: 6"}
        refused = [k for k, v in bad.items() if not p.evaluate("() => ECC.actions.logActual(Object.assign(%s, { %s })).ok" % (base, v))]
        okp = p.evaluate("() => ECC.actions.logActual(%s).ok" % base)
        record('P3-05', 'Study log rejects future dates, zero/negative/fractional minutes and missing required fields',
               ui_zero and ui_future and ui_notes and sorted(refused) == sorted(bad) and okp and len(store(p)['actualSessions']) == 1,
               'UI: 0 min, future date, empty notes refused with a message; action refused: %s; valid entry without optional fields accepted' % ', '.join(refused))
        done(ctx, p)

        # P3-06 manual-only
        ctx, p = page(b)
        auto = [p.evaluate("() => ECC.actions.logActual({ certificationId: 'gpmb', date: '%s', durationMin: 25, studyType: 'Video', topic: 'x', notes: 'x', %s }).ok" % (TODAY, x)) for x in ["source: 'timer'", "entryMethod: 'auto'", "videoLengthSec: 1497", "browserMinutes: 25"]]
        direct = p.evaluate("() => ECC.store.commit(d => { d.actualSessions.push({ id: 'as-t', certificationId: 'gpmb', date: '%s', durationMin: 25, studyType: 'Video', topic: 'x', notes: 'x', entryMethod: 'timer', label: 'User Entered' }); })" % TODAY)
        # activity that must never create study time: browsing pages, logging a platform snapshot with more lessons watched, waiting
        for h in ['#/curriculum?cert=gpmb', '#/planner', '#/curriculum?cert=dpro', '#/overview']: go(p, h)
        p.evaluate("() => ECC.actions.logSnapshot('gpmb', { snapshotDate: '%s', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent', watchedLessonIds: ['gpmb-m0-l1','gpmb-m1-l1','gpmb-m0-l2'] })" % TODAY)
        p.wait_for_timeout(1500)
        n = len(store(p)['actualSessions'])
        record('P3-06', 'Study time only by explicit manual entry — timers, video length, browsing never create study',
               not any(auto) and direct is False and n == 0, 'timer / auto / video-length / browser-time entries refused; after browsing, a snapshot with a newly watched lesson and waiting: %d sessions' % n)
        done(ctx, p)

        # P3-07 rescheduling missed and skipped plans (clock moved forward)
        ctx, p = page(b)
        p.evaluate("() => { ECC.actions.addPlanned({ certificationId: 'dpro', date: '2026-10-31', plannedMinutes: 30, topic: 'M4 Implementing' }); ECC.actions.addPlanned({ certificationId: 'gpmb', date: '2026-11-01', plannedMinutes: 40, topic: 'Ethics' }); }")
        ctx.add_init_script("window.ECC.__fakeToday = '2026-11-03';")
        p.reload(); p.wait_for_selector('.view'); go(p, '#/planner')
        missed = p.locator('#missed-card li').count(); overdue = p.inner_text('#missed-card')
        p.click('#missed-card .pl-res >> nth=0'); p.wait_for_selector('#rs-form'); p.fill('#rs-date', '2026-11-04'); p.click('#rs-save'); p.wait_for_timeout(200)
        d = store(p); orig = next(x for x in d['plannedSessions'] if x['date'] == '2026-10-31'); new = next(x for x in d['plannedSessions'] if x.get('rescheduledFrom') == orig['id'])
        p.click('#res-all'); p.wait_for_selector('#rs-form'); p.fill('#rs-date', '2026-11-05'); p.click('#rs-save'); p.wait_for_timeout(200)
        d = store(p); gone = p.locator('#missed-card').count() == 0
        record('P3-07', 'Missed / skipped plans can be rescheduled; originals kept as Rescheduled',
               missed == 2 and 'Overdue' in overdue and orig['status'] == 'Rescheduled' and new['date'] == '2026-11-04' and new['status'] == 'Planned' and gone and sum(1 for x in d['plannedSessions'] if x['status'] == 'Rescheduled') == 2,
               '2 overdue shown on 3 Nov; one moved to 4 Nov, the rest to 5 Nov in bulk; 2 originals kept as Rescheduled; nothing overdue left')
        done(ctx, p)

        # P3-08 live feasibility math against an independent calculation
        ctx, p = page(b, '#/planner')
        f1, f2, f3 = feas(p, 'F-01'), feas(p, 'F-02'), feas(p, 'F-03')
        e1 = expected_budget(TODAY, '2026-11-28', 40); e2 = expected_budget(TODAY, '2026-11-14', 30); e3 = expected_budget(TODAY, '2026-12-14', 70)
        base_ok = (f1['budget'], f1['video'], f1['margin']) == (e1, 988, e1 - 988) and (f2['budget'], f2['video']) == (e2, 120) and (f3['budget'], f3['video']) == (e3, 1108)
        card = p.inner_text('[data-feas="F-01"]')
        p.fill('#targets-form input[name=gpmb]', '45'); p.click('#targets-save'); p.wait_for_timeout(200)
        f1b = feas(p, 'F-01'); card_b = p.inner_text('[data-feas="F-01"] [data-k=margin]')
        p.evaluate("() => ECC.actions.setDayTarget('2026-11-01', { gpmb: 60 })")
        f1c = feas(p, 'F-01')
        p.evaluate("() => ECC.actions.logSnapshot('gpmb', { snapshotDate: '%s', platform: 'PM-Tricks', valuePct: 3, evidence: 'Header shows 3 percent', watchedLessonIds: ['gpmb-m0-l1','gpmb-m1-l1','gpmb-m0-l2'] })" % TODAY)
        f1d = feas(p, 'F-01')
        go(p, '#/planner'); p.fill('tr[data-ms="ms-gpmb-curr"] .ms-date', '2026-12-01'); p.dispatch_event('tr[data-ms="ms-gpmb-curr"] .ms-date', 'change'); p.wait_for_timeout(200)
        f1e = feas(p, 'F-01'); badge = p.inner_text('[data-feas="F-01"] .card-sub')
        e_b = expected_budget(TODAY, '2026-11-28', 45); e_c = expected_budget(TODAY, '2026-11-28', 45, {'2026-11-01': 60}); e_e = expected_budget(TODAY, '2026-12-01', 45, {'2026-11-01': 60})
        rem_d = round((62117 - 1497 - 1330 - 103) / 60)
        record('P3-08', 'Live feasibility matches an independent calculation as targets, platform data and dates change',
               base_ok and 'Video watching' in card and f1b['budget'] == e_b and f1b['margin'] == e_b - 988 and card_b.startswith('5h 17m') and f1c['budget'] == e_c and f1d['video'] == rem_d and f1e['days'] == 32 and f1e['budget'] == e_e and 'User Entered' in badge,
               'F-01 %d/%d/+%d → 45 min: %d (+%d) → +15 on 1 Nov: %d → one more lesson watched: video %d → your date 1 Dec: %d days, %d min; F-02 %d/%d; F-03 %d/%d' % (
                   f1['budget'], f1['video'], f1['margin'], f1b['budget'], f1b['margin'], f1c['budget'], f1d['video'], f1e['days'], f1e['budget'], f2['budget'], f2['video'], f3['budget'], f3['video']))
        done(ctx, p)

        # P3-09 milestones + messaging
        ctx, p = page(b, '#/planner')
        prim = p.evaluate("() => [...document.querySelectorAll('#ms-table tr.primary')].map(r => r.dataset.ms + ' ' + r.children[2].innerText)")
        txt = p.inner_text('.view-planner'); ov = (go(p, '#/overview'), p.inner_text('.view-overview'))[1]
        record('P3-09', 'Primary milestones 14 Nov / 28 Nov / 14 Dec tracked and labelled planning targets, not exam appointments',
               any('ms-dpro-curr 14 Nov 2026' in x for x in prim) and any('ms-gpmb-curr 28 Nov 2026' in x for x in prim) and any('ms-exam-ready 14 Dec 2026' in x for x in prim)
               and 'not confirmed examination appointments' in txt.lower() and 'not exam appointments' in ov.lower(),
               '; '.join(x.split('\n')[0] for x in prim))
        done(ctx, p)

        # P3-10 persistence + validity
        ctx, p = page(b)
        p.evaluate("() => { ECC.actions.setDailyTargets({ gpmb: 50, dpro: 30 }); ECC.actions.addPlanned({ certificationId: 'dpro', date: '2026-11-02', plannedMinutes: 30, topic: 'M5' }); ECC.actions.logActual({ certificationId: 'dpro', date: '%s', durationMin: 30, studyType: 'Revision', topic: 'Logframe', notes: 'Revised assumptions column', confidence: 3 }); ECC.actions.setMilestoneStatus('ms-diag', 'In Progress'); }" % TODAY)
        p.reload(); p.wait_for_selector('.view')
        d = store(p); v = p.evaluate("() => ECC.validate.state(ECC.store.data)")
        record('P3-10', 'Targets, plans, logged study and milestone status survive reload; store valid',
               d['settings']['dailyTargetMin']['gpmb'] == 50 and len(d['plannedSessions']) == 1 and len(d['actualSessions']) == 1 and d['milestones'][0]['status'] == 'In Progress' and v['ok'] and not v['warnings'],
               'all persisted; validation ok, 0 warnings')
        done(ctx, p)

        # P3-11 mobile
        ctx, p = page(b, '', 390, 844)
        over = []
        for h in ['#/planner', '#/planner?view=week&date=2026-11-02', '#/planner?view=day&date=2026-10-31', '#/log', '#/overview']:
            go(p, h)
            if p.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1"): over.append(h)
        go(p, '#/log'); p.click('#log-open'); p.wait_for_selector('#log-form')
        if p.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1"): over.append('log dialog')
        p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase3-mobile-log.png'))
        record('P3-11', 'Mobile 390 px: planner views, study log, overview and log dialog without horizontal scroll', not over, 'overflow: %s' % (over or 'none'))
        done(ctx, p)

        ctx, p = page(b, '#/planner'); p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase3-planner.png'), full_page=True)
        go(p, '#/planner?view=day&date=2026-10-31'); p.screenshot(path=str(ROOT / 'docs' / 'screenshot-phase3-day.png'))
        done(ctx, p)

        record('P3-12', 'No console or page errors across all Phase 3 tests', not all_errors, '%d errors %s' % (len(all_errors), all_errors[:3]))
        b.close()
    passed = sum(r['status'] == 'PASS' for r in results)
    (ROOT / 'tests' / 'phase3-results.json').write_text(json.dumps({'phase': 3, 'passed': passed, 'total': len(results), 'results': results}, indent=2) + '\n')
    print('\n%d / %d passed' % (passed, len(results)))
    sys.exit(0 if passed == len(results) else 1)

if __name__ == '__main__':
    main()
