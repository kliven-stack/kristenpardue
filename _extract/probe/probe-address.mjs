import { chromium } from 'playwright';
const b = await chromium.launch();
for (const origin of ['https://kristenpardue.com', 'http://127.0.0.1:4331']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/patient-wellness-intake/', { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(3500);
  console.log('=====', origin, JSON.stringify(await p.evaluate(() => {
    const li = [...document.querySelectorAll('li.gfield')].find((n) => /Mailing Address/.test(n.textContent));
    if (!li) return null;
    return {
      h: Math.round(li.getBoundingClientRect().height),
      children: [...li.querySelectorAll('*')].filter((n) => n.getBoundingClientRect().height > 0)
        .slice(0, 24).map((n) => `${n.tagName}.${(n.className || '').toString().slice(0, 42)} h=${Math.round(n.getBoundingClientRect().height)} d=${getComputedStyle(n).display} m=${getComputedStyle(n).margin}`),
    };
  }), null, 1));
  await ctx.close();
}
await b.close();
