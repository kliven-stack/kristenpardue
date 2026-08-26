# kristenpardue.com — Astro clone

A static Astro rebuild of the WordPress/Elementor site at
<https://kristenpardue.com> (Kristen Pardue — health coaching, essential oils,
speaking). 177 routes, cloned from the live site's own HTML and its compiled
Elementor CSS, verified by measured computed-style diffs against production at
1440 / 900 / 390 px.

Built to the team's [migration playbook](../MIGRATION-PLAYBOOK.md). Stack: Astro 5
`output: 'static'`, Tailwind v4 for our own components only, no UI framework, no
serverless runtime.

What is in the 177:

| | |
| --- | --- |
| 40 | pages (everything in Yoast's `page-sitemap.xml`) |
| 82 | posts |
| 15 | category archives, plus 22 pages of their pagination |
| 1 | author archive, plus 6 pages of its pagination |
| 1 | blog index, plus 9 pages of its pagination |
| 1 | the theme's own 404 template |

Every URL in all four of Yoast's sitemaps is built. So is `/essential-oils/`,
which is a real page that no sitemap lists.

---

## Quick start

```bash
npm install
npm run dev                     # http://localhost:4321

npm run build                   # → dist/
npm run serve                   # serves dist/ on :4331, honouring vercel.json redirects
```

Verification (build and serve first):

```bash
npm run compare                 # computed-style diff vs production at 3 widths
npm run functional              # behavioural checks
npm run audit                   # every internal href/src/url() resolves in dist/
```

Re-crawling the source site:

```bash
npm run crawl                   # → _extract/html/  (FORCE=1 to refetch)
npm run css                     # → public/wp/css/  (every stylesheet handle)
npm run fonts                   # → public/wp/fonts/ (self-hosted Google families)
npm run extract                 # → src/fragments/, src/data/pages.json
npm run media                   # → public/wp-content/ (images, PDFs)
npm run strip                   # lossless: drops runaway XMP from the JPEGs
npm run images                  # re-encodes the uploads in place, same dimensions
```

`npm run media` re-downloads the originals, so run `npm run strip` and
`npm run images` after it or the mirrored uploads gain their weight back.

Two more, for reading the live site rather than the clone:

```bash
npm run inspect -- / /blog/     # dumps the live post-init DOM + the contracts we match
npm run form:inspect            # reads both third-party form widgets' real field sets
```

---

## How the clone works

The pages are **ported, not rebuilt**. `scripts/extract.mjs` splits each crawled
page into header / content / footer / popup fragments of Elementor's own rendered
markup, rewrites URLs to be root-relative, and records the page's metadata and its
ordered stylesheet list. One dynamic route (`src/pages/[...slug].astro`) renders
all 177 routes from `src/data/pages.json`, re-linking Elementor's compiled per-post
CSS in exactly the order WordPress emitted it. That cascade is what makes the clone
pixel-accurate, so it ships verbatim rather than being re-derived.

What is *not* ported is the JavaScript. `src/scripts/elementor.js` (~1,100 lines)
replaces jQuery, elementor-frontend, elementor-pro-frontend, smartmenus,
jquery.sticky, Swiper, the Essential Addons bundle, the Ultimate Addons bundle and
the Gravity Forms frontend bundle. It does not re-invent their behaviour; it
reproduces the **DOM contract** they created — the classes, inline styles and
injected nodes the compiled stylesheets and the layout depend on (playbook §3.12).
Every contract was read off the live site's post-init DOM with the probes in
`_extract/probe/`, then diffed against the served HTML.

The pieces it drives:

| Widget | What the runtime has to reproduce |
| --- | --- |
| Sticky header | `.header-mainmenu` pins from the first paint (it is the first thing in the document), with the visibility-hidden spacer clone and the inline `position: fixed; width; top` Elementor writes |
| Nav menu | SmartMenus' real options — 250 ms show, **500 ms hide** (playbook §3.11), `hideOnClick`, and the touch two-tap — plus its `has-submenu` / `aria-*` annotations and the stretched burger panel |
| Carousels | four, across three skins: two testimonial carousels, one media carousel (`carousel` skin) and one `slideshow` skin, which is a one-up stage plus a linked thumbnail strip |
| Posts grids | `elementor-has-item-ratio` on all 57 widgets, plus the per-image `elementor-fit-height` decision |
| Toggles | `/faq/` and `/get-essential-oils/` — open writes `display: block` inline, close removes it |
| Search | the header magnifier's full-screen overlay |
| Countdowns | two Ultimate Addons timers, in opposite states — see bug 12 |
| Popups | all three templates, parked in `<template>` so the pre-open document matches production's (which carries zero `[data-elementor-type="popup"]` nodes), with the page-load trigger's 1 s delay and its once-per-visitor cap in the same `localStorage` key Elementor uses |
| Entrance animations | 251 elements ship `elementor-invisible`; without the observer they stay invisible forever |

### Layout

`src/`

```
components/ContactForm.astro   our static replacement for the two third-party embeds
components/PageContent.astro   renders a fragment, swapping a marked embed for the above
layouts/BaseLayout.astro       <head> cascade, body classes, popup <template>s
lib/pages.ts                   pages.json + the raw fragments, as one API
lib/fixes.ts                   corrections to the original's own bugs — off by default
scripts/elementor.js           the runtime described above
data/pages.json                one record per route: path, title, SEO head, css order…
fragments/*.html               Elementor's rendered markup, verbatim
```

`public/wp/css/` holds every stylesheet handle the WordPress pages linked, under
its WordPress handle name; `public/wp-content/` mirrors the uploads at their
original paths, so every `srcset` entry and every `url()` in the compiled CSS keeps
working unchanged.

---

## Forms

Five forms, and they are not all the same problem (playbook §4b).

**Two are third-party embeds with no design in the served HTML.** There is nothing
to clone — only a dependency:

| | |
| --- | --- |
| `/contact-me/` | ActiveCampaign form 5. An empty `<div class="_form_5">` plus a loader from `kristenpardue16396.activehosted.com` that builds the whole form in the browser. |
| popup 2995 | A LeadConnector ("Trustymail") iframe, form `FMxAdmW9fwWIvqjnE8bk`, "Subscribe - BSC" — opened a second after load on every page. |

`scripts/extract.mjs` marks both, and `PageContent.astro` swaps them for
`ContactForm.astro` — a fully static form that POSTs `FormData` straight to
`PUBLIC_CONTACT_ENDPOINT` — **once that endpoint is configured**. Until then both
originals ship untouched: ActiveCampaign and GoHighLevel host them, so they keep
working after cutover; they just stop being ours to route. Shipping a form that
posts nowhere would be strictly worse.

Both field sets were **measured, not guessed** — `npm run form:inspect` drives the
live pages in headless Chrome and reads each widget's own document:

* contact — First Name / Last Name / Email\* / Phone, a three-option "I have a
  question about…" select, and a Message box; 39 px rows on white, 1 px `#979797`
  at 4 px radius, IBM Plex Sans 14, over a `#FFC1B8` Submit.
* subscribe — Full Name / Email\* / Phone; 55 px rows, transparent on a 2 px
  `#FFC1B8` border at 0 radius, Roboto 14, over a 51 px `#FFC1B8` Submit.

**Three are rendered by WordPress, in full, with their own stylesheets** — so they
*do* have a design, and cloning it is the job:

| | |
| --- | --- |
| `/foundations-health-program-registration/` | Gravity Forms 8 — 13 fields |
| `/patient-wellness-intake/` | Gravity Forms — 40 fields, styled by the UAEL GF styler |
| `/foundations-old/` | Gravity Forms 2 — 2 fields |

Their markup ships verbatim. Only their destination moves: `initHostedForms()` in
`src/scripts/elementor.js` repoints the `action` at `PUBLIC_CONTACT_ENDPOINT` and
intercepts the submit, keeping Gravity's own honeypot field. Without an endpoint
they are left exactly as WordPress serves them — which means they stop working on
cutover, and the client needs to know that.

There is a fourth WordPress-rendered form, an Elementor Pro form on
`/elementor-3137/`, handled the same way. That page is an unfinished draft (bug 8).

No payment gateway is loaded anywhere on this site, so no form here collects card
details, and none must be given one without a real gateway behind it.

---

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `PUBLIC_CONTACT_ENDPOINT` | *(empty)* | Growthmap lead endpoint. Empty = keep the originals. |
| `PUBLIC_SITE_URL` | `https://kristenpardue.com` | Canonical origin; templated into Yoast's block. |
| `PUBLIC_FORM_MODE` | `growthmap` | `embed` forces the originals even with an endpoint set. |
| `PUBLIC_WEBFONTS` | `on` | Link the five self-hosted Google families. |
| `PUBLIC_ANALYTICS` | `on` | Inert here — this site carries no tags (bug 14). |
| `PUBLIC_CHAT_WIDGET` | `on` | Inert here — no chat widget on this site. |
| `PUBLIC_APPLY_FIXES` | *(off)* | Build with the corrections in `src/lib/fixes.ts` applied. |

`npm run compare` and `npm run functional` build with `PUBLIC_ANALYTICS=off`.

---

## Original-site bugs

The clone reproduces production exactly, defects included (playbook §2). Everything
below is **on the WordPress site**, not introduced here. Nothing in this list is
fixed in the default build; where a fix exists it is in `src/lib/fixes.ts` behind
`PUBLIC_APPLY_FIXES=on`, and where it needs a decision only the client can make, it
says so.

### Reproduced as-is

**1. The site's script font never loads — mixed content.** Elementor's compiled kit
CSS declares

```css
@font-face { font-family: 'BrittanySignature';
             src: url('http://kristenpardue.com/…/BrittanySignature.ttf') }
```

on a site served over `https://`. A font is mixed *active* content, so Chrome
blocks the request outright and every heading that asks for the family falls back
to the next one in its stack. It affects `/foundations/` and post 17. The clone
keeps the insecure spelling deliberately — that is what makes the block happen, and
it reproduces on any host because the block is at the URL, not the response.
*Fix ready:* `FIX_CSS` in `src/lib/fixes.ts` re-declares the face from this origin
(the file is already mirrored). It changes what those two pages look like, which is
why it is opt-in.

**2. Seven more `http://` asset URLs in the compiled CSS, and 34 in post content.**
Six background images (`bg.jpg`, `diagonal-noise.png`, `gray.jpg`,
`new-brash-gray2.png`, two `kristen-pardue_light-pink*.jpg`) plus 34 images and one
PDF link inside posts. These are mixed *passive* content, which current browsers
auto-upgrade, so they render on production and they render here — but any browser
that blocks rather than upgrades loses them. All are mirrored under `public/`, so
the upgraded request is served locally once the domain points at the clone.

**3. Yoast's sitemap index advertises itself over `http://`.** `sitemap_index.xml`
points at `http://kristenpardue.com/post-sitemap.xml` and the four child maps list
all 138 URLs the same way. This is the one defect the clone does **not** reproduce:
a sitemap is machine-facing infrastructure with no design consequence, and
`@astrojs/sitemap` writes `https://`. Worth knowing because it is a symptom — the
WordPress site's `home`/`siteurl` options are almost certainly still `http://`,
which is where bugs 1 and 2 come from too.

**4. A schemeless outbound link 404s.** "GMOs: How they're destroying your health"
links `href="www.pbs.org/pov/foodinc/"` with no scheme, so the browser resolves it
against the current post's directory and lands on
`/physical-health/nutrition/www.pbs.org/pov/foodinc/`, which is a 404 on WordPress.
*Fix ready* in `src/lib/fixes.ts`.

**5. The Essential Oils page's pagination is broken.** `/essential-oils/` carries a
posts widget whose "Page 2 / 3 / 4" links point at `/essential-oils/page/2/` and
friends — all three 404 on WordPress, because `/essential-oils/` is a *page* while
`/essential-oils/<slug>/` is the permalink prefix for 30 posts. Reproduced as-is;
fixing it means either moving those posts or replacing that widget, which is a
content decision.

**6. Five posts link a dead permalink.** `/my-story/my-story-of-healing-revised/`
is linked as "my story of healing" from five posts and 404s on WordPress. The nine
*other* old `/my-story/`, `/health/` and `/healthy-diet/` permalinks do resolve,
via WordPress redirects, and `vercel.json` reproduces all nine.

**7. WooCommerce is switched off but its pages still advertise it.** `/checkout/`
renders the literal text `[woocommerce_checkout]` and `/my-account/` the literal
`[woocommerce_my_account]` — unparsed shortcodes, printed to the visitor. `/shop/`
renders a title and nothing else. The eight `/favorite-products/*` sub-pages each
render "No products found." Reproduced verbatim. **Client decision:** either bring
the store back or retire these twelve URLs.

**8. Four orphaned drafts are published and indexed.** `/elementor-3137/` (named
after its own post id, containing a hand-copied header and an unfinished Elementor
Pro form), `/foundations-old/`, `/schedule/` and `/30-days-health-follow-up/`.
Nothing links to any of them; Yoast lists all four. *Fix ready:* `fixPageMeta()`
marks them `noindex, nofollow`. **Client decision:** delete or finish.

**9. Thirty of the 177 routes have no inbound link anywhere on the site.** Beyond
bug 8's four, that includes all eight `/favorite-products/*` sub-pages, the six
booking pages (`/15-min-speaking-inquiry/`, `/30-min-essential-oils-call/`,
`/60-min-essential-oils/`, `/60-min-person-consultation/`,
`/30-days-health-initial/`, `/book-online-consultation/`), `/foundations/`,
`/foundations-health-program-registration/`, `/gi-mapping/`,
`/patient-wellness-intake/`, `/detox-your-home/`, `/links/`, `/scheduling/` and the
three WooCommerce pages. `/favorite-products/` itself is reachable and contains
exactly one link — a button that opens a popup — so its eight children are
unreachable by navigation. All are cloned and all resolve; they are simply
invisible. **Client decision:** link them or retire them.

**10. The stretched mobile menu panel hangs 10 px off the left edge.** Above 767 px
Elementor anchors the burger panel to the toggle, which sits 10 px inside the
widget, so the full-width panel starts at `x = -10`. At 390 px the two coincide and
it is flush. Reproduced exactly — the functional suite asserts `x = -10` at 900 and
768, and `x = 0` at 390, so a future "fix" cannot land silently.

**11. A popup nothing can open.** Popup 3170 ("Thank You! Someone will be
contacting you shortly.") has `triggers: []`, and no `#elementor-action:` link on
the site targets it. It is presumably meant to be the subscribe form's confirmation
— but that form is inside a cross-origin iframe, which cannot open it. Cloned;
never opens. **Client decision:** wire it up or delete it.

**12. An expired countdown.** `/foundations/` counts down to 2023-02-28 with
`expire-action: hide`, so production paints nothing there — the widget stays in the
document at zero height. The clone hides it identically (a clone that showed four
zeroes would be taller than production by the timer's height). `/foundations-old/`
carries an *evergreen* timer that still runs, on a page nothing links to.

**13. The hidden timeline.** The Ultimate Addons timeline on `/gi-mapping/` carries
`elementor-hidden-desktop elementor-hidden-tablet elementor-hidden-phone` — hidden
at every breakpoint, so it never renders anywhere. Cloned as-is.

**14. No analytics at all.** No Google Tag Manager container, no GA4 property, no
Ads tag, no Meta pixel — the only tracking on the site is ActiveCampaign's own
WordPress plugin, which dies with the install. This is not a migration loss (there
is nothing to lose) but the client should be told before cutover, because the
cutover is the natural moment to add measurement.

**15. Two plugin assets 404 on production.** The AAWP plugin's stylesheet points at
`img/stars/wayl-inverted.svg` and `wayl-inverted-active.svg`, neither of which is in
the plugin's build. Nothing on the site uses that rating style, so nothing renders
differently. `scripts/audit.mjs` records both as known-broken.

**16. Ten pages share one `<title>`.** The blog index and its nine pagination pages
are all "Blog - Kristen Pardue" with the same meta description; two category
archives and two Foundations pages likewise pair up. *Fix ready:* `fixPageMeta()`
marks every paginated archive `noindex, follow`.

**17. 159 of 177 routes have no meta description.** Yoast writes one for 18 pages
and leaves the rest to Google. Reproduced as-is; writing 159 descriptions is
copywriting, not migration.

### Not reproduced

Three deviations, each deliberate and each an improvement with no design
consequence:

* **Google Fonts are self-hosted.** Production links `fonts.googleapis.com` five
  times per page, once per family (Montserrat, Oswald, Poiret One, Raleway,
  Sacramento), each asking for all nine weights *and* their italics with
  `display=auto` — a render-blocking third-party round trip, and in Chrome
  `display: auto` means `block`, so up to three seconds of invisible text.
  `scripts/build-fonts.mjs` mirrors the woff2 files at build time, keeps the latin
  and latin-ext subsets only, writes `font-display: swap`, and `BaseLayout`
  preloads the two faces above the fold. Same files, same metrics, 449 KB, no
  third-party connection.
* **The sitemap is `https://`** — bug 3.
* **`/blog/page/2/` is a redirect, not a page.** WordPress answers 200 on it, but
  the blog's own pagination links `/blog/2/` and Yoast canonicalises both to
  `/blog/`, so building it would ship a byte-identical duplicate. `vercel.json`
  redirects `/blog/page/:n` → `/blog/:n/`.

### Known functional loss on cutover

* **Site search stops returning results.** The header magnifier is a plain
  `GET /?s=…`, which a static host cannot answer. The overlay, its markup and its
  focus behaviour are all reproduced; only the results page is gone. If the client
  wants search back, the options are a build-time index (Pagefind is the obvious
  one — it indexes `dist/` after the build and needs no runtime) or removing the
  magnifier. This needs a decision before cutover, not after.
* **The three Gravity Forms and the Elementor Pro form stop delivering** until
  `PUBLIC_CONTACT_ENDPOINT` is set — see [Forms](#forms).

---

## Verification

Measured, not eyeballed (playbook §2). `scripts/compare.mjs` loads the same page
from production and from `dist/` at 1440 / 900 / 390 px and diffs bounding boxes and
computed styles element by element — matched by Elementor's stable `data-id`, plus a
document-order sweep of every text leaf, plus the page's own scroll height.
Tolerance is 3 px on position and size; typography, colour, background image,
padding, margin, alignment, display and rendered text must match exactly.

Both sides get the same treatment: the third-party form hosts are blocked (they
reset headless traffic at random and render differently run to run), the carousels
are pinned to loop index 0, the page-load popup is dismissed, `document.fonts.ready`
is awaited, and the page is scrolled to the bottom and back so every lazy image and
entrance animation has settled.

### Where it got to

*(filled in below from the final run)*

---

## Deployment

Import the repo at vercel.com/new. With `output: 'static'` and the config in this
repo it deploys with zero settings — no adapter, no serverless function, no
database. `vercel.json` carries the security headers and every redirect production
answers.

Before the domain is cut over:

1. Set `PUBLIC_CONTACT_ENDPOINT` in the Vercel project (Production + Preview) and
   redeploy — without it the two embeds stay and the four WordPress-hosted forms go
   dark on cutover.
2. Have a human submit each form once end to end (playbook §1 step 6).
3. Decide the six client questions in the bug register above: the WooCommerce
   pages, the four orphaned drafts, the thirty unlinked routes, the dead popup, the
   broken Essential Oils pagination, and whether site search should come back.
4. Point the domain at Vercel (playbook §8). `astro.config.mjs`'s `site:` is
   already the production URL, which the canonical tags depend on.
