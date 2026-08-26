import { chromium } from 'playwright';
const b = await chromium.launch();
for (const origin of ['https://kristenpardue.com', 'http://127.0.0.1:4331']) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/gi-mapping/', { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(2000);
  console.log('=====', origin);
  console.log(JSON.stringify(await p.evaluate(() => {
    const el = [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'GET STARTED');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const matched = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list, media) => {
        for (const rule of list) {
          if (rule.media) { walk(rule.cssRules, rule.media.mediaText); continue; }
          if (!rule.selectorText) continue;
          try { if (!el.matches(rule.selectorText)) continue; } catch { continue; }
          if (!/display|font-family/.test(rule.style.cssText)) continue;
          matched.push({ href: (sheet.href || 'inline').split('/').pop(), media, sel: rule.selectorText.slice(0, 90),
            display: rule.style.display, font: rule.style.fontFamily.slice(0, 60) });
        }
      };
      walk(rules, '');
    }
    return { cls: el.className, parent: el.parentElement.className.slice(0, 90),
      display: cs.display, font: cs.fontFamily.slice(0, 70), matched };
  }), null, 1));
  await ctx.close();
}
await b.close();
