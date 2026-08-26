/**
 * Runtime for the cloned Elementor markup.
 *
 * The pages ship Elementor's compiled CSS verbatim, so the job here is to reproduce
 * the *DOM contract* the WordPress JS created — the classes, inline styles and
 * injected nodes the stylesheets and the layout depend on — not to re-invent the
 * behaviour (playbook §3.12). Every contract below was read off the live site's
 * post-init DOM with the probes in _extract/probe/, then diffed against the served
 * HTML.
 *
 * Replaces: jQuery, elementor-frontend, elementor-pro-frontend, smartmenus,
 * jquery.sticky, Swiper, the Essential Addons frontend bundle, the Ultimate Addons
 * bundle and the Gravity Forms frontend bundle.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const onReady = (fn) =>
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

/** Elementor serialises widget/section options into `data-settings` as JSON. */
const settingsOf = (el) => {
  try { return JSON.parse(el.getAttribute('data-settings') || '{}'); } catch { return {}; }
};

/**
 * Elementor's device mode, from kit 2886's active breakpoints (mobile ≤767, tablet
 * ≤1024, desktop above — the values `elementorFrontend.config.responsive` carries
 * on this site, and the ones the playbook pins the clone's breakpoints to).
 *
 * Note that Swiper does *not* use these; see CAROUSEL_BREAKPOINTS.
 */
const deviceMode = () => {
  const w = window.innerWidth;
  if (w <= 767) return 'mobile';
  if (w <= 1024) return 'tablet';
  return 'desktop';
};

/* ------------------------------------------------------------------ *
 * Environment classes
 *
 * Elementor stamps the browser/OS onto <body> and keeps the current breakpoint
 * there too; its stylesheets key rules off `.e--ua-appleWebkit`, so Safari renders
 * differently without them. Live DOM on this site, in Chrome on macOS:
 *   class="… e--ua-blink e--ua-mac e--ua-webkit" data-elementor-device-mode="desktop"
 * ------------------------------------------------------------------ */
function initEnvironment() {
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const flags = {
    webkit: /AppleWebKit/i.test(ua),
    blink: /Chrome/i.test(ua) && !/Edge/i.test(ua),
    safari: isSafari,
    appleWebkit: isSafari,
    firefox: /Firefox/i.test(ua),
    gecko: /Gecko\//i.test(ua) && /Firefox/i.test(ua),
    edge: /Edg\//i.test(ua),
    mac: /Mac/i.test(navigator.platform || ua),
    windows: /Win/i.test(navigator.platform || ua),
    linux: /Linux/i.test(navigator.platform || ua) && !/Android/i.test(ua),
  };
  for (const [key, on] of Object.entries(flags)) {
    if (on) document.body.classList.add(`e--ua-${key}`);
  }

  const apply = () => document.body.setAttribute('data-elementor-device-mode', deviceMode());
  apply();
  let last = deviceMode();
  window.addEventListener('resize', () => {
    const now = deviceMode();
    if (now === last) return;
    last = now;
    apply();
  });
}

/* ------------------------------------------------------------------ *
 * Background lazy-load
 *
 * Elementor prints an inline observer that blanks `.e-con.e-parent` background
 * images until the container scrolls within 200px of the viewport, then marks it
 * `.e-lazyloaded`. Without this the guard never lifts and those sections lose their
 * backgrounds entirely. Transcribed from the inline script, margin included.
 * ------------------------------------------------------------------ */
function initLazyBackgrounds() {
  const targets = document.querySelectorAll('.e-con.e-parent:not(.e-lazyloaded)');
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('e-lazyloaded');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '200px 0px 200px 0px' });
  targets.forEach((el) => observer.observe(el));
}

/* ------------------------------------------------------------------ *
 * Sticky sections (e-sticky)
 *
 * One element on this site is sticky, and it is on all 177 templated pages: the
 * header's menu row, `.header-mainmenu` (element 094c80e). Its live settings are
 *
 *   {"sticky":"top","sticky_on":["desktop","tablet","mobile"],
 *    "sticky_offset":0,"sticky_effects_offset":0,"sticky_anchor_link_offset":0}
 *
 * and it is the first thing in the document, so it pins from the first paint —
 * `elementor-sticky--active` and `elementor-sticky--effects` are both already on it
 * at scrollY 0 on the live page.
 *
 * Contract, read off the live header:
 *
 *   below the threshold  the element carries `elementor-sticky` and nothing else —
 *                        no inline style, and no spacer in the document at all;
 *   at or past it        it gains `elementor-sticky--active
 *                        elementor-section--handles-inside`, is pinned with inline
 *                        `position: fixed; width: <spacer width>px; margin-top: 0px;
 *                        margin-bottom: 0px; top: <offset>px`, and a
 *                        visibility-hidden clone (`elementor-sticky__spacer`) is
 *                        inserted after it to hold the space;
 *   `--effects`          only while active, and only past `sticky_effects_offset` —
 *                        which is 0 here, so effectively whenever it is pinned.
 * ------------------------------------------------------------------ */
