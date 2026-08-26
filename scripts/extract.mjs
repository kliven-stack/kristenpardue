// Split every crawled WordPress page into the pieces Astro re-assembles:
//   header / content / footer fragments, the ordered stylesheet list, and page metadata.
// Fragments keep Elementor's rendered markup verbatim (minus WordPress JS); only URLs
// are rewritten to be root-relative so the clone serves its own assets.
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const HTML = path.join(ROOT, '_extract/html');
const FRAG = path.join(ROOT, 'src/fragments');
const CSSDIR = path.join(ROOT, 'public/wp/css');
const ORIGIN = 'https://kristenpardue.com';
const ORIGIN_ESC = 'https:\\/\\/kristenpardue.com';
// The same host over http. Eight url() targets in the compiled CSS and 34 URLs in
// the post content are spelled this way on an https site; see rewriteUrl().
const INSECURE_ORIGIN = 'http://kristenpardue.com';

/**
 * Forms are shipped as WordPress serves them. Nothing here replaces one.
 *
 * Five forms, three kinds, and the reason none of them is rebuilt:
 *
 *   iframe embeds   Elementor popup 2995 holds a LeadConnector ("Trustymail")
 *                   iframe, form FMxAdmW9fwWIvqjnE8bk ("Subscribe - BSC"), and the
 *                   booking pages hold five more from links.sybrware.com. GoHighLevel
 *                   hosts them, so they outlive the WordPress install untouched —
 *                   the iframe *is* the form, and the right thing to do with it is
 *                   keep it. Their `form_embed.js` loader is kept with them (see the
 *                   script rule in cleanFragment): it is what posts the rendered
 *                   height back to the parent, and without it the iframe keeps the
 *                   fixed height the markup gives it and the form is cut off.
 *
 *   script embed    /contact-me/ carries ActiveCampaign form 5 — an empty
 *                   `<div class="_form_5">` plus a loader from
 *                   kristenpardue16396.activehosted.com that builds the form in the
 *                   browser. Also third-party hosted, also kept verbatim.
 *
 *   WordPress       three Gravity Forms — form 8 on
 *                   /foundations-health-program-registration/, form 2 on
 *                   /foundations-old/ and the 40-field intake form on
 *                   /patient-wellness-intake/ — plus an Elementor Pro form on the
 *                   /elementor-3137/ draft. These are rendered server-side with
 *                   their own stylesheets, so their markup is cloned exactly; but
 *                   they POST to WordPress, so they stop delivering on cutover.
 *                   That is called out in the README rather than papered over.
 */

// Hosts whose assets we mirror into public/ so the clone has no third-party image
// deps. This site references none — every image is on the WordPress origin.
const MIRRORED_HOSTS = new Set();
const extPath = (u) => '/wp/ext/' + new URL(u).host + new URL(u).pathname;

await rm(FRAG, { recursive: true, force: true });
await mkdir(FRAG, { recursive: true });

const assets = new Set();

/**
 * Rewrite one URL-ish attribute value; records any asset that must be mirrored.
 *
 * `http://` spellings of our own host are recorded but deliberately left alone —
 * see the note in scripts/fetch-css.mjs. Thirty-four of them are in this site's post
 * content (images, srcset candidates and one PDF link) and they are mixed *passive*
 * content, which every current browser auto-upgrades, so they render on production
 * and they render here. Keeping the spelling means the clone is wrong in exactly
 * the same places production is, on any browser that blocks instead of upgrading;
 * mirroring the bytes anyway means the upgraded request is served from public/
 * once the domain points here.
 */
