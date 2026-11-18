import asyncio, json, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/whats-written-library/'
R = []
def check(n, c, d=''): R.append((n, bool(c), str(d)))
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for scheme in ['light', 'dark']:
      ctx = await b.new_context(viewport={'width': 390, 'height': 844}, color_scheme=scheme)
      pg = await ctx.new_page(); errs = []
      pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.goto(BASE); await pg.wait_for_selector('.card')
      if scheme == 'light':
        check('S01 library lists the seed slide', 'Why is flexibility expensive?' in await pg.inner_text('#list'))
        check('S02 grouped by lecture and date', 'STRATEGIC ISSUES IN SCM' in (await pg.inner_text('.group')).upper())
        href = await pg.get_attribute('#addBtn', 'href')
        check('S03 "Add a slide" opens the issue form', href.endswith('/issues/new?template=add-slide.yml'), href)
        await pg.fill('#q', 'raw materials'); check('S04 search finds by body text', await pg.locator('#list a.card').count() == 1)
        await pg.fill('#q', 'zzzz'); check('S05 search with no match shows message', 'No slides match' in await pg.inner_text('#list'))
        await pg.fill('#q', '')
        await pg.screenshot(path='/home/claude/whats-written-library/test/shot-library.png')
        await pg.click('a.card'); await pg.wait_for_selector('.note')
        check('S06 slide page shows title + 3 bullets', await pg.locator('.note li').count() == 3 and 'flexibility' in (await pg.inner_text('.note h2')).lower())
        fx = await pg.get_attribute('text=Suggest a fix', 'href')
        check('S07 "Suggest a fix" pre-fills slide ID', 'template=fix-word.yml&note=2026-11-16-why-is-flexibility-expensive' in fx, fx)
        await pg.screenshot(path='/home/claude/whats-written-library/test/shot-slide.png')
        await pg.goto(BASE + '#n-nope'); await pg.wait_for_timeout(300)
        check('S08 unknown slide link handled', 'not found' in await pg.inner_text('#noteView'))
        await pg.goto(BASE + '#dictionary'); await pg.wait_for_timeout(300)
        t = await pg.inner_text('#dict')
        check('S09 dictionary shows fixes and course terms', 'tools' in t and 'talents' in t and 'safety stock' in t)
        await pg.screenshot(path='/home/claude/whats-written-library/test/shot-dictionary.png')
        await pg.go_back(); await pg.go_back(); await pg.wait_for_timeout(300)
      check(f'S10 {scheme}: no sideways scroll, no JS errors', not await pg.evaluate('document.documentElement.scrollWidth > innerWidth') and not errs, errs)
      await ctx.close()

    # hostile / broken data
    import shutil, os
    d = '/tmp/site/whats-written-library/data/'
    shutil.copy(d + 'notes.json', '/tmp/notes.bak')
    json.dump([{"id": "x", "title": "<img src=x onerror=window.__p=1>", "text": "- <script>window.__p=2</script>\n- word [?] ok", "date": "2026-11-18", "lecture": "L", "image": "javascript:alert(1)"}, None, 5, {"id": "y"}], open(d + 'notes.json', 'w'))
    ctx = await b.new_context(); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + '#n-x'); await pg.wait_for_timeout(500)
    check('S11 hostile text shown as text, never run', not await pg.evaluate('window.__p') and await pg.locator('.note img').count() == 0 and not errs, errs)
    check('S12 unsure words highlighted', await pg.locator('.unsure').count() == 1)
    open(d + 'notes.json', 'w').write('{broken')
    await pg.goto(BASE); await pg.wait_for_timeout(500)
    check('S13 broken data file: empty library, no crash', 'No slides yet' in await pg.inner_text('#list') and not errs, errs)
    shutil.copy('/tmp/notes.bak', d + 'notes.json')
    await ctx.close(); await b.close()
  for n, ok, d in R: print(('PASS ' if ok else 'FAIL ') + n + ('' if ok else f'  -> {d}'))
  print(f"{sum(r[1] for r in R)}/{len(R)} passed")
asyncio.run(main())
