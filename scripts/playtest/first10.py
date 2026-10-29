"""
The first ten minutes (STREAMLINE_PLAN §5.3), scripted: does each beat exist, and how long does a
fast player take to reach it? Prints one line per beat with the elapsed seconds.

    npx vite --port 5199 &   # the dev server
    python3 scripts/playtest/first10.py http://127.0.0.1:5199/ [out_dir]

Uses the preinstalled Playwright (Python); installs nothing.
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5199/'
OUT = sys.argv[2] if len(sys.argv) > 2 else None
t0 = time.time()
beats = []


def beat(name, ok, pg=None):
    beats.append((name, ok, round(time.time() - t0, 1)))
    print(f'{time.time() - t0:6.1f}s  {"OK  " if ok else "MISS"}  {name}', flush=True)
    if OUT and pg:
        pg.screenshot(path=f'{OUT}/first10-{len(beats):02d}.png')


def clear(pg, n=25):
    """Close the opening's cards the quick way (skip the cutscene, let the ceremony play out)."""
    for _ in range(n):
        if not pg.query_selector('[role=dialog]'):
            return
        for lab in ['Let it play out', 'Skip all', 'Skip', 'Continue', 'Done', 'Close', 'Got it', 'Later', 'Not now']:
            el = pg.query_selector(f'[role=dialog] button:has-text("{lab}")')
            if el and el.is_visible():
                try:
                    el.click(timeout=2000, force=True)
                    break
                except Exception:
                    pass
        else:
            pg.keyboard.press('Escape')
        time.sleep(0.5)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.goto(URL, wait_until='networkidle')
    pg.click('[data-testid=menu-new]')
    beat('Start menu: "Start here" is marked and pre-selected', bool(pg.query_selector('[data-testid=start-here]')), pg)
    pg.click('[data-testid=start-as-written]')
    time.sleep(2)
    clear(pg)
    beat('Cold open done: in the game, the clock running', bool(pg.query_selector('[data-testid=clock-pause][data-paused=false]')), pg)
    pg.click('[data-testid=waiting-button]')
    time.sleep(1)
    desk = pg.query_selector('[data-testid=boss-desk]')
    needs = len(pg.query_selector_all('[data-testid=desk-group-needs] [data-testid^=desk-item-]'))
    beat(f'The Desk: {needs} items need you, each with its stakes', bool(desk) and needs > 0, pg)
    handled = pg.query_selector('[data-testid=desk-group-handled]')
    beat('Handled for you: who, what, which day, with Take it back', bool(handled) and bool(pg.query_selector('[data-testid=desk-take-back]')), pg)
    face = pg.query_selector('[data-testid=rise-column] button:has-text(":")') or pg.query_selector('[data-testid=tree-node]')
    pg.click('[data-testid=rise-open]')
    time.sleep(1)
    beat('The Rise: the ladder and the capos', bool(pg.query_selector('[data-testid=rise-ladder]')) and bool(pg.query_selector('[data-testid=rise-capo]')), pg)
    node = pg.query_selector('[data-testid=rise-capo] [data-testid=rise-node] button')
    if node:
        node.click()
        time.sleep(1)
    beat('A face opens the man (his sheet: Crew, growth)', bool(pg.query_selector('[data-testid=sheet-xp]') or pg.query_selector('[role=dialog]')), pg)
    pg.keyboard.press('Escape')
    time.sleep(0.5)
    clear(pg, 8)
    pg.click('[data-testid=advance-week]', force=True)
    time.sleep(1)
    ready = pg.query_selector('[data-testid=ready-advance]')
    if ready:
        ready.click(force=True)
    time.sleep(4)
    clear(pg, 6)
    beat('The week turned (week 2)', 'Wk 2' in pg.inner_text('[data-testid=topbar]') if pg.query_selector('[data-testid=topbar]') else False, pg)
    b.close()

miss = [x for x in beats if not x[1]]
print(f'{len(beats) - len(miss)}/{len(beats)} beats, {beats[-1][2] if beats else 0}s')
