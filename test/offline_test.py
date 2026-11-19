import asyncio, json
from playwright.async_api import async_playwright
BASE='http://localhost:8765/whats-written-library/offline/'
MOCK = """window.__calls=0; const W=['WHY IS FLEXIBILITY EXPENSIVE','- Machinery needs','to be flexible','- More raw materials','in','smaller','quantities','- More','different','tolents','or','better','skilled','talents','x','y','z','q'];
window.__mockReader = async (img, opts) => { const i = window.__calls++; await new Promise(r=>setTimeout(r,15)); return [{generated_text: W[i] || 'word'}]; };"""
R=[]
def check(n,c,d=''): R.append((n,bool(c),str(d)))
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    ctx=await b.new_context(viewport={'width':390,'height':844}, accept_downloads=True); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.add_init_script(MOCK)
    await pg.goto(BASE+'#demo-debug')
    await pg.wait_for_function("document.getElementById('capBtn').textContent.includes('Capture') && window.__calls>0", timeout=30000)
    await pg.wait_for_timeout(300)
    n = await pg.evaluate('window.__calls'); pieces = await pg.locator('#pieces canvas').count()
    check('O01 demo slide: handwriting pieces found and all read', n == pieces and n >= 10, (n, pieces))
    dims = await pg.evaluate("(async()=>{const i=document.getElementById('result'); await i.decode(); return [i.naturalWidth, getComputedStyle(i).display]})()")
    check('O02 result image rendered', dims[0]==1200 and dims[1]=='block', dims)
    check('O03 no sign-in, no Claude needed', await pg.locator('#signin').count()==0)
    async with pg.expect_download() as dl: await pg.click('#dlBtn')
    d = await dl.value
    check('O04 Download saves a PNG named after the title', d.suggested_filename=='whats-written-why-is-flexibility-expensive.png', d.suggested_filename)
    await pg.locator('#result').screenshot(path='/home/claude/offtest/offline_result.png')
    check('O05 no JS errors', not errs, errs)
    # blank image -> no writing
    await pg.evaluate("window.__calls=0")
    await pg.set_input_files('#camInput', '/home/claude/regress/big.jpg'); await pg.wait_for_timeout(1500)
    check('O06 blank photo -> "No writing found", nothing read', 'No writing found' in await pg.text_content('#capBtn') and await pg.evaluate('window.__calls')==0, await pg.text_content('#capBtn'))
    await pg.set_input_files('#camInput', '/home/claude/regress/notimage.jpg'); await pg.wait_for_timeout(800)
    check("O07 broken file -> Can't read photo", "Can't read photo" in await pg.text_content('#capBtn'))
    await ctx.close()
    # without the stand-in: model host unreachable here -> graceful error
    ctx=await b.new_context(viewport={'width':390,'height':844}); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(BASE+'#demo'); await pg.wait_for_function("document.getElementById('capBtn').classList.contains('err')", timeout=60000)
    check('O08 model unreachable -> "No internet for first load"', 'No internet' in await pg.text_content('#capBtn'), await pg.text_content('#capBtn'))
    await pg.wait_for_timeout(3800)
    check('O09 recovers to Capture', 'Capture' in await pg.text_content('#capBtn') and not errs, errs)
    await ctx.close(); await b.close()
  for n,ok,d in R: print(('PASS ' if ok else 'FAIL ')+n+('' if ok else f'  -> {d}'))
  print(f"{sum(r[1] for r in R)}/{len(R)} passed")
asyncio.run(main())
