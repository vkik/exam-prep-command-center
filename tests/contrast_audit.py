"""WCAG colour-contrast audit (axe-core 'color-contrast' rule) across every page and dialog.
Run:  npm install axe-core@4.10.2 --prefix /some/folder   then
      ECC_AXE=/some/folder/node_modules/axe-core/axe.min.js python3 tests/contrast_audit.py
Uses an isolated browser with sample data; your real data is never touched. Exit code 1 if any violation."""
import json, sys, os, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = (ROOT / 'index.html').as_uri()
AXE = open(os.environ.get('ECC_AXE', 'node_modules/axe-core/axe.min.js')).read()
pages=['overview','planner','planner?view=week&date=2026-11-02','planner?view=day&date=2026-10-31','log','curriculum?cert=gpmb','curriculum?cert=dpro','quality','quality?show=all','settings','assessments']
dialogs=[('curriculum?cert=dpro','#snap-open'),('curriculum?cert=gpmb','#snap-open'),('log','#log-open'),('planner','#plan-add-top'),('quality','[data-disc="D-01"] .dq-close')]
# Owner decision (31 Oct 2026): primary buttons and active tabs use white on Sky-600 #0284C7 (4.10:1).
# These are reported as ACCEPTED, not hidden. Any other contrast failure fails the audit.
def is_accepted(x):
    return (x.get('fg') or '').lower() == '#ffffff' and (x.get('bg') or '').lower() == '#0284c7'
accepted=[]
tot=0; out=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(); c=b.new_context(viewport={'width':1400,'height':900}); c.add_init_script("window.ECC={__fakeToday:'2026-10-31'}"); p=c.new_page()
    p.goto(APP); p.wait_for_selector('.view')
    # some data so tags/pills/tables render in every state
    p.evaluate("""() => { const A=ECC.actions; A.logActual({certificationId:'gpmb',date:'2026-10-31',durationMin:25,studyType:'Video',topic:'Life cycle',notes:'notes here'});
      A.addPlanned({certificationId:'dpro',date:'2026-10-31',plannedMinutes:30,topic:'M4'}); A.addPlanned({certificationId:'gpmb',date:'2026-11-02',plannedMinutes:40,topic:'Ethics'});
      A.setLessonStatus('gpmb-m1-l2','Completed'); A.setModuleStatus('dpro-m1','In Progress');
      A.resolveDiscrepancy('D-07',{evidence:'Ready CSOD shows the 24 Oct date as the completion date',sourceId:'SRC-CSOD',observedOn:'2026-10-31'}); }""")
    p.wait_for_timeout(4000)   # let setup toasts finish fading (a fading toast is a transitional frame, not a colour)
    def run(label):
        global tot
        p.add_script_tag(content=AXE)
        r=p.evaluate("async () => { const r = await axe.run(document, { runOnly: ['color-contrast'] }); return r.violations.flatMap(v => v.nodes.map(n => ({t: n.target.join(' '), s: n.any[0] && n.any[0].message, fg: n.any[0] && n.any[0].data && n.any[0].data.fgColor, bg: n.any[0] && n.any[0].data && n.any[0].data.bgColor}))); }")
        acc=[x for x in r if is_accepted(x)]; r=[x for x in r if not is_accepted(x)]
        tot+=len(r); out.append((label,r)); accepted.extend((label,x['t']) for x in acc)
    # toasts themselves are audited at full opacity
    p.goto(APP+'#/overview'); p.wait_for_selector('.view'); p.evaluate("() => { ECC.ui.toast('Contrast check: confirmation toast'); ECC.ui.toast('Contrast check: error toast', 'err'); }"); p.wait_for_timeout(300); run('toasts (full opacity)')
    p.wait_for_timeout(4000)
    for h in pages:
        p.goto(APP+'#/'+h); p.wait_for_selector('.view'); p.wait_for_timeout(150); run(h)
    for h,btn in dialogs:
        p.goto(APP+'#/'+h); p.wait_for_selector('.view'); p.click(btn); p.wait_for_selector('#modal'); p.wait_for_timeout(150); run(h+' + dialog')
        p.keyboard.press('Escape')
for l,r in out:
    print(f'{l:40} {len(r)} issues')
    for x in r[:6]: print('    ',x['t'][:70],'|',(x['s'] or '')[:150])
print('TOTAL', tot); print('ACCEPTED (white on #0284C7, owner decision):', len(accepted), sorted(set(t for _, t in accepted))[:12])
(ROOT / 'tests' / 'contrast-results.json').write_text(json.dumps({'rule': 'color-contrast (WCAG 2 AA)', 'states': len(out), 'violations': tot, 'acceptedByOwnerDecision': {'rule': 'white text on Sky-600 #0284C7 (4.10:1) — primary buttons and active tabs', 'count': len(accepted), 'elements': sorted(set(t for _, t in accepted))}, 'byState': {l: len(r) for l, r in out}}, indent=2) + '\n')
sys.exit(1 if tot else 0)
