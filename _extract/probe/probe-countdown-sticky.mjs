import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.bringToFront();
p.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR', m.text().slice(0, 200)); });
await p.goto('https://kristenpardue.com/foundations/', { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(12000);
console.log(JSON.stringify(await p.evaluate(() => {
  const cd = document.querySelector('.uael-countdown-wrapper');
  const widget = cd?.closest('.elementor-widget');
  return {
    deviceModeSpan: !!document.getElementById('elementor-device-mode'),
    fontSvg: !!document.querySelector('svg.e-font-icon-svg-symbols'),
    popupModal: document.querySelectorAll('.elementor-popup-modal').length,
    cookies: document.cookie,
    storage: Object.keys(localStorage),
    cdHtml: cd?.outerHTML.slice(0, 600) ?? null,
    cdDisplay: cd && getComputedStyle(cd).display,
    widgetDisplay: widget && getComputedStyle(widget).display,
    widgetRect: widget && JSON.stringify(widget.getBoundingClientRect().toJSON()),
    stickySettings: document.querySelector('.header-mainmenu')?.getAttribute('data-settings') ?? null,
    stickyNaturalTop: (() => { const s = document.querySelector('.elementor-sticky__spacer'); return s ? s.getBoundingClientRect().top + scrollY : null; })(),
    scrollY: window.scrollY,
  };
}), null, 1));
await b.close();