function initSticky() {
  const els = [...document.querySelectorAll('[data-settings]')].filter((el) => {
    const s = settingsOf(el);
    return s.sticky === 'top' || s.sticky === 'bottom';
  });

  for (const el of els) {
    const s = settingsOf(el);
    const on = Array.isArray(s.sticky_on) ? s.sticky_on : ['desktop', 'tablet', 'mobile'];
    const effectsOffset = Number(s.sticky_effects_offset) || 0;
    const offset = Number(s.sticky_offset) || 0;
    const bottom = s.sticky === 'bottom';

    el.classList.add('elementor-sticky');

    let spacer = null;
    /** Where the element sits in normal flow, measured while it is unpinned. */
    let naturalTop = el.getBoundingClientRect().top + window.scrollY;

    const unpin = () => {
      if (!spacer) return;
      naturalTop = spacer.getBoundingClientRect().top + window.scrollY;
      spacer.remove();
      spacer = null;
      el.classList.remove('elementor-sticky--active', 'elementor-sticky--effects', 'elementor-section--handles-inside');
      el.removeAttribute('style');
    };

    const pin = () => {
      if (!spacer) {
        spacer = el.cloneNode(true);
        spacer.classList.add('elementor-sticky__spacer');
        spacer.classList.remove('elementor-sticky', 'elementor-sticky--active', 'elementor-sticky--effects');
        spacer.removeAttribute('data-settings');
        spacer.setAttribute('style', 'visibility: hidden; transition: none; animation: auto ease 0s 1 normal none running none;');
        spacer.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
        el.after(spacer);
        el.classList.add('elementor-sticky--active', 'elementor-section--handles-inside');
      }
      const width = spacer.getBoundingClientRect().width;
      el.style.cssText = `position: fixed; width: ${width}px; margin-top: 0px; margin-bottom: 0px; ${bottom ? 'bottom' : 'top'}: ${offset}px;`;
    };

    const sync = () => {
      if (!on.includes(deviceMode())) { unpin(); return; }
      // `bottom` sticks as soon as the element would leave the viewport's foot;
      // `top` once its own top would pass the offset. Only `top` is used here.
      const past = bottom
        ? naturalTop + el.offsetHeight > window.scrollY + window.innerHeight - offset
        : window.scrollY + offset >= naturalTop;
      if (past) pin(); else unpin();
      el.classList.toggle('elementor-sticky--effects',
        el.classList.contains('elementor-sticky--active') && window.scrollY >= effectsOffset);
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', () => { unpin(); sync(); });
  }
}

/** Height of whatever sticky header is currently pinned, for anchor offsets. */
const stickyHeight = () => {
  const pinned = document.querySelector('.elementor-sticky--active');
  return pinned ? pinned.getBoundingClientRect().height : 0;
};

/* ------------------------------------------------------------------ *
 * Nav menu
 *
 * Two parallel menus per page (`.elementor-nav-menu--main` for desktop,
 * `nav.elementor-nav-menu--dropdown` behind the burger at ≤1024, which is what
 * `elementor-nav-menu--dropdown-tablet` on the widget means), and six of the
 * top-level items have a sub-menu.
 *
 * SmartMenus' real options on this site, read straight off the live instance:
 *
 *   showOnClick: false   hover opens on desktop
 *   showTimeout: 250     …after a quarter second
 *   hideTimeout: 500     …and closes half a second after the pointer leaves
 *   hideOnClick: true
 *
 * That 500ms hide timeout is exactly why the WordPress site never shows the bug
 * playbook §3.11 warns about: Elementor's sub-menu is positioned at `top: 100%`
 * with no overlap, and a plain `mouseleave → close` would fire while the pointer
 * crosses into it. The delay is reproduced rather than approximated, and the
 * functional test walks the real pointer path (parent → gap → submenu item).
 *
 * Touch behaves differently and that is SmartMenus too, not a compromise: the
 * first tap on a parent opens its sub-menu and does *not* navigate, the second tap
 * follows the link. Verified against production, where headless Chromium is
 * treated as touch and does exactly this.
 *
 * The annotations SmartMenus writes are part of the contract because the compiled
 * CSS and assistive tech both read them: `has-submenu` on the parent anchor,
 * `aria-haspopup`, `aria-controls` and `aria-expanded`, and on the open sub-menu
 * the inline `z-index: 3; width: auto; min-width: 10em; display: block;
 * max-width: 1000px; top: auto; left: 0px; margin-left: 0px; margin-top: 0px`.
 * ------------------------------------------------------------------ */
const SM_SHOW_TIMEOUT = 250;
const SM_HIDE_TIMEOUT = 500;
const SM_OPEN_STYLE = 'z-index: 3; width: auto; min-width: 10em; display: block; max-width: 1000px; top: auto; left: 0px; margin-left: 0px; margin-top: 0px;';

let smMenuSeq = 0;

/** Whether the pointer driving the page is a coarse one (SmartMenus' touch mode). */
const isTouchMode = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

function initNavMenu(widget) {
  const mainNav = widget.querySelector('nav.elementor-nav-menu--main');
  const dropdownNav = widget.querySelector('nav.elementor-nav-menu--dropdown');
  const toggle = widget.querySelector('.elementor-menu-toggle');
  const stretch = settingsOf(widget).full_width === 'stretch';

  if (mainNav) annotateSmartMenu(mainNav.querySelector('ul.elementor-nav-menu'), 'hover');
  if (dropdownNav) annotateSmartMenu(dropdownNav.querySelector('ul.elementor-nav-menu'), 'click');

  if (!toggle || !dropdownNav) return;

  // This Elementor version already prints the toggle's button semantics, unlike the
  // one on the sibling sites; setting them again is a no-op that keeps the clone
  // correct if the markup is ever re-extracted from an older install.
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('tabindex', '0');
  if (!toggle.hasAttribute('aria-label')) toggle.setAttribute('aria-label', 'Menu Toggle');

  /**
   * Elementor's "stretch" option pins the panel to the viewport width — this
   * widget sets `full_width: stretch`.
   *
   * Two details here are measured, not assumed, and both were wrong on the first
   * pass (they cost 28 diffs a page at 768–1024, on all 177 pages):
   *
   *   top     is the *toggle's* height, 45px, not the widget's 65px. The panel
   *           hangs off the burger, not off the widget box around it.
   *   left    is minus the panel's own **natural** offset — the position its CSS
   *           gives it before any inline `left` is applied, which the compiled
   *           sheet sets to `left: 10px` above 767px and `0` below. Measuring
   *           after resetting `left` to 0, which is what the sibling clones do,
   *           reads the widget's edge instead and lands the panel 10px to the
   *           right of production's.
   *
   * That 10px is Elementor's own off-by-one, not ours: the stretched panel really
   * does overhang the viewport's left edge by 10px on this site at tablet widths.
   * It is reproduced rather than corrected — see the README's bug register.
   */
  const place = () => {
    const toggleHeight = toggle.getBoundingClientRect().height || widget.getBoundingClientRect().height;
    dropdownNav.style.top = `${Math.round(toggleHeight * 2) / 2}px`;
    if (!stretch) return;
    dropdownNav.style.removeProperty('left');
    dropdownNav.style.removeProperty('width');
    void dropdownNav.offsetWidth;
    const offset = dropdownNav.getBoundingClientRect().left;
    dropdownNav.style.width = `${document.documentElement.clientWidth}px`;
    dropdownNav.style.left = `${-offset}px`;
  };

  const setOpen = (open) => {
    toggle.classList.toggle('elementor-active', open);
    toggle.setAttribute('aria-expanded', String(open));
    dropdownNav.setAttribute('aria-hidden', String(!open));
    if (open) {
      const top = dropdownNav.getBoundingClientRect().top;
      dropdownNav.style.setProperty('--menu-height', `${window.innerHeight - top}px`);
    } else {
      // Elementor leaves the custom property behind at `0` rather than removing it;
      // the live panel carries `--menu-height: 0` before it has ever been opened.
      dropdownNav.style.setProperty('--menu-height', '0');
    }
  };

  place();
  setOpen(false);
  window.addEventListener('resize', () => {
    place();
    if (toggle.classList.contains('elementor-active')) setOpen(true);
  });
  // Re-measure once the webfonts have swapped in. The header's items resize when
  // they do, which moves the burger, and the panel's offset was computed against
  // the pre-swap position. Elementor gets this for free because its own stretch
  // runs late; here it has to be asked for.
  document.fonts?.ready.then(place);

  const flip = () => setOpen(!toggle.classList.contains('elementor-active'));
  toggle.addEventListener('click', flip);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  // Following a real link closes the panel; a parent that only opens its sub-menu
  // must not. Escape closes it too.
  dropdownNav.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && !link.classList.contains('has-submenu')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.classList.contains('elementor-active')) setOpen(false);
  });
}

/**
 * Reproduce SmartMenus on one `<ul>`.
 *
 * `mode` is how a sub-menu opens: `hover` for the desktop bar (with the touch
 * fallback described above), `click` for the burger panel, where SmartMenus is in
 * collapsible mode and every level is tap-to-expand.
 */