function rewriteUrl(value) {
  if (!value) return value;
  const v = value.trim();
  if (v.startsWith(ORIGIN)) {
    const u = new URL(v);
    if (u.pathname.startsWith('/wp-content/') || u.pathname.startsWith('/wp-includes/')) assets.add(u.href);
    // /feed/ and wp-json are WordPress-only endpoints; drop them at the callsite instead.
    return u.pathname + u.search + u.hash;
  }
  if (v.startsWith(INSECURE_ORIGIN)) {
    const u = new URL(v);
    if (u.pathname.startsWith('/wp-content/') || u.pathname.startsWith('/wp-includes/')) {
      assets.add(ORIGIN + u.pathname + u.search);
    }
    return value;
  }
  if (/^https?:\/\//.test(v)) {
    try {
      const u = new URL(v);
      if (MIRRORED_HOSTS.has(u.host)) { assets.add(u.href); return extPath(u.href); }
    } catch { /* not a URL */ }
  }
  return value;
}

const rewriteSrcset = (v) => v.split(',').map((part) => {
  const s = part.trim();
  const sp = s.lastIndexOf(' ');
  if (sp === -1) return rewriteUrl(s);
  return rewriteUrl(s.slice(0, sp)) + s.slice(sp);
}).join(', ');

const URL_ATTRS = ['src', 'href', 'data-src', 'poster', 'content', 'data-thumb', 'data-thumbnail', 'action'];

