import { chromium } from 'playwright';
const b = await chromium.launch();
for (const width of [390, 768, 900, 1024]) {
 for (const origin of ['https://kristenpardue.com', 'http://127.0.0.1:4331']) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/blog/', { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(3000);
  console.log('=====', width, origin);
  console.log(JSON.stringify(await p.evaluate(() => {
    const nav = document.querySelector('nav.elementor-nav-menu--dropdown');
    const widget = nav?.closest('[data-widget_type="nav-menu.default"]');
    const box = nav?.getBoundingClientRect();
    const wbox = widget?.getBoundingClientRect();
    return {
      navStyle: nav?.getAttribute('style'),
      navBox: box && [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
      widgetBox: wbox && [Math.round(wbox.x), Math.round(wbox.y), Math.round(wbox.width), Math.round(wbox.height)],
      widgetPad: widget && getComputedStyle(widget).padding,
      containerLeft: widget && Math.round(widget.parentElement.getBoundingClientRect().left),
      clientWidth: document.documentElement.clientWidth,
      toggle: (() => { const t = widget.querySelector('.elementor-menu-toggle'); const r = t.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
      offsetParent: nav.offsetParent && nav.offsetParent.className.slice(0, 80),
      offsetParentBox: nav.offsetParent && (() => { const r = nav.offsetParent.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; })(),
      widgetContainerBox: (() => { const c = widget.querySelector('.elementor-widget-container'); if (!c) return null; const r = c.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
      colPad: getComputedStyle(widget.parentElement).padding,
      colBox: (() => { const r = widget.parentElement.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)]; })(),
    };
  }), null, 1));
  await ctx.close();
 }
}
await b.close();