function annotateSmartMenu(root, mode) {
  if (!root) return;
  const menuId = `${Date.now()}${smMenuSeq++}`;
  root.setAttribute('data-smartmenus-id', menuId);

  let seq = 0;
  const parents = [...root.querySelectorAll('li.menu-item-has-children')];
  const state = new Map();

  for (const li of parents) {
    const anchor = li.querySelector(':scope > a');
    const sub = li.querySelector(':scope > ul.sub-menu');
    if (!anchor || !sub) continue;

    const anchorId = `sm-${menuId}-${++seq}`;
    const subId = `sm-${menuId}-${++seq}`;
    anchor.id = anchorId;
    sub.id = subId;
    anchor.classList.add('has-submenu');
    anchor.setAttribute('aria-haspopup', 'true');
    anchor.setAttribute('aria-controls', subId);
    anchor.setAttribute('aria-expanded', 'false');

    state.set(li, { anchor, sub, showTimer: null, hideTimer: null, open: false });
  }

  const setOpen = (li, open) => {
    const s = state.get(li);
    if (!s || s.open === open) return;
    s.open = open;
    s.anchor.setAttribute('aria-expanded', String(open));
    if (open) s.sub.setAttribute('style', SM_OPEN_STYLE);
    else s.sub.removeAttribute('style');
  };

  const closeAll = (except) => {
    for (const li of state.keys()) if (li !== except) setOpen(li, false);
  };

  const clearTimers = (s) => {
    clearTimeout(s.showTimer); s.showTimer = null;
    clearTimeout(s.hideTimer); s.hideTimer = null;
  };

  for (const [li, s] of state) {
    if (mode === 'hover') {
      // Hover, with SmartMenus' own delays. The hide timer is what keeps the menu
      // alive while the pointer crosses the gap into it (playbook §3.11); moving
      // back onto the item — or onto the sub-menu, which is inside the same <li> —
      // cancels it.
      li.addEventListener('mouseenter', () => {
        if (isTouchMode()) return;
        clearTimers(s);
        s.showTimer = setTimeout(() => { closeAll(li); setOpen(li, true); }, SM_SHOW_TIMEOUT);
      });
      li.addEventListener('mouseleave', () => {
        if (isTouchMode()) return;
        clearTimers(s);
        s.hideTimer = setTimeout(() => setOpen(li, false), SM_HIDE_TIMEOUT);
      });
    }

    // Click: on the burger panel always, and on the desktop bar in touch mode,
    // where the first tap opens and the second follows the link.
    s.anchor.addEventListener('click', (event) => {
      if (mode === 'hover' && !isTouchMode()) return;
      if (s.open) return; // second tap — let the browser navigate
      event.preventDefault();
      clearTimers(s);
      closeAll(li);
      setOpen(li, true);
    });

    // Keyboard parity: the sub-menu has to be reachable without a pointer.
    s.anchor.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      closeAll(li);
      setOpen(li, true);
      s.sub.querySelector('a')?.focus();
    });
    li.addEventListener('focusout', () => {
      clearTimers(s);
      s.hideTimer = setTimeout(() => {
        if (!li.contains(document.activeElement)) setOpen(li, false);
      }, SM_HIDE_TIMEOUT);
    });
  }

  // `hideOnClick: true` — anything outside the menu closes it.
  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) closeAll(null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll(null);
  });
}

/* ------------------------------------------------------------------ *
 * Menu anchors
 *
 * Four of the "Essential Oils" sub-menu items point at `/get-essential-oils/#…`,
 * and the page carries matching `menu-anchor.default` widgets. Elementor scrolls to
 * the target smoothly and subtracts the pinned header's height, or the heading
 * lands underneath it.
 * ------------------------------------------------------------------ */
function initAnchors() {
  const scrollToId = (id) => {
    const target = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
    if (!target) return false;
    const top = target.getBoundingClientRect().top + window.scrollY - stickyHeight();
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    return true;
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="#"]');
    if (!link || link.target === '_blank') return;
    // Popup triggers are `href="#elementor-action:…"`, not anchors; initPopups owns
    // them and CSS.escape would happily try to find an element called that.
    if ((link.getAttribute('href') || '').includes('elementor-action')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    const id = url.hash.slice(1);
    if (!id || id === 'content') return;
    if (!scrollToId(id)) return;
    event.preventDefault();
    history.pushState(null, '', url.hash);
  });

  // A hash arrived with the page (e.g. /get-essential-oils/#grab-a-kit from the
  // nav): the browser has already jumped, but under the pinned header.
  if (location.hash.length > 1) {
    onReady(() => setTimeout(() => scrollToId(location.hash.slice(1)), 0));
  }
}

/* ------------------------------------------------------------------ *
 * Swiper
 *
 * Four widgets on this site are Swiper carousels — Elementor Pro's testimonial
 * carousel on / and /about/, and Pro's media carousel on /faq/ (the `carousel`
 * skin) and /about/ (the `slideshow` skin, which is two linked swipers: a
 * single-slide stage and a thumbnail strip). One engine drives all of them,
 * because Swiper's markup — not just its behaviour — is what the compiled CSS lays
 * out against: without it the `.swiper-slide` children keep their CSS width and
 * only the first is visible.
 *
 * Contract read off the live DOM (_extract/probe/probe-carousels.mjs):
 *
 *   container   + `swiper-initialized swiper-horizontal swiper-pointer-events`,
 *                 and `swiper-backface-hidden` while the total slide count is under
 *                 Swiper's `maxBackfaceHiddenSlides` (10) — present on both
 *                 testimonial carousels, absent from both media ones
 *   wrapper       `transform: translate3d(x,0,0)` and `transition-duration: <ms>`,
 *                 plus `cursor: grab` only when the carousel can actually move
 *                 (Swiper "locks" one whose slides all fit, and then sets neither
 *                 the grab cursor nor a draggable state — /about/'s three-up
 *                 testimonial carousel is the case in point), plus an id and
 *                 `aria-live="off"`
 *   loop          `slidesPerView` duplicates on each side — the last N slides
 *                 prepended, the first N appended — each keeping the source's
 *                 `data-swiper-slide-index` and `aria-label="n / total"`
 *   slides        inline `width` = (containerWidth - space*(spv-1)) / spv, and
 *                 `margin-right` = spaceBetween when that is non-zero
 *   classes       active / next / prev on the real run, and duplicate-active /
 *                 duplicate-next / duplicate-prev on the elements that mirror them
 *   pagination    bullets, one per *page* rather than per slide — three slides at
 *                 three-up is a single bullet, and the container then also carries
 *                 `swiper-pagination-lock`
 * ------------------------------------------------------------------ */

/**
 * Swiper's breakpoints, which are NOT Elementor's.
 *
 * Elementor hands Swiper a `breakpoints` map keyed by min-width — `0`, `767` and
 * `1024` — so the tablet bucket starts at 767 and the desktop one at 1024, one
 * pixel below where `deviceMode()` puts each boundary. Read off the live
 * `swiper.params.breakpoints` on all four carousels; getting this wrong moves a
 * carousel to the wrong column count in a 1px band at each edge, which is exactly
 * the kind of thing the 900px comparison catches and nobody eyeballs.
 */
const CAROUSEL_BREAKPOINTS = [
  { min: 1024, key: '' },
  { min: 767, key: '_tablet', fallbackSpace: 10 },
  { min: 0, key: '_mobile', fallbackSpace: 10 },
];