function cleanFragment($, $el, gfLogic = []) {
  // Scripts inside the ported markup are WordPress and Elementor plumbing that
  // src/scripts/elementor.js replaces — with two exceptions kept verbatim, both
  // marked below.
  $el.find('script').each((i, el) => {
    const $s = $(el);
    const src = $s.attr('src');
    const type = ($s.attr('type') || '').toLowerCase();

    // Structured data. Yoast writes the head's graph; anything down here is
    // content the client put in an Elementor HTML widget, not plumbing.
    if (type === 'application/ld+json') return;

    if (!src || src.startsWith('data:')) { $s.remove(); return; }

    // Third-party embeds that outlive WordPress keep their URLs. Two of them here:
    // ActiveCampaign's form loader on /contact-me/, which sits inside the marked
    // region above and so ships only while that embed does, and ThriveCart's
    // checkout loader on /gi-mapping/. Mirroring either would not remove a
    // dependency, only add a copy that goes stale.
    //
    // The `//host/path` spelling has to be handled here and not fall through to the
    // same-origin branch below. ThriveCart's is written that way, and treating it as
    // one of WordPress's own bundles dropped it — which cost the "GET STARTED"
    // button the stylesheet that loader injects, leaving it an unstyled inline link
    // 5px short of production's. The 900px comparison is what caught it.
    if (/^(https?:)?\/\//.test(src) && !src.startsWith(ORIGIN)) return;

    // Same-origin scripts are WordPress's own bundles (jQuery, Elementor, Elementor
    // Pro, smartmenus, jquery.sticky, Swiper, Essential Addons, Ultimate Addons,
    // Gravity Forms); src/scripts/elementor.js reproduces the DOM contracts they
    // created.
    $s.remove();
  });
  // Stylesheets are collected separately, in document order, and re-linked from
  // <head> — including the per-widget <style> blocks Essential Addons prints
  // inline. Leaving the originals here would duplicate every rule.
  $el.find('link[rel="stylesheet"], style').remove();

  $el.find('[src], [href], [data-src], [poster], [data-thumb], [data-thumbnail], [srcset], [data-settings], [data-elementor-lightbox-slideshow], [action]').addBack().each((i, el) => {
    const $e = $(el);
    for (const a of URL_ATTRS) {
      const v = $e.attr(a);
      if (v && (v.startsWith('http') || v.startsWith('//'))) $e.attr(a, rewriteUrl(v));
    }
    for (const a of ['srcset', 'data-srcset', 'imagesrcset']) {
      const v = $e.attr(a);
      if (v) $e.attr(a, rewriteSrcset(v));
    }
    // Elementor stores widget config as a JSON blob (background videos, lightbox
    // slideshows). URLs in there are JSON-escaped, so match both spellings.
    for (const a of ['data-settings', 'data-elementor-lightbox-slideshow']) {
      let v = $e.attr(a);
      if (!v) continue;
      const before = v;
      v = v.split(ORIGIN_ESC).join('').split(ORIGIN).join('');
      if (v !== before) $e.attr(a, v);
      for (const m of v.matchAll(/\\?\/wp-content[^"'& ]+?\.(?:mp4|webm|mov|jpe?g|png|webp|gif|svg)/gi)) {
        assets.add(ORIGIN + m[0].replace(/\\/g, ''));
      }
    }
  });
  // Inline style="...url(...)..." backgrounds
  $el.find('[style]').addBack().each((i, el) => {
    const $e = $(el);
    const s = $e.attr('style');
    if (s && s.includes(INSECURE_ORIGIN)) {
      for (const m of s.matchAll(new RegExp(INSECURE_ORIGIN.replace(/\./g, '\\.') + '[^)\\s"\']*', 'g'))) {
        assets.add(ORIGIN + m[0].slice(INSECURE_ORIGIN.length));
      }
    }
    if (s && s.includes(ORIGIN)) {
      for (const m of s.matchAll(new RegExp(ORIGIN.replace(/\./g, '\\.') + '[^)\\s"\']*', 'g'))) assets.add(m[0]);
      $e.attr('style', s.split(ORIGIN).join(''));
    }
  });
  // Gravity Forms' conditional logic, rescued from the inline script we drop.
  //
  // The plugin serves every field visible and hides the dependent ones from JS on
  // init, from a `window['gf_form_conditional_logic'][N]` blob. Exactly one rule
  // exists on this site — field 150 on /patient-wellness-intake/ ("Other", the
  // free-text box beside the alcohol select) shows only when field 149 is "Other" —
  // and without it the clone renders that box permanently, 102px taller than
  // production. The blob is parked on the wrapper for src/scripts/elementor.js to
  // apply and to keep applying as the visitor types.
  for (const [formId, logic] of gfLogic) {
    $el.find(`#gform_wrapper_${formId}`).attr('data-gm-gf-logic', JSON.stringify(logic));
  }

  // WordPress-only endpoints that do not exist on the clone.
  $el.find('a[href^="/feed"], a[href^="/wp-json"], a[href^="/xmlrpc.php"]').each((i, el) => {
    $(el).attr('href', '/');
  });
  return $.html($el);
}

const inlineCss = new Map(); // filename -> content
function saveInline(id, content) {
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 8);
  const name = `inline-${id.replace(/-inline-css$/, '').replace(/[^a-z0-9-]/gi, '-')}-${hash}`;
  // Insecure spellings are recorded for mirroring but left in place — the one on
  // this site is /wp-content/uploads/2020/02/bg.jpg, in the theme's "Custom CSS"
  // block. See rewriteUrl().
  for (const m of content.matchAll(new RegExp(INSECURE_ORIGIN.replace(/\./g, '\\.') + '[^)\\s"\']*', 'g'))) {
    assets.add(ORIGIN + m[0].slice(INSECURE_ORIGIN.length));
  }
  if (content.includes(ORIGIN)) {
    for (const m of content.matchAll(new RegExp(ORIGIN.replace(/\./g, '\\.') + '[^)\\s"\']*', 'g'))) assets.add(m[0]);
    content = content.split(ORIGIN).join('');
  }
  inlineCss.set(name, content);
  return name;
}

const files = (await readdir(HTML)).filter((f) => f.endsWith('.html')).sort();
const manifest = JSON.parse(await readFile(path.join(ROOT, '_extract/crawl-manifest.json'), 'utf8'));
const pathBySlug = new Map();
for (const m of manifest) if (m.status === 200) {
  const p = new URL(m.finalUrl || m.url).pathname.toLowerCase();
  if (!pathBySlug.has(m.slug.toLowerCase())) pathBySlug.set(m.slug.toLowerCase(), p);
}

const shared = new Map(); // fragment name -> html (header/footer/popup, deduped by id)
const pages = [];
let analytics = null;
let chatWidget = null;

for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const urlPath = pathBySlug.get(slug.toLowerCase());
  if (!urlPath) { console.warn('no url for', file); continue; }
  const raw = await readFile(path.join(HTML, file), 'utf8');
  const $ = cheerio.load(raw, { decodeEntities: false });

  // Pulled from the raw HTML rather than the DOM: it lives in an inline script,
  // and the keys in it are unquoted JS identifiers, so it needs a light rewrite
  // before JSON can read it.
  const gfLogic = [...raw.matchAll(/gf_form_conditional_logic'\]\[(\d+)\] = \{ logic: (\{[\s\S]*?\}), dependents:/g)]
    .map(([, formId, blob]) => {
      try { return [formId, JSON.parse(blob.replace(/([{,]\s*)(\d+)\s*:/g, '$1"$2":'))]; }
      catch { console.warn('unparsed GF logic on', file); return null; }
    })
    .filter(Boolean);

  // --- stylesheet order: external handles and inline blocks, interleaved as authored
  const css = [];
  $('head link[rel="stylesheet"], head style, body link[rel="stylesheet"], body style').each((i, el) => {
    const $e = $(el);
    if (el.tagName === 'link') {
      const id = ($e.attr('id') || '').replace(/-css$/, '');
      if (id) css.push({ type: 'file', name: id });
    } else {
      // Elementor prints one id-less <style> (the background lazy-load guard).
      const id = ($e.attr('id') || 'anon').replace(/-css$/, '');
      const content = $e.html() || '';
      if (!content.trim()) return;
      css.push({ type: 'file', name: saveInline(id, content) });
    }
  });

  // --- analytics
  //
  // There is none. This install carries no Google Tag Manager container, no GA4
  // property, no Ads tag, no Meta pixel — nothing but ActiveCampaign's own
  // first-party `site_tracking.js`, which is a WordPress plugin asset and dies
  // with the install.
  //
  // The capture below is kept anyway, and kept identical to the sibling clones':
  // it costs one pass over the scripts, it writes empty fragments that BaseLayout
  // then renders as nothing, and if the client adds a tag before cutover a
  // re-extract picks it up with no code change. Its absence is worth telling the
  // client about — see the README.
  if (!analytics) {
    const parts = [];
    $('script').each((i, el) => {
      if ($(el).parents('[data-elementor-type]').length) return;
      const $s = $(el);
      const src = $s.attr('src') || '';
      const code = $s.html() || '';
      const isTag = /googletagmanager\.com|google-analytics\.com/.test(src)
        || /dataLayer|gtag\(|gtm\.start/.test(code);
      if (!isTag) return;
      parts.push($.html($s));
    });
    const $ns = $('body > noscript').filter((i, el) => /googletagmanager/.test($(el).html() || '')).first();
    const noscript = $ns.length ? $.html($ns) : '';
    if (parts.length) analytics = { head: parts.join('\n'), body: noscript };
  }

  // --- regions
  const $header = $('body > header[data-elementor-type="header"]');
  const $footer = $('body > footer[data-elementor-type="footer"]');
  const $popups = $('body > div[data-elementor-type="popup"]');
  const $content = $('body > div[data-elementor-type]:not([data-elementor-type="popup"]), body > main#content');

  // Header/footer markup is shared, but WordPress bakes per-page state into it
  // (current-menu-* classes, and which logo image gets fetchpriority/lazy). Dedupe
  // by content hash so every distinct variant is stored exactly once, verbatim.
  const region = ($el, kind) => {
    if (!$el.length) return null;
    const id = $el.attr('data-elementor-id') || 'x';
    const html = cleanFragment($, $el, gfLogic);
    const name = `${kind}-${id}-${createHash('sha1').update(html).digest('hex').slice(0, 8)}`;
    if (!shared.has(name)) shared.set(name, html);
    return name;
  };

  const headerFrag = region($header, 'header');
  const footerFrag = region($footer, 'footer');
  const popupFrags = $popups.map((i, el) => region($(el), 'popup')).get();

  const contentHtml = $content.length
    ? $content.map((i, el) => cleanFragment($, $(el), gfLogic)).get().join('\n')
    : '';
  const contentName = `page-${slug}`;
  await writeFile(path.join(FRAG, `${contentName}.html`), contentHtml);

  // --- head metadata
  //
  // Selected document-wide rather than under `head`, which costs nothing here and
  // is what the sibling clones do: an unknown element inside `<head>` ends the head
  // for every HTML parser, and a plugin that prints one has silently pushed icon
  // links and meta tags into `<body>` on two other sites in this series. This
  // install's head parses cleanly today — 64 links, 19 metas, nothing exotic — so
  // the two spellings agree; if a plugin ever changes that, the clone still puts
  // everything back in `<head>` where WordPress meant it.
  const favicons = $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').map((i, el) => ({
    rel: $(el).attr('rel'), href: rewriteUrl($(el).attr('href')), sizes: $(el).attr('sizes') || null,
  })).get();
  const tile = rewriteUrl($('meta[name="msapplication-TileImage"]').attr('content')) || null;

  // Yoast writes the whole SEO head — canonical, Open Graph, Twitter card and the
  // schema.org graph. Rather than re-deriving any of it, keep the block verbatim and
  // re-emit it; only the origin is templated, so a preview deployment is
  // self-consistent.
  const seoHead = $('meta[property^="og:"], meta[name^="twitter:"], meta[property^="article:"], script.yoast-schema-graph, meta[name="google-site-verification"]')
    .map((i, el) => $.html(el).split(ORIGIN).join('__ORIGIN__').split(ORIGIN_ESC).join('__ORIGIN_ESC__'))
    .get().join('\n');

  // No chat bubble on this install — no Intercom, Drift, Tawk or GoHighLevel
  // widget anywhere in the markup. The capture is kept for the same reason the
  // analytics one is: it writes an empty fragment, and a re-extract would pick one
  // up if the client ever adds it.
  if (!chatWidget) {
    const $cw = $('body > chat-widget').first();
    if ($cw.length) chatWidget = $.html($cw.clone());
  }

  pages.push({
    slug,
    path: urlPath,
    title: $('head title').text(),
    description: $('head meta[name="description"]').attr('content') || null,
    robots: $('head meta[name="robots"]').attr('content') || null,
    bodyClass: ($('body').attr('class') || '').trim(),
    // Carried per page rather than hard-coded: Elementor's canvas template prints a
    // different viewport from the theme's, and /links/ is built on it.
    viewport: $('meta[name="viewport"]').last().attr('content') || 'width=device-width, initial-scale=1',
    lang: $('html').attr('lang') || 'en-US',
    hasSkipLink: $('body > a.skip-link').length > 0,
    header: headerFrag,
    footer: footerFrag,
    popups: popupFrags,
    content: contentName,
    css,
    favicons,
    tile,
    seoHead,
  });
  console.log(`${slug.padEnd(52)} css:${css.length} ${headerFrag || '-'} ${contentName} ${footerFrag || '-'}${popupFrags.length ? ' +' + popupFrags.join(',') : ''}`);
}

for (const [name, html] of shared) await writeFile(path.join(FRAG, `${name}.html`), html);
await mkdir(CSSDIR, { recursive: true });
for (const [name, content] of inlineCss) await writeFile(path.join(CSSDIR, `${name}.css`), content);

await mkdir(path.join(ROOT, 'src/data'), { recursive: true });
await writeFile(path.join(ROOT, 'src/data/pages.json'), JSON.stringify(pages, null, 2));
await writeFile(path.join(ROOT, '_extract/assets.json'), JSON.stringify([...assets].sort(), null, 2));
await writeFile(path.join(FRAG, 'chat-widget.html'), chatWidget ?? '');
await writeFile(path.join(FRAG, 'analytics-head.html'), analytics?.head ?? '');
await writeFile(path.join(FRAG, 'analytics-body.html'), analytics?.body ?? '');

console.log(`\n${pages.length} pages, ${shared.size} shared fragments, ${inlineCss.size} inline css, ${assets.size} assets`);
