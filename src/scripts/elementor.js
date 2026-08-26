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
 * jquery.sticky, Swiper, the Essential Addons frontend bundle, the WPForms frontend
 * bundle and the YouTube iframe API shim.
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
 * Elementor's device mode, from kit 6's active breakpoints (mobile ≤767, tablet
 * ≤1024, desktop above — the values `elementorFrontend.config.responsive` carries
 * on this site, and the ones the playbook pins the clone's breakpoints to).
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
 * The header section (`.main-header`, element 0edd40f) is sticky-top on every
 * device and on all 76 templated pages; three service pages also stick a CTA
 * button.
 *
 * Contract, read off the live header at scrollY 0 / 30 / 60 / 600:
 *
 *   below the threshold  the element carries `elementor-sticky` and nothing else —
 *                        no inline style, and no spacer in the document at all;
 *   at or past it        it gains `elementor-sticky--active
 *                        elementor-section--handles-inside`, is pinned with inline
 *                        `position: fixed; width: <spacer width>px; margin-top: 0px;
 *                        margin-bottom: 0px; top: <offset>px`, and a
 *                        visibility-hidden clone (`elementor-sticky__spacer`) is
 *                        inserted after it to hold the space;
 *   `--effects`          only while active, and only past `sticky_effects_offset`.
 *
 * The threshold matters here in a way it does not on the sibling sites: this header
 * sits 54px down the page behind a top bar, so pinning it from the first paint —
 * which is what a naive implementation does — moves the whole page up by 54px and
 * every measurement below it with it.
 */
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
        el.classList.contains('elementor-sticky--active') && window.scrollY > effectsOffset);
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
 * `nav.elementor-nav-menu--dropdown` behind the burger for tablet and below), and
 * every top-level item except two has a sub-menu.
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

  // Elementor stamps the toggle's button semantics from JS, not from PHP.
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('tabindex', '0');
  toggle.setAttribute('aria-label', 'Menu Toggle');

  /**
   * Elementor's "stretch" option pins the panel to the viewport width.
   *
   * The order is the whole trick, and it is Elementor's own (stretch-element.js):
   * reset `left` to 0 and apply the full width *first*, force a layout, and only
   * then measure — the offset wanted is where the panel sits when left-aligned to
   * its containing block, not where it sits statically. Measuring before the reset
   * reads a position ~7px further right and lands the whole menu 7px off screen.
   */
  const place = () => {
    const widgetRect = widget.getBoundingClientRect();
    dropdownNav.style.top = `${Math.round(widgetRect.height * 2) / 2}px`;
    if (!stretch) return;
    dropdownNav.style.left = '0px';
    dropdownNav.style.width = `${document.documentElement.clientWidth}px`;
    void dropdownNav.offsetWidth;
    const offset = dropdownNav.getBoundingClientRect().left;
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
      dropdownNav.style.removeProperty('--menu-height');
    }
  };

  place();
  setOpen(false);
  window.addEventListener('resize', () => {
    place();
    if (toggle.classList.contains('elementor-active')) setOpen(true);
  });
  // Re-measure once Poppins has swapped in. The header's items resize when it
  // does, which moves the burger about 7px, and the panel's offset was computed
  // against the pre-swap position — leaving the whole mobile menu 7px off screen.
  // Elementor gets this for free because its own stretch runs late; here it has to
  // be asked for.
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
 * Several menu items point at `/about-us/#providers` and friends. Elementor
 * scrolls to the target smoothly and subtracts the pinned header's height, or the
 * heading lands underneath it.
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
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    const id = url.hash.slice(1);
    if (!id || id === 'content') return;
    if (!scrollToId(id)) return;
    event.preventDefault();
    history.pushState(null, '', url.hash);
  });

  // A hash arrived with the page (e.g. /about-us/#providers from the nav): the
  // browser has already jumped, but under the pinned header.
  if (location.hash.length > 1) {
    onReady(() => setTimeout(() => scrollToId(location.hash.slice(1)), 0));
  }
}

