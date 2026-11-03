"""
The home screen, counted (STREAMLINE S14): visible, un-covered buttons and text blocks at 1280x800 and 390x844,
on the first view and with the Desk open, plus screenshots.

    npx vite --port 5201 &
    python3 scripts/playtest/homeCount.py http://127.0.0.1:5201/ out_dir tag

Uses the preinstalled Playwright (Python); installs nothing.
"""
import sys, time, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = sys.argv[2]; TAG = sys.argv[3]

def clear(pg, n=25):
    for _ in range(n):
        if not pg.query_selector('[role=dialog]'):
            return
        for lab in ['Let it play out', 'Skip all', 'Skip', 'Continue', 'Done', 'Close', 'Got it', 'Later', 'Not now']:
            el = pg.query_selector(f'[role=dialog] button:has-text("{lab}")')
            if el and el.is_visible():
                try:
                    el.click(timeout=2000, force=True); break
                except Exception: pass
        else:
            pg.keyboard.press('Escape')
        time.sleep(0.5)

COUNT = '''() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    const st = getComputedStyle(e); if (st.visibility === 'hidden' || st.opacity === '0') return false;
    const x = Math.min(innerWidth-1, Math.max(0, r.left + r.width/2)), y = Math.min(innerHeight-1, Math.max(0, r.top + r.height/2));
    const t = document.elementFromPoint(x, y); return !!t && (e === t || e.contains(t) || t.contains(e)); };
  const btns = [...document.querySelectorAll('button, [role=button], a[href], select, input')].filter(vis);
  const texts = [...document.querySelectorAll('p, li, h1, h2, h3, span, div')].filter((e) => { if (!vis(e)) return false; const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2); return own; });
  const byArea = {};
  for (const b of btns) { const a = b.closest('[data-testid]'); const k = a ? a.getAttribute('data-testid') : '?'; byArea[k] = (byArea[k]||0)+1; }
  return { buttons: btns.length, texts: texts.length, byArea, labels: btns.map((b) => (b.getAttribute('data-testid') || b.textContent.trim().slice(0, 24))) };
}'''

with sync_playwright() as p:
    b = p.chromium.launch()
    res = {}
    for (w, h) in [(1280, 800), (390, 844)]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.goto(URL, wait_until='load', timeout=180000); pg.wait_for_selector('[data-testid=menu-new]', timeout=180000)
        pg.click('[data-testid=menu-new]')
        pg.click('[data-testid=start-as-written]')
        time.sleep(2); clear(pg)
        pg.screenshot(path=f'{OUT}/{TAG}-{w}-home.png')
        res[f'{w}-home'] = pg.evaluate(COUNT)
        wb = pg.query_selector('[data-testid=waiting-button]')
        if wb and wb.is_visible():
            wb.click(); time.sleep(1)
        pg.screenshot(path=f'{OUT}/{TAG}-{w}-desk.png')
        res[f'{w}-desk'] = pg.evaluate(COUNT)
        pg.close()
    for k, v in res.items():
        print(k, 'buttons', v['buttons'], 'texts', v['texts'])
        print('   ', sorted(v['byArea'].items(), key=lambda x: -x[1])[:14])
    json.dump(res, open(f'{OUT}/{TAG}.json', 'w'), indent=1)