/**
 * Per-widget `slidesPerView` fallback, desktop / tablet / mobile, for the widgets
 * that do not serialise one. Elementor's own defaults differ per widget and per
 * skin, so they are measured rather than assumed — the live slide widths give them
 * away exactly (media carousel on /faq/: 479.333px in a 1438px container = 3 up;
 * testimonial carousel on /: 975px in a 975px container = 1 up).
 */
const CAROUSEL_DEFAULT_PER_VIEW = {
  'testimonial-carousel.default': [1, 1, 1],
  'media-carousel.default': [3, 2, 1],
};

/** The `slideshow` skin's stage is always one-up; its thumbnail strip is 5/4/3. */
const SLIDESHOW_PER_VIEW = [1, 1, 1];
const SLIDESHOW_THUMBS_PER_VIEW = [5, 4, 3];

/**
 * Drive one `.swiper` container.
 *
 * `cfg.layout()` returns `{ perView, space }` for the current viewport; everything
 * else mirrors the Swiper options the original widget was initialised with.
 */
function initSwiper(container, cfg) {
  const wrapper = container.querySelector('.swiper-wrapper');
  if (!wrapper) return;

  const originals = [...wrapper.children];
  const total = originals.length;
  if (!total) return;

  const {
    speed = 300, loop = false, autoplayDelay = 0,
    pauseOnHover = false, pauseOnInteraction = false,
    next = null, prev = null, bullets = null,
  } = cfg;

  originals.forEach((slide, i) => { slide.dataset.swiperSlideIndex = String(i); });

  container.classList.add('swiper-initialized', 'swiper-horizontal', 'swiper-pointer-events');
  if (!container.hasAttribute('role')) {
    container.setAttribute('role', 'region');
    container.setAttribute('aria-roledescription', 'carousel');
    container.setAttribute('aria-label', 'Slides');
  }
  wrapper.id = `swiper-wrapper-${Math.random().toString(16).slice(2, 18)}`;
  wrapper.setAttribute('aria-live', 'off');

  let slides = originals;
  let activeIndex = 0;
  let realIndex = 0;
  let step = 0;
  let locked = false;
  let animating = false;
  let autoplayTimer = null;
  let autoplayStopped = false;

  const setTranslate = (x, ms) => {
    const grab = locked ? '' : 'cursor: grab; ';
    wrapper.style.cssText = `${grab}transform: translate3d(${x}px, 0px, 0px); transition-duration: ${ms}ms;`;
  };

  /**
   * Bullet pagination is markup Swiper *creates*, not markup it decorates: the
   * server renders an empty container and its height only exists once the spans
   * are in it. There is one bullet per page, not per slide — `swiper-pagination-lock`
   * marks the case where everything fits on one.
   */
  const paintBullets = (pages) => {
    if (!bullets) return;
    bullets.classList.add('swiper-pagination-clickable', 'swiper-pagination-bullets', 'swiper-pagination-horizontal');
    bullets.classList.toggle('swiper-pagination-lock', pages <= 1);
    if (bullets.children.length !== pages) {
      bullets.replaceChildren(...Array.from({ length: pages }, (_, i) => {
        const dot = document.createElement('span');
        dot.className = 'swiper-pagination-bullet';
        dot.tabIndex = 0;
        dot.setAttribute('role', 'button');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        const go = () => slideBy(i - realIndex);
        dot.addEventListener('click', go);
        dot.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
        return dot;
      }));
    }
    [...bullets.children].forEach((dot, i) => {
      const on = i === Math.min(realIndex, pages - 1);
      dot.classList.toggle('swiper-pagination-bullet-active', on);
      if (on) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  const markClasses = () => {
    for (const slide of slides) {
      slide.classList.remove('swiper-slide-active', 'swiper-slide-next', 'swiper-slide-prev',
        'swiper-slide-duplicate-active', 'swiper-slide-duplicate-next', 'swiper-slide-duplicate-prev');
    }
    const active = slides[activeIndex];
    active?.classList.add('swiper-slide-active');
    slides[activeIndex + 1]?.classList.add('swiper-slide-next');
    slides[activeIndex - 1]?.classList.add('swiper-slide-prev');
    if (!loop) return;

    // Swiper mirrors the active/next/prev marks onto the matching duplicate — or
    // onto the real slide, when the marked one is itself a duplicate.
    const mirror = (index, cls, source) => {
      const wanted = source?.classList.contains('swiper-slide-duplicate')
        ? ':not(.swiper-slide-duplicate)'
        : '.swiper-slide-duplicate';
      wrapper.querySelectorAll(`.swiper-slide${wanted}[data-swiper-slide-index="${index}"]`)
        .forEach((el) => el.classList.add(cls));
    };
    mirror(realIndex, 'swiper-slide-duplicate-active', active);
    mirror((realIndex + 1) % total, 'swiper-slide-duplicate-next', slides[activeIndex + 1]);
    mirror((realIndex - 1 + total) % total, 'swiper-slide-duplicate-prev', slides[activeIndex - 1]);
  };

  const duplicate = (el) => {
    const copy = el.cloneNode(true);
    copy.classList.add('swiper-slide-duplicate');
    return copy;
  };

  const layout = () => {
    const { perView, space } = cfg.layout();
    const copies = cfg.loopCopies ? cfg.loopCopies() : perView;

    // Rebuild the loop copies whenever the count changes with the breakpoint.
    if (loop) {
      for (const el of [...wrapper.children]) {
        if (el.classList.contains('swiper-slide-duplicate')) el.remove();
      }
      const before = originals.slice(Math.max(0, total - copies)).map(duplicate);
      const after = originals.slice(0, copies).map(duplicate);
      wrapper.prepend(...before);
      wrapper.append(...after);
      activeIndex = before.length + realIndex;
    } else {
      activeIndex = realIndex;
    }
    slides = [...wrapper.children];

    container.classList.toggle('swiper-backface-hidden', slides.length < 10);
    locked = !loop && total <= perView;

    const width = container.clientWidth;
    if (!width) {
      // Hidden container: Swiper indexes and duplicates but sizes nothing.
      markClasses();
      return;
    }
    const slideWidth = Math.round(((width - space * (perView - 1)) / perView) * 1000) / 1000;
    step = slideWidth + space;
    for (const slide of slides) {
      slide.style.width = `${slideWidth}px`;
      if (space) slide.style.marginRight = `${space}px`;
      else slide.style.removeProperty('margin-right');
      const index = Number(slide.dataset.swiperSlideIndex);
      slide.setAttribute('aria-label', `${index + 1} / ${total}`);
      if (!slide.hasAttribute('role')) {
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'slide');
      }
    }

    setTranslate(-step * activeIndex, 0);
    markClasses();
    paintBullets(Math.max(1, loop ? total : total - perView + 1));
  };

  const slideBy = (delta) => {
    if (animating || !step || locked || !delta) return;
    const target = activeIndex + delta;
    if (!loop && (target < 0 || target > slides.length - cfg.layout().perView)) return;
    animating = true;
    activeIndex = target;
    realIndex = (realIndex + (delta % total) + total) % total;
    setTranslate(-step * activeIndex, speed);
    markClasses();
    paintBullets(bullets ? bullets.children.length : 1);
    setTimeout(() => {
      animating = false;
      if (!loop) return;
      // Loop fix: hop back onto the real run without a transition, exactly as
      // Swiper does once the duplicate has scrolled into place.
      const copies = cfg.loopCopies ? cfg.loopCopies() : cfg.layout().perView;
      if (activeIndex >= copies + total || activeIndex < copies) {
        activeIndex = copies + realIndex;
        setTranslate(-step * activeIndex, 0);
        markClasses();
      }
    }, speed);
  };

  const stopAutoplay = () => { clearInterval(autoplayTimer); autoplayTimer = null; };
  const startAutoplay = () => {
    if (!autoplayDelay || autoplayStopped || reduceMotion || autoplayTimer) return;
    autoplayTimer = setInterval(() => slideBy(1), autoplayDelay);
  };

  const arrow = (el, delta) => el?.addEventListener('click', () => {
    // Swiper's `disableOnInteraction: true` — a manual move ends autoplay for good.
    if (pauseOnInteraction) { autoplayStopped = true; stopAutoplay(); }
    slideBy(delta);
  });
  arrow(next, 1);
  arrow(prev, -1);

  if (pauseOnHover) {
    container.addEventListener('mouseenter', stopAutoplay);
    container.addEventListener('mouseleave', startAutoplay);
  }

  layout();
  window.addEventListener('resize', layout);
  startAutoplay();

  /** Lets scripts/compare.mjs pin the carousel to a deterministic first slide. */
  container.eCarousel = {
    reset() { autoplayStopped = true; stopAutoplay(); realIndex = 0; layout(); },
    slideBy,
  };
}

/**
 * Elementor Pro's testimonial carousel and media carousel.
 *
 * The media carousel has two skins on this site. `carousel` (on /faq/) is a plain
 * multi-up strip. `slideshow` (on /about/) renders *two* `.elementor-main-swiper`
 * containers inside one widget — a one-up stage and a thumbnail strip marked
 * `.elementor-thumbnails-swiper` — which Swiper's thumbs module keeps in step. The
 * live pair also shares a loop-copy count: five duplicates on each side of both,
 * driven by the strip's five-up view rather than the stage's one-up, so the stage
 * alone would be wrong.
 */
function initElementorCarousel(widget) {
  const containers = [...widget.querySelectorAll('.elementor-main-swiper')];
  if (!containers.length) return;
  const s = settingsOf(widget);
  const type = widget.getAttribute('data-widget_type');
  const slideshow = s.skin === 'slideshow';

  const settingFor = (name, bp, fallback) => {
    const value = s[`${name}${bp.key}`] ?? (bp.key ? undefined : s[name]);
    const size = value && typeof value === 'object' ? value.size : value;
    return size === undefined || size === '' ? fallback : Number(size);
  };

  const bucket = () => {
    const width = window.innerWidth;
    const index = CAROUSEL_BREAKPOINTS.findIndex((b) => width >= b.min);
    return [CAROUSEL_BREAKPOINTS[index], index];
  };

  /** The strip's per-view count, which also sets both swipers' loop copies. */
  const thumbsPerView = () => SLIDESHOW_THUMBS_PER_VIEW[bucket()[1]];

  for (const container of containers) {
    const thumbs = container.classList.contains('elementor-thumbnails-swiper');
    const defaults = slideshow
      ? (thumbs ? SLIDESHOW_THUMBS_PER_VIEW : SLIDESHOW_PER_VIEW)
      : (CAROUSEL_DEFAULT_PER_VIEW[type] || [3, 2, 1]);

    initSwiper(container, {
      // The strip runs at Swiper's own 300ms default; the stage takes the widget's.
      speed: thumbs ? 300 : Number(s.speed) || 300,
      loop: s.loop === 'yes',
      autoplayDelay: !thumbs && s.autoplay === 'yes' ? Number(s.autoplay_speed) || 5000 : 0,
      pauseOnHover: s.pause_on_hover === 'yes',
      pauseOnInteraction: s.pause_on_interaction === 'yes',
      next: thumbs ? null : container.querySelector('.elementor-swiper-button-next'),
      prev: thumbs ? null : container.querySelector('.elementor-swiper-button-prev'),
      bullets: thumbs || s.pagination !== 'bullets'
        ? null
        : widget.querySelector('.swiper-pagination'),
      loopCopies: slideshow ? thumbsPerView : null,
      layout() {
        const [bp, index] = bucket();
        return {
          perView: slideshow
            ? defaults[index]
            : settingFor('slides_per_view', bp, defaults[index]),
          space: settingFor('space_between', bp, bp.fallbackSpace ?? 0),
        };
      },
    });
  }

  // Clicking a thumbnail moves the stage, which is all the thumbs module does here.
  if (!slideshow) return;
  const [stage, strip] = containers;
  if (!stage || !strip) return;
  strip.addEventListener('click', (event) => {
    const slide = event.target.closest('.swiper-slide');
    if (!slide || !strip.contains(slide)) return;
    const index = Number(slide.dataset.swiperSlideIndex);
    const current = [...stage.querySelectorAll('.swiper-slide-active')][0];
    if (!Number.isFinite(index) || !current) return;
    stage.eCarousel?.slideBy(index - Number(current.dataset.swiperSlideIndex));
  });
}

/* ------------------------------------------------------------------ *
 * Posts grid
 *
 * Elementor's posts handler adds `elementor-has-item-ratio` to the grid container,
 * and that one class is what gives every card's thumbnail a fixed aspect-ratio box
 * instead of letting the image's natural height set it. The live DOM has it on
 * every `.elementor-posts-container` on this site — 57 widgets, on the blog index,
 * its ten pages, every category archive and the author archive — and without it the
 * cards grow to their images' natural heights and every listing runs long.
 *
 * It comes from the skin's `item_ratio` default, which Elementor does not serialise
 * into `data-settings`, so there is nothing in the markup to read it off; the live
 * DOM is the evidence.
 * ------------------------------------------------------------------ */
function initPostsGrid(widget) {
  for (const container of widget.querySelectorAll('.elementor-posts-container')) {
    container.classList.add('elementor-has-item-ratio');
  }

  /**
   * Per-thumbnail cover direction.
   *
   * Inside the ratio box the image is sized by width by default, which leaves a gap
   * under anything wider than the box. Elementor measures each image against its
   * container and marks the wide ones `elementor-fit-height`, which flips them to
   * height-100%/width-auto so they cover. This site's uploads are a mix of
   * landscape and portrait, so both branches are exercised on the blog index.
   *
   * Deferred until the image has decoded — `naturalWidth` is 0 before that.
   */
  const fit = (thumb) => {
    const img = thumb.querySelector('img');
    if (!img?.naturalWidth) return;
    const width = thumb.clientWidth;
    const height = parseFloat(getComputedStyle(thumb).paddingBottom) || thumb.clientHeight;
    if (!width || !height) return;
    thumb.classList.toggle('elementor-fit-height', img.naturalWidth / img.naturalHeight > width / height);
  };

  const thumbs = [...widget.querySelectorAll('.elementor-post__thumbnail')];
  const all = () => thumbs.forEach(fit);
  for (const thumb of thumbs) {
    const img = thumb.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', () => fit(thumb), { once: true });
    fit(thumb);
  }
  window.addEventListener('resize', all);
}

/* ------------------------------------------------------------------ *
 * Toggle widget
 *
 * On /faq/ (twelve questions) and /get-essential-oils/. Elementor renders every
 * item closed and the closed state is pure CSS — the live panels carry no inline
 * style and compute to `display: none`. Opening writes `display: block` inline and
 * flips `elementor-active` plus `aria-expanded`; closing removes the inline style
 * again rather than writing `display: none`, which is what jQuery's slideUp/slideDown
 * pair leaves behind and what the compiled CSS expects.
 *
 * Elementor's toggle is not exclusive: several items can be open at once.
 * ------------------------------------------------------------------ */
function initToggle(widget) {
  const titles = [...widget.querySelectorAll('.elementor-tab-title')];
  if (!titles.length) return;

  const panelFor = (title) => document.getElementById(title.getAttribute('aria-controls'))
    || title.nextElementSibling;

  for (const title of titles) {
    const panel = panelFor(title);
    if (!panel) continue;

    const setOpen = (open) => {
      title.classList.toggle('elementor-active', open);
      title.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('elementor-active', open);
      if (open) panel.style.display = 'block';
      else panel.style.removeProperty('display');
    };

    setOpen(title.getAttribute('aria-expanded') === 'true');

    const flip = () => setOpen(!title.classList.contains('elementor-active'));
    title.addEventListener('click', flip);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Search form (full-screen skin)
 *
 * The header's magnifier. Elementor's `full_screen` skin renders the input inside a
 * fixed, scaled-to-zero container and reveals it by adding one class:
 *
 *   .elementor-search-form--skin-full_screen .elementor-search-form__container
 *     :not(.elementor-search-form--full-screen) { opacity: 0; overflow: hidden;
 *                                                 transform: scale(0) }
 *
 * so `elementor-search-form--full-screen` on the *container* is the whole contract.
 *
 * The form itself is a plain `GET /?s=…`, which a static host cannot answer. That
 * is a real functional loss on cutover and it is written up in the README rather
 * than papered over here — the markup, the overlay and the focus behaviour are all
 * reproduced, and only the results page is missing.
 * ------------------------------------------------------------------ */
function initSearchForm(widget) {
  const container = widget.querySelector('.elementor-search-form__container');
  const toggle = widget.querySelector('.elementor-search-form__toggle');
  const close = widget.querySelector('.dialog-close-button');
  const input = widget.querySelector('.elementor-search-form__input');
  if (!container || !toggle) return;

  const OPEN = 'elementor-search-form--full-screen';
  const setOpen = (open) => {
    container.classList.toggle(OPEN, open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input?.focus();
  };

  setOpen(false);
  toggle.addEventListener('click', () => setOpen(true));
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); }
  });
  const dismiss = () => setOpen(false);
  close?.addEventListener('click', dismiss);
  close?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && container.classList.contains(OPEN)) dismiss();
  });
}

