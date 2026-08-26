/**
 * Functional tests against the built clone (playbook §2: "plus functional tests").
 *
 * Everything the replaced WordPress JS used to do is exercised here — the parts a
 * computed-style diff cannot see. Build and serve first:
 *
 *   npm run build && npm run serve      # then, in another shell:
 *   npm run functional
 *
 * The form tests assert what the clone ships: every form exactly as WordPress
 * serves it, third-party embeds complete with the loader that sizes them.
 */
import { chromium } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = path.join(ROOT, 'dist');
// 127.0.0.1, not `localhost`: see the note in scripts/compare.mjs.
const ORIGIN = process.env.CLONE_ORIGIN || 'http://127.0.0.1:4331';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? ' ok ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/**
 * Opens a page with the third-party form hosts blocked — they are not under test,
 * and both reset headless traffic at random from some networks.
 *
 * `popup` says what to do about Elementor popup 2995, which opens one second after
 * load on every page and covers the viewport: `dismiss` (the default) closes it and
 * leaves the page usable, `keep` leaves it alone for the popup tests themselves.
 */
const open = async (target, { width = 1440, height = 900, popup = 'dismiss' } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**://verified.trustymail.co/**', (r) => r.abort());
  await ctx.route('**://*.leadconnectorhq.com/**', (r) => r.abort());
  await ctx.route('**://*.activehosted.com/**', (r) => r.abort());
  await ctx.route('**://challenges.cloudflare.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await page.bringToFront();
  await page.goto(ORIGIN + target, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(1600);
  if (popup === 'dismiss') {
    await page.evaluate(() => {
      for (const modal of document.querySelectorAll('.elementor-popup-modal')) modal.remove();
      document.body.classList.remove('dialog-body', 'dialog-lightbox-body', 'dialog-container', 'dialog-lightbox-container');
    });
  }
  return { ctx, page, errors };
};

const HEADER = 'header.elementor-location-header';

/* ------------------------------------------------------------------ sticky */
{
  const { ctx, page } = await open('/');
  const state = () => page.evaluate(() => {
    const el = document.querySelector('[data-id="094c80e"]:not(.elementor-sticky__spacer)');
    return {
      active: el.classList.contains('elementor-sticky--active'),
      effects: el.classList.contains('elementor-sticky--effects'),
      style: el.getAttribute('style'),
      spacers: document.querySelectorAll('.elementor-sticky__spacer').length,
      y: Math.round(el.getBoundingClientRect().y),
    };
  });

  // Unlike the sibling sites, this header's sticky row is the first thing in the
  // document, so it is pinned from the first paint — which is what the live DOM
  // shows at scrollY 0 too.
  const top = await state();
  check('sticky: the menu row is pinned from the first paint',
    top.active && top.spacers === 1 && top.y === 0 && /position: fixed/.test(top.style || ''),
    JSON.stringify(top));
  check('sticky: --effects is set while pinned (effects offset is 0)', top.effects);

  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(400);
  const down = await state();
  check('sticky: it stays pinned and keeps exactly one spacer once scrolled',
    down.active && down.spacers === 1 && down.y === 0, JSON.stringify(down));
  await ctx.close();
}

/* -------------------------------------------------------------- desktop nav */
{
  const { ctx, page } = await open('/');
  const items = await page.$$eval(`${HEADER} .elementor-nav-menu--main > ul > li > a.elementor-item`,
    (els) => els.map((a) => a.textContent.trim()));
  check('nav: desktop menu renders its top-level items', items.length >= 5, items.join(' | '));

  const annotated = await page.$eval(`${HEADER} .elementor-nav-menu--main li.menu-item-has-children > a`,
    (a) => ({ hasSubmenu: a.classList.contains('has-submenu'), pop: a.getAttribute('aria-haspopup'),
      controls: !!a.getAttribute('aria-controls'), expanded: a.getAttribute('aria-expanded') }));
  check('nav: SmartMenus annotations are reproduced on parent items',
    annotated.hasSubmenu && annotated.pop === 'true' && annotated.controls && annotated.expanded === 'false',
    JSON.stringify(annotated));

  const sub = () => page.$eval(`${HEADER} .elementor-nav-menu--main li.menu-item-has-children ul.sub-menu`,
    (el) => ({ display: getComputedStyle(el).display }));

  const box = await page.locator(`${HEADER} .elementor-nav-menu--main li.menu-item-has-children > a`).first().boundingBox();
  await page.mouse.move(box.x - 60, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.waitForTimeout(120);
  check('nav: sub-menu does not open before SmartMenus\' 250ms show delay',
    (await sub()).display === 'none');
  await page.waitForTimeout(500);
  check('nav: sub-menu opens on hover', (await sub()).display === 'block');

  // Playbook §3.11: the pointer must survive the crossing from the parent item
  // into the sub-menu. Walk the real path — parent → gap → first sub-item.
  const geo = await page.evaluate((header) => {
    const li = document.querySelector(`${header} .elementor-nav-menu--main li.menu-item-has-children`);
    const s = li.querySelector('ul.sub-menu').getBoundingClientRect();
    const p = li.getBoundingClientRect();
    const a = li.querySelector('ul.sub-menu a').getBoundingClientRect();
    return { gapY: p.bottom + Math.max(0.5, (s.top - p.bottom) / 2), midX: s.left + s.width / 2,
      itemX: a.left + a.width / 2, itemY: a.top + a.height / 2 };
  }, HEADER);
  await page.mouse.move(geo.midX, geo.gapY, { steps: 4 });
  await page.waitForTimeout(150);
  check('nav: sub-menu stays open while the pointer crosses the gap (playbook 3.11)',
    (await sub()).display === 'block');
  await page.mouse.move(geo.itemX, geo.itemY, { steps: 4 });
  await page.waitForTimeout(250);
  check('nav: sub-menu is still open once the pointer reaches an item',
    (await sub()).display === 'block');

  await page.mouse.move(geo.itemX, geo.itemY + 500, { steps: 8 });
  await page.waitForTimeout(200);
  check('nav: sub-menu is still open 200ms after leaving (500ms hide delay)',
    (await sub()).display === 'block');
  await page.waitForTimeout(700);
  check('nav: sub-menu closes after the hide delay', (await sub()).display === 'none');
  await ctx.close();
}

/* --------------------------------------------------------------- mobile nav */
for (const width of [900, 390]) {
  const { ctx, page } = await open('/', { width });
  const toggle = page.locator(`${HEADER} .elementor-menu-toggle`).first();
  check(`nav @${width}: burger is visible`, await toggle.isVisible());
  check(`nav @${width}: horizontal menu is hidden`,
    !(await page.locator(`${HEADER} .elementor-nav-menu--main`).first().isVisible()));

  const panel = () => page.$eval('nav.elementor-nav-menu--dropdown', (el) => ({
    hidden: el.getAttribute('aria-hidden'),
    x: Math.round(el.getBoundingClientRect().x),
    top: el.style.top,
  }));
  // Faithfully 10px off the viewport's left edge above 767px, and flush at 390 —
  // Elementor anchors the stretched panel to the burger, which sits 10px inside the
  // widget at tablet widths. Production does exactly this; see the README.
  const expectedX = width >= 768 ? -10 : 0;
  const shut = await panel();
  check(`nav @${width}: panel is stretched to production's offset (x=${expectedX})`,
    shut.x === expectedX && shut.top === '45px', JSON.stringify(shut));

  await toggle.click();
  await page.waitForTimeout(400);
  check(`nav @${width}: burger opens the panel`,
    (await panel()).hidden === 'false' && await toggle.evaluate((el) => el.classList.contains('elementor-active')));

  // Collapsible mode: tapping a parent expands it rather than navigating.
  const before = page.url();
  await page.locator('nav.elementor-nav-menu--dropdown li.menu-item-has-children > a').first().click();
  await page.waitForTimeout(400);
  check(`nav @${width}: tapping a parent expands it instead of navigating`,
    page.url() === before
    && await page.$eval('nav.elementor-nav-menu--dropdown li.menu-item-has-children ul.sub-menu',
      (el) => getComputedStyle(el).display === 'block'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`nav @${width}: Escape closes the panel`, (await panel()).hidden === 'true');
  await ctx.close();
}

/* ------------------------------------------------------------- search form */
{
  const { ctx, page } = await open('/');
  const state = () => page.$eval('.elementor-search-form__container', (el) => ({
    open: el.classList.contains('elementor-search-form--full-screen'),
    scale: getComputedStyle(el).transform,
  }));
  check('search: the overlay starts closed', !(await state()).open);
  await page.locator(`${HEADER} .elementor-search-form__toggle`).first().click();
  await page.waitForTimeout(400);
  const open1 = await state();
  check('search: the magnifier opens the full-screen overlay', open1.open, JSON.stringify(open1));
  check('search: the input takes focus',
    await page.evaluate(() => document.activeElement?.classList.contains('elementor-search-form__input')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('search: Escape closes it', !(await state()).open);
  await ctx.close();
}

/* ---------------------------------------------------------------- carousels */
{
  const { ctx, page, errors } = await open('/');
  await page.evaluate(() => document.querySelector('.elementor-widget-testimonial-carousel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);

  const t = await page.evaluate(() => {
    const c = document.querySelector('.elementor-widget-testimonial-carousel .elementor-main-swiper');
    const w = c.querySelector('.swiper-wrapper');
    return {
      init: c.classList.contains('swiper-initialized'),
      backface: c.classList.contains('swiper-backface-hidden'),
      slides: c.querySelectorAll('.swiper-slide').length,
      dupes: c.querySelectorAll('.swiper-slide-duplicate').length,
      active: !!c.querySelector('.swiper-slide-active'),
      transform: w.style.transform,
      bullets: c.closest('.elementor-widget').querySelectorAll('.swiper-pagination-bullet').length,
      slideW: c.querySelector('.swiper-slide')?.style.width,
    };
  });
  // Three testimonials, one up, looping: 3 + 1 clone each side = 5, and under
  // Swiper's 10-slide backface threshold.
  check('carousel: the home testimonial carousel matches production\'s slide set',
    t.init && t.slides === 5 && t.dupes === 2 && t.backface && t.active && /translate3d/.test(t.transform),
    JSON.stringify(t));
  check('carousel: it paints one bullet per slide', t.bullets === 3, String(t.bullets));

  await page.evaluate(() => {
    const c = document.querySelector('.elementor-widget-testimonial-carousel .elementor-main-swiper');
    c.eCarousel.slideBy(1);
  });
  await page.waitForTimeout(1800);
  const advanced = await page.$eval('.elementor-widget-testimonial-carousel .swiper-pagination-bullet-active',
    (el) => el.getAttribute('aria-label'));
  check('carousel: advancing moves the active bullet', advanced === 'Go to slide 2', advanced);
  check('home page raises no script errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await open('/faq/');
  await page.evaluate(() => document.querySelector('.elementor-widget-media-carousel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const c = document.querySelector('.elementor-widget-media-carousel .elementor-main-swiper');
    return {
      slides: c.querySelectorAll('.swiper-slide').length,
      width: c.querySelector('.swiper-slide').style.width,
      container: Math.round(c.clientWidth),
      backface: c.classList.contains('swiper-backface-hidden'),
    };
  });
  // Five slides, three up, looping: 5 + 3 each side = 11, each a third of the
  // container with no gap (space_between is 0 at desktop on this widget).
  check('carousel: /faq/ media carousel is three-up with production\'s loop count',
    m.slides === 11 && !m.backface && Math.abs(parseFloat(m.width) - m.container / 3) < 1, JSON.stringify(m));
  await ctx.close();
}
{
  const { ctx, page } = await open('/about/');
  await page.evaluate(() => document.querySelector('.elementor-widget-media-carousel')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => {
    const w = document.querySelector('.elementor-widget-media-carousel');
    const [stage, strip] = w.querySelectorAll('.elementor-main-swiper');
    return {
      stageSlides: stage.querySelectorAll('.swiper-slide').length,
      stripSlides: strip.querySelectorAll('.swiper-slide').length,
      strip: strip.classList.contains('elementor-thumbnails-swiper'),
      stageWidth: stage.querySelector('.swiper-slide').style.width,
      stageContainer: Math.round(stage.clientWidth),
      active: stage.querySelector('.swiper-slide-active')?.dataset.swiperSlideIndex,
    };
  });
  check('carousel: the slideshow skin builds both swipers with production\'s 15 slides',
    s.strip && s.stageSlides === 15 && s.stripSlides === 15
    && Math.abs(parseFloat(s.stageWidth) - s.stageContainer) < 1, JSON.stringify(s));

  await page.locator('.elementor-thumbnails-swiper .swiper-slide').nth(7).click();
  await page.waitForTimeout(900);
  const after = await page.$eval('.elementor-widget-media-carousel .elementor-main-swiper .swiper-slide-active',
    (el) => el.dataset.swiperSlideIndex);
  check('carousel: clicking a thumbnail moves the stage', after !== s.active, `${s.active} → ${after}`);
  await ctx.close();
}

/* ------------------------------------------------------------------ toggle */
{
  const { ctx, page } = await open('/faq/');
  await page.evaluate(() => document.querySelector('.elementor-widget-toggle')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  const read = () => page.$$eval('.elementor-widget-toggle .elementor-tab-title', (ts) => ts.map((t) => ({
    open: t.classList.contains('elementor-active'),
    expanded: t.getAttribute('aria-expanded'),
    shown: getComputedStyle(document.getElementById(t.getAttribute('aria-controls'))).display !== 'none',
  })));
  const start = await read();
  check('toggle: every panel starts closed, as production renders them',
    start.length > 1 && start.every((x) => !x.open && !x.shown && x.expanded === 'false'),
    `${start.length} items`);

  await page.locator('.elementor-widget-toggle .elementor-tab-title').first().click();
  await page.waitForTimeout(400);
  const one = await read();
  check('toggle: clicking a title opens its panel', one[0].open && one[0].shown && one[0].expanded === 'true');

  await page.locator('.elementor-widget-toggle .elementor-tab-title').nth(1).click();
  await page.waitForTimeout(400);
  const two = await read();
  // Elementor's toggle is not an accordion — several panels may be open at once.
  check('toggle: a second panel opens without closing the first',
    two[0].open && two[0].shown && two[1].open && two[1].shown);

  await page.locator('.elementor-widget-toggle .elementor-tab-title').first().click();
  await page.waitForTimeout(400);
  const shut = await read();
  check('toggle: clicking an open title closes it again', !shut[0].open && !shut[0].shown);
  await ctx.close();
}

/* ------------------------------------------------------------------ popups */
{
  // Popup 2995 — page load, one second, at most once per visitor.
  const { ctx, page } = await open('/', { popup: 'keep' });
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.elementor-popup-modal');
    return m && {
      id: m.id,
      classes: m.className,
      aria: m.getAttribute('aria-modal'),
      body: document.body.className.includes('dialog-lightbox-body'),
      content: !!m.querySelector('.dialog-message .elementor-location-popup'),
      closeButton: !!m.querySelector('.dialog-close-button'),
      dialogCss: !!document.querySelector('link[href*="dialog.min.css"]'),
    };
  });
  check('popup: the subscribe popup opens a second after load, in Elementor\'s wrapper',
    modal && modal.id === 'elementor-popup-modal-2995' && modal.aria === 'true'
    && modal.body && modal.content && modal.closeButton && modal.dialogCss,
    JSON.stringify(modal));
  check('popup: the dead "Thank You" popup 3170 is not opened by anything',
    !(await page.$('#elementor-popup-modal-3170')));

  await page.locator('.elementor-popup-modal .dialog-close-button').first().click();
  await page.waitForTimeout(400);
  check('popup: the close button dismisses it and cleans up <body>',
    !(await page.$('.elementor-popup-modal'))
    && !(await page.evaluate(() => document.body.className.includes('dialog-lightbox-body'))));

  // Elementor caps it at one showing per visitor, in localStorage. A second page
  // view in the same context must not re-open it.
  await page.goto(ORIGIN + '/about/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  check('popup: the once-per-visitor cap is honoured on the next page',
    !(await page.$('.elementor-popup-modal')));
  await ctx.close();
}
{
  // Popup 2974 — the only `#elementor-action:` trigger on the site.
  const { ctx, page } = await open('/favorite-products/');
  await page.locator('a[href*="elementor-action"]').first().click();
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const el = document.querySelector('.elementor-popup-modal');
    return el && { id: el.id, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) };
  });
  check('popup: the "Visit Supplement Store" button opens popup 2974',
    m && m.id === 'elementor-popup-modal-2974' && /Register/.test(m.text), JSON.stringify(m));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('popup: Escape dismisses it', !(await page.$('.elementor-popup-modal')));
  await ctx.close();
}

/* --------------------------------------------------------------- countdowns */
{
  const { ctx, page } = await open('/foundations/');
  await page.waitForTimeout(1500);
  const cd = await page.evaluate(() => {
    const w = document.querySelector('.uael-countdown-wrapper');
    return w && { display: w.style.display, flash: w.classList.contains('flash-animation'),
      height: Math.round(w.closest('.elementor-widget').getBoundingClientRect().height) };
  });
  // The due date was 2023-02-28 and `expire-action` is `hide`: production paints
  // nothing here, and so must the clone, or the page runs long by the timer's height.
  check('countdown: the expired timer on /foundations/ is hidden, as production hides it',
    cd && cd.display === 'none' && cd.flash && cd.height === 0, JSON.stringify(cd));
  await ctx.close();
}
{
  // The evergreen timer this used to exercise was on /foundations-old/, which is now
  // retired (see the README). No page in the build carries one any more, so the
  // assertion is that the *only* countdown left is the expired fixed one above —
  // if a re-extract ever brings an evergreen timer back, this fails and the branch
  // in initCountdown() gets its coverage back with it.
  const { ctx, page } = await open('/foundations/');
  const kinds = await page.$$eval('.uael-countdown-wrapper', (els) => els.map((e) => e.dataset.countdownType));
  check('countdown: no evergreen timer remains in the build',
    kinds.length > 0 && kinds.every((k) => k === 'fixed'), JSON.stringify(kinds));
  await ctx.close();
}

/* -------------------------------------------------------------- posts grids */
{
  const { ctx, page } = await open('/blog/');
  const grid = await page.evaluate(() => {
    const c = document.querySelector('.elementor-posts-container');
    const thumbs = [...document.querySelectorAll('.elementor-post__thumbnail')];
    return {
      ratio: c.classList.contains('elementor-has-item-ratio'),
      cards: c.querySelectorAll('.elementor-post').length,
      fitHeight: thumbs.filter((t) => t.classList.contains('elementor-fit-height')).length,
      heights: [...new Set(thumbs.map((t) => Math.round(t.getBoundingClientRect().height)))],
    };
  });
  // The ratio class is what gives every thumbnail the same box; without it the
  // cards take their images' natural heights and the listing runs long.
  check('posts: the grid carries elementor-has-item-ratio and boxes every thumbnail',
    grid.ratio && grid.cards > 1 && grid.heights.length === 1, JSON.stringify(grid));

  const pagination = await page.$$eval('.elementor-pagination a.page-numbers', (as) => as.map((a) => a.getAttribute('href')));
  check('posts: pagination links the built /blog/N/ pages',
    pagination.includes('/blog/2/') && pagination.includes('/blog/10/'), pagination.join(' '));
  await ctx.close();
}

/* ------------------------------------------------------------------- forms */
{
  // Every form ships as WordPress serves it. For the third-party embeds that means
  // the iframe *and* its `form_embed.js` loader — the loader is what receives the
  // rendered height from inside the frame and sizes the iframe to it, so an embed
  // without it renders the form cut off at whatever fixed height the markup gives.
  const { ctx, page } = await open('/contact-me/');
  check('form: /contact-me/ ships the ActiveCampaign embed',
    (await page.$$('._form_5')).length === 1);
  check('form: its loader ships with it',
    (await page.$$('script[src*="activehosted.com"]')).length >= 1);
  await ctx.close();

  const sub = await open('/', { popup: 'keep' });
  const embed = await sub.page.evaluate(() => {
    const frame = document.querySelector('.elementor-popup-modal iframe[src*="FMxAdmW9fwWIvqjnE8bk"]');
    return frame && {
      src: frame.getAttribute('src'),
      loader: !!document.querySelector('.elementor-popup-modal script[src*="form_embed.js"]')
        || !!document.querySelector('script[src*="form_embed.js"]'),
    };
  });
  check('form: the subscribe popup ships the LeadConnector iframe and its loader',
    embed && /verified\.trustymail\.co/.test(embed.src) && embed.loader, JSON.stringify(embed));
  await sub.ctx.close();

  const gf = await open('/foundations-health-program-registration/');
  const action = await gf.page.$eval('form[id^="gform_"]', (f) => f.getAttribute('action'));
  const fields = await gf.page.$$eval('.gform_wrapper .gfield', (els) => els.length);
  check('form: the Gravity Forms markup is cloned exactly, and still posts where WordPress did',
    action === '/foundations-health-program-registration/' && fields > 5,
    `${action} — ${fields} fields`);
  await gf.ctx.close();

  const intake = await open('/patient-wellness-intake/');
  const revealed = await intake.page.evaluate(() => {
    const w = document.getElementById('gform_wrapper_4');
    return { display: getComputedStyle(w).display, height: Math.round(w.getBoundingClientRect().height),
      hidden: document.getElementById('field_4_150')?.style.display };
  });
  check('form: the AJAX wrapper is revealed and its conditional field starts hidden',
    revealed.display === 'block' && revealed.height > 1000 && revealed.hidden === 'none',
    JSON.stringify(revealed));

  // …and appears when the select it depends on is set to "Other".
  await intake.page.selectOption('#input_4_149', 'Other');
  await intake.page.waitForTimeout(300);
  const shown = await intake.page.evaluate(() => {
    const li = document.getElementById('field_4_150');
    return { display: getComputedStyle(li).display, disabled: li.querySelector('input').disabled };
  });
  check('form: choosing "Other" reveals the conditional field and enables it',
    shown.display !== 'none' && shown.disabled === false, JSON.stringify(shown));
  await intake.ctx.close();
}

/* --------------------------------------------------------- third-party JS */
{
  // The ThriveCart loader on /gi-mapping/ is written `//tinder.thrivecart.com/...`.
  // A protocol-relative third-party URL is easy to mistake for a same-origin
  // WordPress bundle and drop — the extract step did exactly that once — and the
  // symptom is quiet: the button keeps its markup and loses the stylesheet the
  // loader injects, rendering as an unstyled inline link 5px shorter than
  // production's. `npm run compare` blocks the host on both sides for determinism,
  // so this is where it is checked.
  const { ctx, page } = await open('/gi-mapping/');
  check('third-party: the ThriveCart loader ships with the buttons it styles',
    (await page.$$('script[src*="thrivecart.com"]')).length >= 1);

  let styled = null;
  for (let i = 0; i < 40 && !styled; i++) {
    styled = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.thrivecart-button')]
        .find((n) => getComputedStyle(n).display !== 'none');
      const cs = el && getComputedStyle(el);
      return cs && cs.display === 'inline-block'
        ? { display: cs.display, font: cs.fontFamily.split(',')[0], h: Math.round(el.getBoundingClientRect().height) }
        : null;
    });
    if (!styled) await page.waitForTimeout(250);
  }
  // Production renders this button 47px tall in the system stack; unstyled it is
  // 42px in the page's own Noto Sans.
  check('third-party: it styles the button the way production does',
    styled && styled.h === 47 && /apple-system/.test(styled.font), JSON.stringify(styled));
  await ctx.close();
}

/* --------------------------------------------------- links, assets, routing */
{
  // Playbook §1: a URL that resolves on WordPress and 404s here is a regression.
  const files = new Set();
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.add('/' + path.relative(DIST, full).split(path.sep).join('/'));
    }
  };
  await walk(DIST);
  const built = new Set([...files].filter((f) => f.endsWith('/index.html')).map((f) => f.replace(/index\.html$/, '')));

  const redirects = new Set(JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'))
    .redirects.map((r) => r.source.replace(/\/:.*$/, '')));

  // Broken on WordPress too, and cloned as-is; see scripts/audit.mjs for the
  // verification and the README for what each one is.
  const KNOWN_BROKEN = new Set([
    '/essential-oils/page/2/', '/essential-oils/page/3/', '/essential-oils/page/4/',
    '/my-story/my-story-of-healing-revised/',
    '/www.pbs.org/pov/foodinc/',
  ]);

  const { ctx, page } = await open('/');
  const bad = [];
  for (const p of built) {
    const links = await page.evaluate(async (target) => {
      const res = await fetch(target);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    }, p);
    for (const href of links) {
      if (!href || /^(https?:|mailto:|tel:|#|javascript:|about:)/.test(href)) continue;
      const clean = href.split('#')[0].split('?')[0];
      if (!clean.startsWith('/')) continue;
      if (/\.(png|jpe?g|webp|gif|svg|pdf|css|js|ico|xml)$/i.test(clean)) continue;
      const withSlash = clean.endsWith('/') ? clean : clean + '/';
      if (KNOWN_BROKEN.has(withSlash)) continue;
      if (built.has(withSlash) || files.has(clean)) continue;
      if (redirects.has(clean) || redirects.has(clean.replace(/\/$/, ''))) continue;
      bad.push(`${p} → ${href}`);
    }
  }
  const unique = [...new Set(bad)];
  check('links: every internal link resolves to a built page or a redirect',
    unique.length === 0, unique.slice(0, 8).join(' | ') || `${built.size} pages swept`);
  await ctx.close();
}
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const hit = async (from) => {
    const res = await page.goto(ORIGIN + from, { waitUntil: 'domcontentloaded' });
    return { status: res.status(), url: new URL(page.url()).pathname };
  };
  const legacy = await hit('/healthy-diet/kale-breakfast-smoothie/');
  check('routing: the old category permalinks redirect where WordPress redirects them',
    legacy.url === '/recipes/kale-breakfast-smoothie/', JSON.stringify(legacy));
  const paged = await hit('/blog/page/2/');
  check('routing: /blog/page/2/ lands on the blog\'s second page',
    paged.url === '/blog/2/', JSON.stringify(paged));
  const nf = await page.goto(ORIGIN + '/no-such-page-here/', { waitUntil: 'domcontentloaded' });
  check('routing: an unknown URL serves the site\'s own 404 template',
    nf.status() === 404 && /Page not found|not be found|404/i.test(await page.content()), await page.title());
  await ctx.close();
}
{
  const { ctx, page } = await open('/');
  const broken = await page.evaluate(() => [...document.images]
    .filter((img) => { const r = img.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .filter((img) => img.complete && img.naturalWidth === 0)
    .map((img) => img.currentSrc || img.src));
  // Playbook §3.10: assert on visible images only — offscreen carousel clones
  // legitimately never load.
  check('assets: every visible image on the home page decodes', broken.length === 0, broken.slice(0, 4).join(' | '));

  const fonts = await page.evaluate(() => [...document.fonts]
    .filter((f) => f.status === 'loaded')
    .map((f) => f.family));
  check('assets: the self-hosted Montserrat and Raleway faces load',
    fonts.includes('Montserrat') && fonts.includes('Raleway'), [...new Set(fonts)].join(', '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('\nfailures:');
  for (const f of failed) console.log(`  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
}