/* ------------------------------------------------------------------ *
 * Swiper
 *
 * Three widget types on this site are Swiper carousels: Elementor Pro's
 * testimonial carousel (the patient quotes, on 9 pages), Pro's reviews widget
 * (/book-an-appointment/) and Essential Addons' team-member carousel (the provider
 * strip on / and /about-us/). One engine drives all three, because Swiper's markup
 * — not just its behaviour — is what the compiled CSS lays out against: without it
 * the `.swiper-slide` children keep their CSS width and only the first is visible.
 *
 * Contract read off the live DOM:
 *
 *   container   + `swiper-initialized swiper-horizontal swiper-pointer-events`,
 *                 and `swiper-backface-hidden` while the total slide count is under
 *                 Swiper's `maxBackfaceHiddenSlides` (10)
 *   wrapper       `cursor: grab; transition-duration: <ms>; transform: translate3d(x,0,0)`
 *                 plus an id and `aria-live="off"`
 *   loop          `slidesPerView` duplicates on each side — the last N slides
 *                 prepended, the first N appended — each keeping the source's
 *                 `data-swiper-slide-index` and `aria-label="n / total"`
 *   slides        inline `width` = (containerWidth - space*(spv-1)) / spv, and
 *                 `margin-right` = spaceBetween when that is non-zero
 *   classes       active / next / prev on the real run, and duplicate-active /
 *                 duplicate-next / duplicate-prev on the elements that mirror them
 *   pagination    the reviews widget renders `swiper-pagination-fraction`:
 *                 `<span class="swiper-pagination-current">2</span> / <span
 *                 class="swiper-pagination-total">5</span>`
 *
 * A container that is `display:none` at every breakpoint measures 0 wide, and
 * Swiper then skips sizing entirely: it still duplicates the slides and indexes
 * them, but writes no width, no margin and no `aria-label`.
 * ------------------------------------------------------------------ */

const CAROUSEL_BREAKPOINTS = [
  { min: 1025, key: '' },
  { min: 768, key: '_tablet', fallbackSpace: 10 },
  { min: 0, key: '_mobile', fallbackSpace: 10 },
];

/**
 * Per-widget `slidesPerView` fallback, desktop / tablet / mobile. Elementor's own
 * defaults are not serialised into `data-settings` and they differ per widget, so
 * they are measured rather than assumed — the live slide counts give the loop's
 * duplicate count away exactly (testimonial carousel: 13 originals + 1 clone each
 * side = 15; reviews: 5 + 1 each side = 7, both at every breakpoint).
 */