/* ------------------------------------------------------------------ *
 * Ultimate Addons countdown
 *
 * Two of them, and they are in opposite states — which is the point of
 * implementing this rather than leaving the markup inert.
 *
 *   /foundations/      `fixed`, due 2023-02-28. It expired years ago, and
 *                      `expire-action: hide` means the live page paints nothing
 *                      here: the plugin adds `flash-animation` and sets
 *                      `style="display: none"` on `.uael-countdown-wrapper`, leaving
 *                      the widget in the document at zero height. Reproduced exactly
 *                      — a clone that renders a live countdown, or four zeroes,
 *                      would be taller than production by the height of the timer.
 *   /foundations-old/  `evergreen`, interval 142,680,000s. It counts down from each
 *                      visitor's first view, which the plugin remembers in the
 *                      cookies `uael-time-to-run-<id>` and `uael-timer-distance-<id>`
 *                      — both present on the live site, and written here under the
 *                      same names so a returning visitor sees the same clock.
 * ------------------------------------------------------------------ */
const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};
const writeCookie = (name, value, days = 365) =>
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}; samesite=lax`;

function initCountdown(widget) {
  const wrapper = widget.querySelector('.uael-countdown-wrapper');
  if (!wrapper) return;
  const id = widget.getAttribute('data-id');
  const evergreen = wrapper.dataset.countdownType === 'evergreen';

  /** Milliseconds since the epoch at which this timer reaches zero. */
  const target = (() => {
    if (!evergreen) return Number(wrapper.dataset.dueDate) * 1000;
    const key = `uael-time-to-run-${id}`;
    const stored = Number(readCookie(key));
    if (stored) return stored;
    const end = Date.now() + Number(wrapper.dataset.evgInterval) * 1000;
    writeCookie(key, String(end));
    return end;
  })();

  const parts = {
    days: widget.querySelector(`[id^="days-wrapper-"]`),
    hours: widget.querySelector(`[id^="hours-wrapper-"]`),
    minutes: widget.querySelector(`[id^="minutes-wrapper-"]`),
    seconds: widget.querySelector(`[id^="seconds-wrapper-"]`),
  };
  const labels = {
    days: widget.querySelector(`[id^="days-label-wrapper-"]`),
    hours: widget.querySelector(`[id^="hours-label-wrapper-"]`),
    minutes: widget.querySelector(`[id^="minutes-label-wrapper-"]`),
    seconds: widget.querySelector(`[id^="seconds-label-wrapper-"]`),
  };
  const LABEL_TEXT = { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' };
  const pad = (n) => String(n).padStart(2, '0');

  const tick = () => {
    const distance = target - Date.now();
    writeCookie(`uael-timer-distance-${id}`, String(distance));
    if (distance <= 0) {
      // `expire-action: hide` on both widgets here. The plugin leaves the wrapper
      // in place and hides it; the widget box stays, at zero height.
      wrapper.classList.add('flash-animation');
      if (wrapper.dataset.expireAction === 'hide') wrapper.style.display = 'none';
      clearInterval(timer);
      return;
    }
    const seconds = Math.floor(distance / 1000);
    const value = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
    for (const key of Object.keys(parts)) {
      if (parts[key]) parts[key].textContent = key === 'days' ? String(value[key]) : pad(value[key]);
      if (labels[key]) labels[key].textContent = LABEL_TEXT[key];
    }
  };

  const timer = setInterval(tick, 1000);
  tick();
}

/* ------------------------------------------------------------------ *
 * Popups
 *
 * Three popup templates are attached to every page, and Elementor keeps all three
 * *out of the document* until something opens one — the live pre-open DOM has zero
 * `[data-elementor-type="popup"]` nodes on every page probed. BaseLayout therefore
 * parks each one in a `<template>`, whose content is not part of the DOM tree, so
 * the clone's pre-open document matches production's.
 *
 *   2995  the only one that is actually wired up: `triggers: {page_load: "yes",
 *         page_load_delay: 1}` with `timing: {times: "yes", times_times: 1}` — one
 *         second after load, at most once per visitor. It holds a LeadConnector
 *         subscribe form in an iframe.
 *   2974  opened by one link, on /favorite-products/, spelled the way Elementor
 *         spells popup actions: `href="#elementor-action:action=popup:open&
 *         settings=<base64 {"id":"2974","toggle":false}>"`.
 *   3170  a "Thank You!" confirmation with `triggers: []` — nothing on the site
 *         opens it, and nothing can: the only form that would is inside a
 *         cross-origin iframe. Cloned as-is and reported; see the README.
 *
 * Elementor builds the dialog library's wrapper around the popup and appends the
 * result to `<body>` (contract read off the live DOM, _extract/probe/):
 *
 *   <div class="dialog-widget dialog-lightbox-widget dialog-type-buttons
 *               dialog-type-lightbox elementor-popup-modal"
 *        id="elementor-popup-modal-<id>" aria-modal="true" role="document" tabindex="0">
 *     <div class="dialog-widget-content dialog-lightbox-widget-content animated <entrance>">
 *       <a role="button" tabindex="0" aria-label="Close" href="#"
 *          class="dialog-close-button dialog-lightbox-close-button"><i class="eicon-close"></i></a>
 *       <div class="dialog-header dialog-lightbox-header"></div>
 *       <div class="dialog-message dialog-lightbox-message">…the popup, display:block…</div>
 *
 * and adds `dialog-body dialog-lightbox-body dialog-container dialog-lightbox-container`
 * to `<body>`. The compiled e-popup stylesheet hangs everything off those names —
 * a wrapper that is almost right renders as an empty overlay (playbook §3.12).
 * ------------------------------------------------------------------ */

