// Read the live site's post-init DOM. Elementor's JS mutates markup after load
// (swiper wrappers, smartmenus classes, background <video> injection); the clone has
// to reproduce that DOM contract, not just the behaviour (playbook §3.12, §7.3).
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = ROOT + '_extract/live-dom/';
await mkdir(OUT, { recursive: true });

const targets = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Videos keep networkidle from settling and add nothing to the DOM contract.
await ctx.route('**/*.{mp4,mov,webm}', (r) => r.abort());

for (const t of targets) {
  const page = await ctx.newPage();
  await page.goto(`https://kristenpardue.com${t}`, { waitUntil: 'load', timeout: 90000 });
  // Long enough for Elementor's page-load popup (1s delay), the entrance-animation
  // observer and both carousels' first autoplay tick to have happened.
  await page.waitForTimeout(6000);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const name = (t.replace(/^\/|\/$/g, '') || 'index').replace(/\//g, '__');
  await writeFile(OUT + name + '.html', html);
  console.log(name, html.length);
  // The handful of contracts the clone has to match exactly, printed rather than
  // buried in the dump: what Elementor added to <body>, whether a popup is in the
  // document before it opens, and how the sticky header pins itself.
  const contracts = await page.evaluate(() => ({
    bodyClass: document.body.className,
    deviceMode: document.body.getAttribute('data-elementor-device-mode'),
    popupsInDom: document.querySelectorAll('[data-elementor-type="popup"]').length,
    openDialogs: [...document.querySelectorAll('.elementor-popup-modal')].map((e) => e.id),
    dialogWrapper: document.querySelector('.elementor-popup-modal')?.outerHTML.slice(0, 700) ?? null,
    stickyActive: [...document.querySelectorAll('.elementor-sticky')].map((e) => e.className + ' | ' + (e.getAttribute('style') ?? '')),
    stickySpacers: document.querySelectorAll('.elementor-sticky__spacer').length,
    postsContainers: [...document.querySelectorAll('.elementor-posts-container')].map((e) => e.className),
    swipers: [...document.querySelectorAll('.swiper, .swiper-container')].map((e) => e.className),
    swiperWrapperStyle: document.querySelector('.swiper-wrapper')?.getAttribute('style') ?? null,
    firstSlideStyle: document.querySelector('.swiper-slide')?.getAttribute('style') ?? null,
    trailing: [...document.body.children].slice(-3).map((e) => `${e.tagName}#${e.id}.${e.className}`),
    searchContainer: document.querySelector('.elementor-search-form__container')?.className ?? null,
    toggles: [...document.querySelectorAll('.elementor-tab-title')].slice(0, 3).map((e) => e.className + ' ' + e.getAttribute('aria-expanded')),
    togglePanels: [...document.querySelectorAll('.elementor-tab-content')].slice(0, 3).map((e) => (e.getAttribute('style') ?? '') + ' | ' + getComputedStyle(e).display),
    countdown: [...document.querySelectorAll('.uael-countdown-wrapper')].map((e) => e.className + ' | ' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)),
  }));
  console.log(JSON.stringify(contracts, null, 1));
  await page.close();
}
await browser.close();
