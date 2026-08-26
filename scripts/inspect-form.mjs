// The WordPress pages embed LeadConnector ("Trustymail") form widgets in iframes.
// The widget host resets direct requests intermittently, so read it through the page
// that embeds it — the real field set, labels, rendered height at each breakpoint,
// and the box the surrounding Elementor section gives it (playbook §7.5).
import { chromium } from 'playwright';

const ORIGIN = 'https://kristenpardue.com';
const TARGETS = [
  ['/contact-us/', 1440], ['/contact-us/', 900], ['/contact-us/', 390],
];

const b = await chromium.launch();
for (const [path, width] of TARGETS) {
  const ctx = await b.newContext({ viewport: { width, height: 1200 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(ORIGIN + path, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(3000);

  console.log(`\n===== ${path} @${width}`);
  for (const el of await p.locator('iframe').all()) {
    const src = await el.getAttribute('src');
    const box = await el.boundingBox();
    const wrap = await el.evaluate((n) => {
      const w = n.closest('.elementor-widget-container');
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    console.log(`iframe ${src}`);
    console.log('  box:', box && { w: Math.round(box.width), h: Math.round(box.height) }, ' container:', wrap);
  }
  for (const frame of p.frames()) {
    if (!/trustymail|leadconnector|sybrware/.test(frame.url())) continue;
    try {
      const info = await frame.evaluate(() => ({
        height: document.body.scrollHeight,
        fields: [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => el.type !== 'hidden')
          .map((el) => {
            const c = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || el.id || null,
              placeholder: el.placeholder || null, box: [Math.round(r.width), Math.round(r.height)],
              bg: c.backgroundColor, radius: c.borderRadius, pad: c.padding, font: `${c.fontFamily} ${c.fontSize}` };
          }),
        buttons: [...document.querySelectorAll('button, input[type=submit]')].map((el) => {
          const c = getComputedStyle(el); const r = el.getBoundingClientRect();
          return { text: (el.textContent || el.value || '').trim(), box: [Math.round(r.width), Math.round(r.height)],
            bg: c.backgroundColor, color: c.color, radius: c.borderRadius, font: `${c.fontFamily} ${c.fontSize} ${c.fontWeight}` };
        }).filter((x) => x.text),
      }));
      console.log('  frame:', frame.url());
      console.log('  ', JSON.stringify(info, null, 1).replace(/\n/g, '\n  '));
    } catch (e) { console.log('  frame read failed:', e.message.split('\n')[0]); }
  }
  await ctx.close();
}
await b.close();
