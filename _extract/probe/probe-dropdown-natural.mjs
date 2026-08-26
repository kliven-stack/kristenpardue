import { chromium } from 'playwright';
const b = await chromium.launch();
for (const width of [390, 768, 900, 1024]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto('http://127.0.0.1:4331/blog/', { waitUntil: 'load', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1500);
  console.log(width, JSON.stringify(await p.evaluate(() => {
    const nav = document.querySelector('nav.elementor-nav-menu--dropdown');
    nav.removeAttribute('style');
    void nav.offsetWidth;
    const natural = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const toggle = nav.closest('[data-widget_type]').querySelector('.elementor-menu-toggle').getBoundingClientRect();
    return {
      naturalLeft: Math.round(natural.left * 1000) / 1000,
      naturalTop: Math.round(natural.top * 1000) / 1000,
      cssLeft: cs.left, cssTop: cs.top, cssPosition: cs.position, cssWidth: cs.width,
      toggleLeft: Math.round(toggle.left * 1000) / 1000,
      toggleHeight: Math.round(toggle.height * 1000) / 1000,
    };
  })));
  await ctx.close();
}
await b.close();