/**
 * Elementor's dialog library stylesheet.
 *
 * It is a *conditional* asset: absent from every page's <link> list, fetched by
 * elementor-pro only when a popup is first opened. It is also load-bearing — it
 * carries `.dialog-type-lightbox { position: fixed; inset: 0; z-index: 9999 }`,
 * without which the modal lays out in flow at the foot of the page instead of
 * covering the viewport. Injected here at the same moment, and into <head> after
 * the compiled sheets, which is where Elementor puts it too.
 */
const DIALOG_CSS = '/wp-content/plugins/elementor/assets/css/conditionals/dialog.min.css';

function loadDialogCss() {
  if (document.querySelector(`link[href="${DIALOG_CSS}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DIALOG_CSS;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
}

/**
 * How many times each popup has already been shown to this visitor.
 *
 * Elementor keeps this in `localStorage.elementor` under a per-popup key, and the
 * live site's localStorage carries exactly that. The same store is used here so a
 * visitor who has already dismissed the subscribe popup on the WordPress site is
 * not shown it again by the clone.
 */
const popupCounts = {
  read(id) {
    try {
      const store = JSON.parse(localStorage.getItem('elementor') || '{}');
      return Number(store?.[`popup_showing_times_${id}`]?.value ?? store?.[`popup_showing_times_${id}`] ?? 0);
    } catch { return 0; }
  },
  bump(id) {
    try {
      const store = JSON.parse(localStorage.getItem('elementor') || '{}');
      store[`popup_showing_times_${id}`] = { value: this.read(id) + 1 };
      localStorage.setItem('elementor', JSON.stringify(store));
    } catch { /* private mode — the popup simply shows again next time */ }
  },
};

/** `#elementor-action:action=popup:open&settings=<base64>` → the popup id. */
function popupIdFromAction(href) {
  if (!href || !href.includes('elementor-action')) return null;
  const decoded = decodeURIComponent(href);
  const settings = /settings=([A-Za-z0-9+/=]+)/.exec(decoded)?.[1];
  if (!settings || !/action=popup:open/.test(decoded)) return null;
  try { return String(JSON.parse(atob(settings)).id); } catch { return null; }
}

function initPopups() {
  const holders = [...document.querySelectorAll('template.gm-popup')];
  if (!holders.length) return;

  /** id -> open() */
  const openers = new Map();

  for (const holder of holders) {
    const template = holder.content.querySelector('[data-elementor-type="popup"]');
    if (!template) continue;
    const id = template.getAttribute('data-elementor-id');
    const settings = (() => {
      try { return JSON.parse(template.getAttribute('data-elementor-settings') || '{}'); } catch { return {}; }
    })();

    let modal = null;

    const close = () => {
      if (!modal) return;
      modal.remove();
      modal = null;
      document.body.classList.remove('dialog-body', 'dialog-lightbox-body', 'dialog-container', 'dialog-lightbox-container');
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (event) => { if (event.key === 'Escape') close(); };

    const open = async () => {
      if (modal) return;
      // Elementor fetches the dialog stylesheet before it shows the modal; so do we,
      // or the first open paints one frame with the popup laid out in flow.
      await loadDialogCss();
      if (modal) return;
      modal = document.createElement('div');
      modal.className = 'dialog-widget dialog-lightbox-widget dialog-type-buttons dialog-type-lightbox elementor-popup-modal';
      modal.id = `elementor-popup-modal-${id}`;
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('role', 'document');
      modal.setAttribute('tabindex', '0');

      const content = document.createElement('div');
      content.className = 'dialog-widget-content dialog-lightbox-widget-content animated';
      // Two of the three templates set an entrance animation; the class names are
      // the ones in Elementor's own animations stylesheets, which the page links.
      if (settings.entrance_animation && !reduceMotion) {
        content.classList.add(settings.entrance_animation);
        const duration = settings.entrance_animation_duration?.size;
        if (duration) content.style.animationDuration = `${duration}s`;
      }

      const closeButton = document.createElement('a');
      closeButton.className = 'dialog-close-button dialog-lightbox-close-button';
      closeButton.setAttribute('role', 'button');
      closeButton.setAttribute('tabindex', '0');
      closeButton.setAttribute('aria-label', 'Close');
      closeButton.href = '#';
      closeButton.innerHTML = '<i class="eicon-close"></i>';

      const header = document.createElement('div');
      header.className = 'dialog-header dialog-lightbox-header';

      const message = document.createElement('div');
      message.className = 'dialog-message dialog-lightbox-message';
      const popup = template.cloneNode(true);
      popup.style.display = 'block';
      message.append(popup);

      content.append(closeButton, header, message);
      modal.append(content);
      document.body.append(modal);
      document.body.classList.add('dialog-body', 'dialog-lightbox-body', 'dialog-container', 'dialog-lightbox-container');

      closeButton.addEventListener('click', (event) => { event.preventDefault(); close(); });
      // Elementor's `a11y_navigation` — clicking the backdrop dismisses, clicking
      // inside the card does not.
      modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
      document.addEventListener('keydown', onKey);
      modal.focus();
      popupCounts.bump(id);

      // Anything Elementor would have initialised inside the popup, we do too.
      initWidgets(popup);
    };

    openers.set(id, open);

    // `open_selector` is how Elementor wires a popup to a menu item or a button
    // class. None of this site's three use it, but the sibling clones' do and the
    // branch costs nothing.
    if (settings.open_selector) {
      document.addEventListener('click', (event) => {
        const trigger = event.target.closest(settings.open_selector);
        if (!trigger) return;
        const link = event.target.closest('a');
        if (link && (link.getAttribute('href') || '#') === '#') event.preventDefault();
        open();
      });
    }

    // Page-load trigger, with Elementor's delay and display cap.
    const triggers = settings.triggers && !Array.isArray(settings.triggers) ? settings.triggers : {};
    const timing = settings.timing && !Array.isArray(settings.timing) ? settings.timing : {};
    if (triggers.page_load === 'yes') {
      const cap = timing.times === 'yes' ? Number(timing.times_times) || 1 : Infinity;
      if (popupCounts.read(id) < cap) {
        setTimeout(open, (Number(triggers.page_load_delay) || 0) * 1000);
      }
    }
  }

  // `#elementor-action:action=popup:open&settings=…` links, wherever they are.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="elementor-action"]');
    if (!link) return;
    const id = popupIdFromAction(link.getAttribute('href'));
    const open = id && openers.get(id);
    if (!open) return;
    event.preventDefault();
    open();
  });
}

/* ------------------------------------------------------------------ *
 * Entrance animations
 *
 * 251 elements on this site render with `elementor-invisible` and an `animation`
 * in `data-settings`; Elementor swaps in `animated <name>` when they scroll into
 * view, and the keyframes live in the per-animation stylesheets each page links.
 * Without this they stay invisible forever — this is the single largest source of
 * "the clone is blank below the fold" on an Elementor site.
 *
 * With reduced motion the class is applied immediately and the animation is a
 * no-op, which is what matters: the element must never stay invisible.
 * ------------------------------------------------------------------ */
function initEntranceAnimations() {
  const targets = [...document.querySelectorAll('.elementor-invisible[data-settings]')]
    .filter((el) => {
      const s = settingsOf(el);
      const name = s.animation || s._animation;
      return name && name !== 'none';
    });
  if (!targets.length) return;

  const reveal = (el) => {
    const s = settingsOf(el);
    const name = s.animation || s._animation;
    const delay = Number(s.animation_delay || s._animation_delay || 0);
    setTimeout(() => {
      el.classList.remove('elementor-invisible');
      el.classList.add('animated', name);
    }, reduceMotion ? 0 : delay);
  };

  if (reduceMotion) { targets.forEach(reveal); return; }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      reveal(entry.target);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  targets.forEach((el) => observer.observe(el));
}

/* ------------------------------------------------------------------ *
 * WordPress-hosted forms
 *
 * Four forms on this site are rendered by WordPress and POST back to it: Gravity
 * Forms 8 (/foundations-health-program-registration/), 2 (/foundations-old/) and
 * the 40-field intake form (/patient-wellness-intake/), plus an Elementor Pro form
 * on the unfinished /elementor-3137/ draft. All four stop working the moment the
 * WordPress install is switched off.
 *
 * Their *markup* is not replaced — unlike the ActiveCampaign embed on /contact-me/,
 * these are rendered server-side in full, with Gravity's own stylesheets, so they
 * have a design and cloning it is the job (playbook §2). Only their destination
 * changes: with a Growthmap endpoint configured they POST there instead, as
 * FormData, exactly like `ContactForm.astro` does (playbook §4b). Without one they
 * are left alone, and the README says so.
 *
 * Gravity already renders its own honeypot (`gfield--type-honeypot`), so no extra
 * one is added; a submission that fills it is dropped here the same way.
 * ------------------------------------------------------------------ */
function initHostedForms() {
  const endpoint = document.documentElement.dataset.contactEndpoint || '';
  const forms = [...document.querySelectorAll('form[id^="gform_"], form.elementor-form')];
  if (!endpoint || !forms.length) return;

  for (const form of forms) {
    form.setAttribute('action', endpoint);
    form.setAttribute('method', 'post');

    // The status line goes where the plugin puts its own validation summary, so it
    // inherits the form's typography instead of arriving unstyled.
    const status = document.createElement('p');
    status.className = 'gm-hosted-form__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'margin:12px 0 0;min-height:1.4em;';
    form.append(status);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      if (!form.reportValidity()) return;

      const data = new FormData(form);
      data.set('form_name', form.getAttribute('data-formid')
        ? `Gravity Form ${form.getAttribute('data-formid')}`
        : form.getAttribute('name') || 'Form');
      data.set('source_page', location.pathname);

      // Gravity's honeypot field is the one inside `.gfield--type-honeypot`; a bot
      // that filled it gets the success message and nothing is sent.
      const honeypot = form.querySelector('.gfield--type-honeypot input');
      if (honeypot && honeypot.value.trim()) {
        form.reset();
        status.textContent = 'Thanks — we will be in touch shortly.';
        return;
      }

      const submit = form.querySelector('input[type="submit"], button[type="submit"]');
      const original = submit && (submit.value || submit.textContent);
      if (submit) submit.disabled = true;
      try {
        const response = await fetch(endpoint, { method: 'POST', body: data });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.reset();
        status.textContent = 'Thanks — we will be in touch shortly.';
      } catch {
        status.textContent = 'Sorry, something went wrong. Please try again or email us.';
      } finally {
        if (submit) {
          submit.disabled = false;
          if (original !== undefined && 'value' in submit) submit.value = original;
        }
      }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Trailing nodes
 *
 * Elementor appends two elements to <body> on init, and the live DOM has both:
 *
 *   <span id="elementor-device-mode" class="elementor-screen-only">
 *     The breakpoint probe. elementor-frontend.css gives it a `content` per
 *     breakpoint so scripts can read the active device off it.
 *
 *   <svg style="display:none" class="e-font-icon-svg-symbols">
 *     The sprite sheet Elementor fills with any icon rendered as inline SVG. This
 *     site renders its icons as Font Awesome webfont glyphs, so it stays empty
 *     here exactly as it is empty on production.
 * ------------------------------------------------------------------ */
function initTrailingNodes() {
  if (!document.getElementById('elementor-device-mode')) {
    const probe = document.createElement('span');
    probe.id = 'elementor-device-mode';
    probe.className = 'elementor-screen-only';
    document.body.append(probe);
  }
  if (!document.querySelector('svg.e-font-icon-svg-symbols')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'display: none;');
    svg.setAttribute('class', 'e-font-icon-svg-symbols');
    document.body.append(svg);
  }
}

/* ------------------------------------------------------------------ */

const WIDGETS = {
  'nav-menu.default': initNavMenu,
  'search-form.default': initSearchForm,
  'posts.classic': initPostsGrid,
  'archive-posts.archive_classic': initPostsGrid,
  'testimonial-carousel.default': initElementorCarousel,
  'media-carousel.default': initElementorCarousel,
  'toggle.default': initToggle,
  'uael-countdown.default': initCountdown,
};

/** Wire up every widget inside `root` — the document, or a popup once opened. */
function initWidgets(root) {
  for (const [type, init] of Object.entries(WIDGETS)) {
    for (const widget of root.querySelectorAll(`[data-widget_type="${type}"]`)) {
      // The sticky spacer is a visibility-hidden clone; wiring its widgets up would
      // duplicate every document-level listener for no visible effect.
      if (widget.closest('.elementor-sticky__spacer')) continue;
      try { init(widget); } catch (error) { console.error(`[elementor] ${type}`, error); }
    }
  }
}

onReady(() => {
  initEnvironment();
  initLazyBackgrounds();
  initSticky();
  initWidgets(document);
  initAnchors();
  initEntranceAnimations();
  initHostedForms();
  initPopups();
  initTrailingNodes();
});
