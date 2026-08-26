import { chromium } from 'playwright';
const b = await chromium.launch();
for (const origin of ['https://kristenpardue.com', 'http://127.0.0.1:4331']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/consulting/', { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  console.log('=====', origin, JSON.stringify(await p.evaluate(() => {
    const el = document.querySelector('[data-id="af6ea7a"]');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { cls: el.className, opacity: cs.opacity, transform: cs.transform,
      animation: cs.animationName, y: Math.round(r.y + scrollY), h: Math.round(r.height) };
  })));
  await ctx.close();
}
await b.close();