const CAROUSEL_DEFAULT_PER_VIEW = {
  'testimonial-carousel.default': [1, 1, 1],
  'reviews.default': [1, 1, 1],
};

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
    pauseOnHover = false, pauseOnInteraction = false, autoHeight = false,
    next = null, prev = null, pagination = null, bullets = null,
  } = cfg;

  originals.forEach((slide, i) => { slide.dataset.swiperSlideIndex = String(i); });

  container.classList.add('swiper-initialized', 'swiper-horizontal', 'swiper-pointer-events');
  if (autoHeight) container.classList.add('swiper-autoheight');
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
  let animating = false;
  let autoplayTimer = null;
  let autoplayStopped = false;

  const setTranslate = (x, ms) => {
    const height = autoHeight && slides[activeIndex] ? ` height: ${slides[activeIndex].offsetHeight}px;` : '';
    wrapper.style.cssText = `cursor: grab;${height} transform: translate3d(${x}px, 0px, 0px); transition-duration: ${ms}ms;`;
  };

  // Bullet pagination is markup Swiper *creates*, not markup it decorates: the
  // server renders an empty container, and its 24px of height only exists once the
  // spans are in it. On this site that is the team strip's dots row — leaving it
  // empty made the section 24px short and pushed everything below it up by the
  // same amount.
  if (bullets) {
    bullets.classList.add('swiper-pagination-clickable', 'swiper-pagination-bullets', 'swiper-pagination-horizontal');
    bullets.replaceChildren(...Array.from({ length: total }, (_, i) => {
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

  // Fraction pagination is created too: the server renders `<div
  // class="swiper-pagination">` empty and Swiper fills it with the two spans.
  if (pagination && !pagination.querySelector('.swiper-pagination-current')) {
    pagination.classList.add('swiper-pagination-fraction', 'swiper-pagination-horizontal');
    pagination.innerHTML =
      '<span class="swiper-pagination-current">1</span> / <span class="swiper-pagination-total">1</span>';
  }

  const paint = () => {
    if (pagination) {
      const current = pagination.querySelector('.swiper-pagination-current');
      const totalEl = pagination.querySelector('.swiper-pagination-total');
      if (current) current.textContent = String(realIndex + 1);
      if (totalEl) totalEl.textContent = String(total);
    }
    if (!bullets) return;
    [...bullets.children].forEach((dot, i) => {
      const on = i === realIndex;
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
    paint();
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

    // Rebuild the loop copies whenever the count changes with the breakpoint.
    if (loop) {
      for (const el of [...wrapper.children]) {
        if (el.classList.contains('swiper-slide-duplicate')) el.remove();
      }
      const before = originals.slice(Math.max(0, total - perView)).map(duplicate);
      const after = originals.slice(0, perView).map(duplicate);
      wrapper.prepend(...before);
      wrapper.append(...after);
      activeIndex = before.length + realIndex;
    } else {
      activeIndex = realIndex;
    }
    slides = [...wrapper.children];

    container.classList.toggle('swiper-backface-hidden', slides.length < 10);

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
  };

  const slideBy = (delta) => {
    if (animating || !step) return;
    const target = activeIndex + delta;
    if (!loop && (target < 0 || target >= slides.length)) return;
    animating = true;
    activeIndex = target;
    realIndex = (realIndex + (delta % total) + total) % total;
    setTranslate(-step * activeIndex, speed);
    markClasses();
    setTimeout(() => {
      animating = false;
      if (!loop) return;
      // Loop fix: hop back onto the real run without a transition, exactly as
      // Swiper does once the duplicate has scrolled into place.
      const perView = cfg.layout().perView;
      if (activeIndex >= perView + total || activeIndex < perView) {
        activeIndex = perView + realIndex;
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
  };
}

/** Elementor Pro testimonial carousel and reviews — both read `data-settings`. */
function initElementorCarousel(widget) {
  const container = widget.querySelector('.elementor-main-swiper');
  if (!container) return;
  const s = settingsOf(widget);
  const perViewDefaults = CAROUSEL_DEFAULT_PER_VIEW[widget.getAttribute('data-widget_type')] || [3, 2, 1];

  const settingFor = (name, bp, fallback) => {
    const value = s[`${name}${bp.key}`] ?? (bp.key ? undefined : s[name]);
    const size = value && typeof value === 'object' ? value.size : value;
    return size === undefined || size === '' ? fallback : Number(size);
  };

  initSwiper(container, {
    speed: Number(s.speed) || 300,
    loop: s.loop === 'yes',
    autoplayDelay: s.autoplay === 'yes' ? Number(s.autoplay_speed) || 5000 : 0,
    pauseOnHover: s.pause_on_hover === 'yes',
    pauseOnInteraction: s.pause_on_interaction === 'yes',
    next: widget.querySelector('.elementor-swiper-button-next'),
    prev: widget.querySelector('.elementor-swiper-button-prev'),
    pagination: s.pagination === 'fraction' ? widget.querySelector('.swiper-pagination') : null,
    layout() {
      const width = window.innerWidth;
      const index = CAROUSEL_BREAKPOINTS.findIndex((b) => width >= b.min);
      const bp = CAROUSEL_BREAKPOINTS[index];
      return {
        perView: settingFor('slides_per_view', bp, perViewDefaults[index]),
        space: settingFor('space_between', bp, bp.fallbackSpace ?? 0),
      };
    },
  });
}

/**
 * Essential Addons team-member carousel.
 *
 * Its options come from `data-` attributes on the container rather than from
 * Elementor's settings blob, and its breakpoints are Swiper's own `min-width`
 * ones — 1024 / 768 — not Elementor's. Live values on this site: 6 items at
 * desktop with a 20px gap, 4 at tablet, 2 at mobile with 15px, 400ms, autoplay
 * every 2s, looping.
 */
function initEaelCarousel(widget) {
  const container = widget.querySelector('.swiper[data-items], .swiper-container[data-items]');
  if (!container) return;
  const d = container.dataset;
  const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));
  const find = (sel) => (sel ? widget.querySelector(sel) || document.querySelector(sel) : null);

  initSwiper(container, {
    speed: num(d.speed, 400),
    loop: num(d.loop, 0) === 1,
    autoplayDelay: num(d.autoplay, 0),
    pauseOnHover: num(d.pauseOnHover, 0) === 1,
    pauseOnInteraction: false,
    next: num(d.arrows, 0) === 1 ? find(d.arrowNext) : null,
    prev: num(d.arrows, 0) === 1 ? find(d.arrowPrev) : null,
    bullets: num(d.dots, 0) === 1 ? find(d.pagination) : null,
    layout() {
      const width = window.innerWidth;
      return width >= 1024
        ? { perView: num(d.items, 3), space: num(d.margin, 10) }
        : width >= 768
          ? { perView: num(d.itemsTablet, 2), space: num(d.marginTablet, 10) }
          : { perView: num(d.itemsMobile, 1), space: num(d.marginMobile, 10) };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Posts / archive grid
 *
 * Elementor's posts handler adds `elementor-has-item-ratio` to the grid container,
 * and that one class is what gives every card's thumbnail a fixed aspect-ratio box
 * instead of letting the image's natural height set it. Without it the cards on
 * /blog/ render 821px tall instead of 589px and the listing is 1102px too long.
 *
 * It comes from the skin's `item_ratio` default (0.66 for cards), which Elementor
 * does not serialise into `data-settings` — so there is nothing in the markup to
 * read it off. The live DOM has the class on every posts container on this site,
 * which is the evidence it is applied on.
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
   * height-100%/width-auto so they cover. One of the ten cards on /blog/ is wide
   * enough to need it (1439x752 in a 1.52:1 box), and without this it was the only
   * card that did not match production.
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
 * Essential Addons advanced accordion
 *
 * Contract off /services/gout/: the open header carries `show-this active` and its
 * panel is `style="display: block"`; closing writes `display: none` and drops both
 * classes. `active-default` marks whichever item the editor opened by default and
 * is never removed — it is a source annotation, not a state.
 *
 * `data-accordion-type="accordion"` is one-at-a-time; `toggle` would allow several.
 * ------------------------------------------------------------------ */
function initEaelAccordion(widget) {
  const root = widget.querySelector('.eael-adv-accordion');
  if (!root) return;
  const exclusive = (root.dataset.accordionType || 'accordion') === 'accordion';
  const headers = [...root.querySelectorAll('.eael-accordion-header')];

  const panelOf = (header) => header.parentElement.querySelector('.eael-accordion-content');

  const setOpen = (header, open) => {
    const panel = panelOf(header);
    if (!panel) return;
    header.classList.toggle('show-this', open);
    header.classList.toggle('active', open);
    header.setAttribute('aria-expanded', String(open));
    panel.style.display = open ? 'block' : 'none';
  };

  // The server marks the editor's default-open item `active-default` and stops
  // there — `show-this active` and the panel's `display: block` are written by the
  // plugin's JS on init. Without this every panel renders closed.
  for (const header of headers) {
    if (header.classList.contains('active-default')) setOpen(header, true);
    else setOpen(header, false);
  }

  for (const header of headers) {
    const panel = panelOf(header);
    if (panel) header.setAttribute('aria-expanded', String(header.classList.contains('active')));

    const flip = () => {
      const willOpen = !header.classList.contains('active');
      if (exclusive) for (const other of headers) if (other !== header) setOpen(other, false);
      setOpen(header, willOpen);
    };

    header.addEventListener('click', flip);
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Table of contents
 *
 * Elementor renders the widget with a spinner and nothing else: the list is built
 * in the browser by walking the page's headings. Contract off the live post-init
 * DOM on /blog/ingrown-toenail-treatment/:
 *
 *   * an anchor span is inserted immediately *before* each heading —
 *     `<span id="elementor-toc__heading-anchor-N" class="elementor-menu-anchor "></span>`
 *     (the trailing space in the class is Elementor's, and is kept);
 *   * the body holds nested `<ol class="elementor-toc__list-wrapper">`, one level
 *     per heading depth, each item
 *     `<li class="elementor-toc__list-item"><div class="elementor-toc__list-item-text-wrapper">
 *      <a href="#…" class="elementor-toc__list-item-text">`;
 *   * only the shallowest depth present carries `elementor-toc__top-level`.
 *
 * `minimized_on: tablet` starts the box collapsed at ≤1024; the compiled CSS keys
 * off `elementor-toc--collapsed` on the widget.
 * ------------------------------------------------------------------ */
function initToc(widget) {
  const body = widget.querySelector('.elementor-toc__body');
  const buttons = [...widget.querySelectorAll('.elementor-toc__toggle-button')];
  if (!body) return;
  const s = settingsOf(widget);

  const tags = (s.headings_by_tags || ['h2', 'h3', 'h4', 'h5', 'h6']).map((t) => t.toLowerCase());
  // Elementor scans the post content, not the chrome — a heading in the header,
  // the footer or the widget itself must not become an entry.
  const scope = widget.closest('[data-elementor-type]') || document.body;
  const headings = [...scope.querySelectorAll(tags.join(','))]
    // The widget's own "Table of Contents" title is an <h4>, so it lists itself
    // unless the whole widget is excluded — not just its body.
    .filter((h) => !h.closest('[data-widget_type="table-of-contents.default"]'))
    .filter((h) => !h.closest('header') && !h.closest('footer'))
    .filter((h) => h.textContent.trim());

  if (!headings.length) {
    body.innerHTML = `<div class="elementor-toc__no-headings-message">${s.no_headings_message || 'No headings were found on this page.'}</div>`;
    return;
  }

  const depthOf = (h) => tags.indexOf(h.tagName.toLowerCase());
  const top = Math.min(...headings.map(depthOf));

  // Build the nested lists by walking depth, keeping one open <ol> per level.
  const root = document.createElement('ol');
  root.className = 'elementor-toc__list-wrapper';
  const stack = [{ depth: top, list: root, item: null }];

  headings.forEach((heading, index) => {
    const anchor = document.createElement('span');
    anchor.id = `elementor-toc__heading-anchor-${index}`;
    anchor.className = 'elementor-menu-anchor ';
    heading.before(anchor);

    const depth = s.hierarchical_view === 'yes' ? depthOf(heading) : top;
    while (stack.length > 1 && depth <= stack[stack.length - 1].depth) stack.pop();
    if (depth > stack[stack.length - 1].depth) {
      const parent = stack[stack.length - 1];
      let list = parent.item?.querySelector(':scope > ol.elementor-toc__list-wrapper');
      if (!list && parent.item) {
        list = document.createElement('ol');
        list.className = 'elementor-toc__list-wrapper';
        parent.item.append(list);
      }
      stack.push({ depth, list: list || parent.list, item: null });
    }

    const item = document.createElement('li');
    item.className = 'elementor-toc__list-item';
    const wrapper = document.createElement('div');
    wrapper.className = 'elementor-toc__list-item-text-wrapper';
    const link = document.createElement('a');
    link.href = `#${anchor.id}`;
    link.className = 'elementor-toc__list-item-text' + (depth === top ? ' elementor-toc__top-level' : '');
    link.textContent = heading.textContent.trim();
    wrapper.append(link);
    item.append(wrapper);
    stack[stack.length - 1].list.append(item);
    stack[stack.length - 1].item = item;
  });

  body.replaceChildren(root);

  if (!buttons.length) return;
  // The class alone does not hide the list: Elementor collapses it with jQuery's
  // slideUp, which leaves `display: none` inline. Live at 900px, the widget carries
  // `elementor-toc--collapsed` and its body computes to `display: none`; with the
  // class but no inline style it computes to `block` and the list stays open,
  // making the page 616px too tall on tablet.
  const setCollapsed = (collapsed) => {
    widget.classList.toggle('elementor-toc--collapsed', collapsed);
    if (collapsed) body.style.display = 'none';
    else body.style.removeProperty('display');
    for (const button of buttons) button.setAttribute('aria-expanded', String(!collapsed));
  };
  const minimizedOn = s.minimized_on || 'tablet';
  const startCollapsed = () => {
    if (s.minimize_box !== 'yes') return false;
    const mode = deviceMode();
    return minimizedOn === 'mobile' ? mode === 'mobile' : mode !== 'desktop';
  };
  setCollapsed(startCollapsed());
  for (const button of buttons) {
    const flip = () => setCollapsed(!widget.classList.contains('elementor-toc--collapsed'));
    button.addEventListener('click', flip);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Video widget
 *
 * Elementor renders an empty `<div class="elementor-video">` and its JS *replaces*
 * that node with the iframe — the iframe itself ends up carrying the class.
 * Nesting one inside instead breaks the aspect-ratio height chain and the video
 * collapses to ~150px (playbook §3.12).
 * ------------------------------------------------------------------ */
const YT_ID = (url) => {
  const m = /(?:youtu\.be\/|\/embed\/|[?&]v=|\/shorts\/)([A-Za-z0-9_-]{6,})/.exec(url || '');
  return m ? m[1] : null;
};

function ytEmbed(url, { privacy = true, autoplay = false, start = 0 } = {}) {
  const id = YT_ID(url);
  if (!id) return null;
  const host = privacy ? 'www.youtube-nocookie.com' : 'www.youtube.com';
  const params = new URLSearchParams({
    controls: '0', rel: '0', playsinline: '0', cc_load_policy: '0',
    autoplay: autoplay ? '1' : '0', enablejsapi: '1', origin: location.origin,
  });
  if (start) params.set('start', String(start));
  return `https://${host}/embed/${id}?${params}`;
}

function initVideo(widget) {
  const placeholder = widget.querySelector('.elementor-video');
  if (!placeholder || placeholder.tagName === 'IFRAME') return;
  const s = settingsOf(widget);
  const src = ytEmbed(s.youtube_url, { privacy: s.yt_privacy === 'yes' });
  if (!src) return;

  const iframe = document.createElement('iframe');
  iframe.className = 'elementor-video';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('title', 'YouTube video player');
  iframe.width = '640';
  iframe.height = '360';
  iframe.src = src;
  placeholder.replaceWith(iframe);
}

/* ------------------------------------------------------------------ *
 * Video playlist
 *
 * Contract off /testimonials/: the selected tab carries `e-active`,
 * `aria-selected="true"` and `tabindex="0"`; its panel carries `e-active` and
 * `display: block`, every other panel `display: none`. The iframe is built into a
 * panel the first time it is shown and then left in place — which is why the
 * inactive panels on production hold an empty `<div>`.
 * ------------------------------------------------------------------ */
function initVideoPlaylist(widget) {
  const tabs = [...widget.querySelectorAll('.e-tab-title')];
  const panels = [...widget.querySelectorAll('.e-tab-content')];
  if (!tabs.length || !panels.length) return;
  const entries = settingsOf(widget).tabs || [];

  const panelFor = (tab) => document.getElementById(tab.getAttribute('aria-controls'))
    || panels[tabs.indexOf(tab)];

  const fill = (tab, autoplay) => {
    const panel = panelFor(tab);
    const entry = entries[tabs.indexOf(tab)];
    if (!panel || !entry || panel.querySelector('iframe')) return;
    const src = ytEmbed(entry.youtube_url || entry.vimeo_url, { privacy: false, autoplay });
    if (!src) return;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('title', entry.title || 'YouTube video player');
    iframe.src = src;
    panel.replaceChildren(iframe);
  };

  const select = (tab, autoplay) => {
    for (const other of tabs) {
      const on = other === tab;
      other.classList.toggle('e-active', on);
      other.setAttribute('aria-selected', String(on));
      other.setAttribute('tabindex', on ? '0' : '-1');
    }
    for (const panel of panels) panel.classList.remove('e-active');
    fill(tab, autoplay);
    const active = panelFor(tab);
    for (const panel of panels) {
      if (!panel.querySelector('iframe')) continue;
      panel.style.display = panel === active ? 'block' : 'none';
    }
    if (active) {
      active.classList.add('e-active');
      active.style.display = 'block';
    }
    tab.classList.add('e-tab-title--watched');
  };

  const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
  select(initial, false);

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab, true));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(tab, true); }
    });
  }

  // The header caret collapses the list on the narrow layouts.
  const toggle = widget.querySelector('.e-tabs-toggle-videos-display-button');
  const wrap = widget.querySelector('.e-tabs-items-wrapper');
  toggle?.addEventListener('click', () => {
    const hidden = wrap.style.display === 'none';
    wrap.style.display = hidden ? '' : 'none';
    toggle.classList.toggle('rotate-down', hidden);
    toggle.classList.toggle('rotate-up', !hidden);
  });
}

/* ------------------------------------------------------------------ *
 * Section background slideshow (Ken Burns)
 *
 * The home page's hero and all seven location-page heroes are Elementor Pro
 * background slideshows, and every part of them is built by JS: the section's
 * markup carries only a `background_slideshow_gallery` array in `data-settings`.
 * Without this the heroes render as flat grey — which a computed-style diff keyed
 * on `backgroundColor` will happily call a match, and did until the harness
 * started comparing `backgroundImage` too.
 *
 * Contract off the live home page:
 *
 *   <div class="elementor-background-slideshow swiper swiper-fade swiper-initialized
 *               swiper-horizontal swiper-pointer-events swiper-rtl
 *               swiper-watch-progress swiper-backface-hidden" dir="rtl">
 *     <div class="swiper-wrapper" id="swiper-wrapper-…" aria-live="off"
 *          style="transition-duration: 0ms;">
 *       <div class="elementor-background-slideshow__slide swiper-slide …"
 *            data-swiper-slide-index="0" role="group" aria-label="1 / 3"
 *            style="width: 1440px; transition-duration: 0ms; opacity: 0;
 *                   transform: translate3d(0px, 0px, 0px);">
 *         <div class="elementor-background-slideshow__slide__image
 *                     elementor-ken-burns elementor-ken-burns--in"
 *              style="background-image: url(…)"></div>
 *
 * inserted as the section's first child. It is a fade carousel: all slides sit at
 * full width, stacked by `translate3d(index * width)`, and only the active one has
 * `opacity: 1`. Looping duplicates the whole gallery on each side (3 images → 9
 * slides).
 *
 * The Ken Burns zoom is pure CSS and hangs off one class:
 *   .elementor-ken-burns                      { transition: transform 10s linear }
 *   .elementor-ken-burns--active              { transition-duration: 20s }
 *   .elementor-ken-burns--active.--in         { transform: scale(1.3) }
 *   .elementor-ken-burns--active.--out        { transform: scale(1) }
 * so the only job here is to move `--active` onto the current slide's image.
 * ------------------------------------------------------------------ */
function initBackgroundSlideshow(section) {
  const s = settingsOf(section);
  const gallery = s.background_slideshow_gallery;
  if (!Array.isArray(gallery) || !gallery.length) return;
  if (section.querySelector(':scope > .elementor-background-slideshow')) return;

  const total = gallery.length;
  const slideDuration = Number(s.background_slideshow_slide_duration) || 5000;
  const transition = Number(s.background_slideshow_transition_duration) || 500;
  const loop = s.background_slideshow_loop === 'yes';
  const kenBurns = s.background_slideshow_ken_burns === 'yes';
  const zoom = s.background_slideshow_ken_burns_zoom_direction === 'out' ? 'out' : 'in';

  const root = document.createElement('div');
  root.className = 'elementor-background-slideshow swiper swiper-fade swiper-initialized '
    + 'swiper-horizontal swiper-pointer-events swiper-rtl swiper-watch-progress swiper-backface-hidden';
  root.setAttribute('dir', 'rtl');

  const wrapper = document.createElement('div');
  wrapper.className = 'swiper-wrapper';
  wrapper.id = `swiper-wrapper-${Math.random().toString(16).slice(2, 18)}`;
  wrapper.setAttribute('aria-live', 'off');
  wrapper.style.transitionDuration = '0ms';

  const makeSlide = (entry, index, duplicate) => {
    const slide = document.createElement('div');
    slide.className = 'elementor-background-slideshow__slide swiper-slide'
      + (duplicate ? ' swiper-slide-duplicate' : '');
    slide.dataset.swiperSlideIndex = String(index);
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', `${index + 1} / ${total}`);
    const image = document.createElement('div');
    image.className = 'elementor-background-slideshow__slide__image'
      + (kenBurns ? ` elementor-ken-burns elementor-ken-burns--${zoom}` : '');
    image.style.backgroundImage = `url("${entry.url}")`;
    slide.append(image);
    return slide;
  };

  const before = loop ? gallery.map((e, i) => makeSlide(e, i, true)) : [];
  const real = gallery.map((e, i) => makeSlide(e, i, false));
  const after = loop ? gallery.map((e, i) => makeSlide(e, i, true)) : [];
  wrapper.append(...before, ...real, ...after);
  root.append(wrapper);
  section.prepend(root);

  const slides = [...wrapper.children];
  let realIndex = 0;
  let activeIndex = before.length;

  const paint = (ms) => {
    const width = section.clientWidth;
    slides.forEach((slide, i) => {
      const on = i === activeIndex;
      slide.style.cssText = `width: ${width}px; transition-duration: ${ms}ms; opacity: ${on ? 1 : 0}; `
        + `transform: translate3d(${i * width}px, 0px, 0px);`;
      slide.classList.toggle('swiper-slide-active', on);
      slide.classList.toggle('swiper-slide-visible', on);
      slide.classList.toggle('swiper-slide-prev', i === activeIndex - 1);
      slide.classList.toggle('swiper-slide-next', i === activeIndex + 1);
      const image = slide.firstElementChild;
      if (kenBurns) image.classList.toggle('elementor-ken-burns--active', on);
    });
  };

  paint(0);

  if (total > 1 && !reduceMotion) {
    setInterval(() => {
      activeIndex += 1;
      realIndex = (realIndex + 1) % total;
      if (activeIndex >= slides.length) activeIndex = loop ? before.length : slides.length - 1;
      paint(transition);
    }, slideDuration);
  }

  window.addEventListener('resize', () => paint(0));
}

/* ------------------------------------------------------------------ *
 * Section background video
 *
 * /book-an-appointment/'s hero sets `background_background: video` with a YouTube
 * link and `background_video_start: 10`. Elementor injects the player into
 * `.elementor-background-video-container`, muted and looping; the compiled CSS
 * already sizes that container.
 * ------------------------------------------------------------------ */
function initBackgroundVideo(section) {
  const s = settingsOf(section);
  if (s.background_background !== 'video' || !s.background_video_link) return;
  const container = section.querySelector('.elementor-background-video-container');
  if (!container || container.querySelector('iframe')) return;
  const id = YT_ID(s.background_video_link);
  if (!id) return;

  const params = new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', showinfo: '0', modestbranding: '1',
    rel: '0', disablekb: '1', playsinline: '1', loop: '1', playlist: id,
    start: String(Number(s.background_video_start) || 0),
    enablejsapi: '1', origin: location.origin,
  });
  const iframe = document.createElement('iframe');
  iframe.className = 'elementor-background-video-embed';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'autoplay; encrypted-media');
  iframe.setAttribute('title', 'Background video');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.src = `https://www.youtube.com/embed/${id}?${params}`;
  container.append(iframe);
}

/* ------------------------------------------------------------------ *
 * Entrance animations
 *
 * Elementor renders the element with `elementor-invisible` and swaps in
 * `animated <name>` when it scrolls into view; the keyframes live in
 * animations.min.css. Three sections on /book-an-appointment/ use `fadeInDown`.
 * With reduced motion the class is applied immediately and the animation is a
 * no-op, which is what matters — the element must never stay invisible.
 * ------------------------------------------------------------------ */
function initEntranceAnimations() {
  const targets = [...document.querySelectorAll('.elementor-invisible[data-settings]')]
    .filter((el) => settingsOf(el).animation || settingsOf(el)._animation);
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
 * Motion FX (scrolling translate)
 *
 * Three service pages give a widget `motion_fx_motion_fx_scrolling: yes`. Only the
 * vertical-translate effect is configured on this site; Elementor drives it from
 * the element's progress through the viewport, and writes the result as an inline
 * `transform` on `.elementor-widget-container`.
 * ------------------------------------------------------------------ */
function initMotionFx() {
  const targets = [...document.querySelectorAll('[data-settings]')].filter((el) => {
    const s = settingsOf(el);
    return s.motion_fx_motion_fx_scrolling === 'yes' && s.motion_fx_translateY_effect === 'yes';
  });
  if (!targets.length || reduceMotion) return;

  const update = () => {
    for (const el of targets) {
      const s = settingsOf(el);
      const devices = s.motion_fx_devices || ['desktop', 'tablet', 'mobile'];
      const inner = el.querySelector('.elementor-widget-container') || el;
      if (!devices.includes(deviceMode())) { inner.style.removeProperty('transform'); continue; }

      const rect = el.getBoundingClientRect();
      // Elementor's progress: 0 when the element's top hits the bottom of the
      // viewport, 1 when its bottom hits the top.
      const span = window.innerHeight + rect.height;
      const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / span));
      const range = s.motion_fx_translateY_speed?.size ?? 4;
      inner.style.transform = `translateY(${((progress - 0.5) * range * 10).toFixed(2)}px)`;
    }
  };

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

/* ------------------------------------------------------------------ *
 * Billing form total
 *
 * Our replacement for WPForms form 3051 keeps the original's two-field
 * arrangement: an "Amount Requested" input and a read-only "Total" that WPForms'
 * frontend bundle recomputed on every keystroke. Reproduced here so the field is
 * not permanently stuck at $0.00.
 * ------------------------------------------------------------------ */
function initBillingTotal() {
  for (const form of document.querySelectorAll('form.gm-form__form[data-variant="billing"]')) {
    const amount = form.querySelector('[name="amount_requested"]');
    const display = form.querySelector('[data-total-display]');
    const value = form.querySelector('[data-total-value]');
    if (!amount || !display || !value) continue;

    const sync = () => {
      const parsed = Number(String(amount.value).replace(/[^0-9.]/g, ''));
      const total = Number.isFinite(parsed) ? parsed : 0;
      display.textContent = `$ ${total.toFixed(2)}`;
      value.value = `$${total.toFixed(2)}`;
    };
    amount.addEventListener('input', sync);
    form.addEventListener('gm:reset', () => setTimeout(sync, 0));
    sync();
  }
}

/* ------------------------------------------------------------------ *
 * Trailing nodes
 *
 * Elementor appends two elements to <body> on init:
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
  'archive-posts.archive_cards': initPostsGrid,
  'posts.cards': initPostsGrid,
  'testimonial-carousel.default': initElementorCarousel,
  'reviews.default': initElementorCarousel,
  'eael-team-member-carousel.default': initEaelCarousel,
  'eael-adv-accordion.default': initEaelAccordion,
  'table-of-contents.default': initToc,
  'video.default': initVideo,
  'video-playlist.default': initVideoPlaylist,
};

function initWidgets(root) {
  for (const [type, init] of Object.entries(WIDGETS)) {
    for (const widget of root.querySelectorAll(`[data-widget_type="${type}"]`)) {
      try { init(widget); } catch (error) { console.error(`[elementor] ${type}`, error); }
    }
  }
  for (const section of root.querySelectorAll('.elementor-section[data-settings], .elementor-element[data-settings]')) {
    try { initBackgroundVideo(section); } catch (error) { console.error('[elementor] bg video', error); }
    try { initBackgroundSlideshow(section); } catch (error) { console.error('[elementor] bg slideshow', error); }
  }
}

onReady(() => {
  initEnvironment();
  initLazyBackgrounds();
  initSticky();
  initWidgets(document);
  initAnchors();
  initEntranceAnimations();
  initMotionFx();
  initBillingTotal();
  initTrailingNodes();
});
