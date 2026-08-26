// Download every stylesheet the live site links, keyed by its WordPress handle
// (the handle in the <link id> is stable even when the filename is not), and
// mirror everything those stylesheets reference.
//
// The second half matters as much as the first. Elementor's compiled per-post CSS
// paints section backgrounds with absolute `url(https://…)` — left alone, the clone
// would keep fetching its own hero images from the WordPress site it replaces. And
// the icon fonts are addressed relatively (`../webfonts/fa-solid-900.woff2`), which
// resolves against /wp/css/ here and 404s, silently swapping every icon for
// fallback metrics. Both are rewritten to the original root-relative path and
// mirrored under public/, so a stylesheet is byte-equivalent apart from its URLs.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const HTML = path.join(ROOT, '_extract/html');
const PUB = path.join(ROOT, 'public');
const CSSDIR = path.join(PUB, 'wp/css');
const ORIGIN = 'https://kristenpardue.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

await mkdir(CSSDIR, { recursive: true });
const files = (await readdir(HTML)).filter((f) => f.endsWith('.html'));
const map = new Map(); // handle -> url
for (const f of files) {
  const html = await readFile(path.join(HTML, f), 'utf8');
  for (const m of html.matchAll(/<link[^>]*rel='stylesheet'[^>]*>/g)) {
    const tag = m[0];
    const id = /id='([^']*)-css'/.exec(tag)?.[1];
    const href = /href='([^']*)'/.exec(tag)?.[1];
    if (id && href && !map.has(id)) map.set(id, href);
  }
}
console.log(`${map.size} stylesheet handles`);

const referenced = new Set();

/**
 * Rewrites one url() target, recording anything on our host for mirroring.
 *
 * The protocol is deliberately *not* normalised, and that is the whole subtlety of
 * this site's compiled CSS. Eight `url()` targets in it are spelled `http://` on a
 * site served over `https://` — one custom font (`BrittanySignature.ttf`, used by
 * Elementor kit CSS on /foundations/ and post 17) and seven background images.
 * Chrome treats those two cases differently:
 *
 *   fonts   are mixed *active* content. The request is blocked outright, before it
 *           is made, and the text falls back to the next family in the stack. That
 *           is what production renders today, and rewriting the URL here would
 *           silently *change* the design rather than clone it — so the insecure
 *           spelling is kept verbatim. It is load-bearing, not an oversight, and it
 *           reproduces deterministically on any host: the block happens at the URL,
 *           so it never depends on the old WordPress server still answering.
 *
 *   images  are mixed *passive* content, which Chrome auto-upgrades to https. They
 *           render on production and they render here. They are still mirrored, so
 *           that once the domain points at this clone the upgraded request is
 *           served from public/ instead of 404ing.
 *
 * src/lib/fixes.ts carries the one-line correction for both, behind
 * `PUBLIC_APPLY_FIXES=on`. See the README's bug register.
 */
function rewrite(raw, sheetUrl) {
  const value = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!value || value.startsWith('data:') || value.startsWith('#')) return null;
  let url;
  try { url = new URL(value, sheetUrl); } catch { return null; }
  if (url.host !== new URL(ORIGIN).host) return null;
  // Mirror from the secure spelling whatever the stylesheet asked for.
  referenced.add(ORIGIN + url.pathname);
  return url.protocol === 'http:' ? null : url.pathname + url.search;
}

for (const [handle, url] of map) {
  // The Google Fonts stylesheets are handled by scripts/build-fonts.mjs, which
  // mirrors Elementor's own woff2 and drops the non-latin subsets.
  if (handle.startsWith('elementor-gf-')) { console.log('skip (self-hosted)', handle); continue; }
  const out = path.join(CSSDIR, `${handle}.css`);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  let body = await res.text();
  body = body.replace(/url\(\s*([^)]*?)\s*\)/g, (whole, target) => {
    const rewritten = rewrite(target, url);
    return rewritten === null ? whole : `url(${rewritten})`;
  });
  await writeFile(out, body);
  console.log(res.status, handle, body.length);
}

// Mirror what the stylesheets point at, keeping the original path so the
// rewritten url() resolves.
let ok = 0, cached = 0;
const failed = [];
for (const asset of referenced) {
  // Decoded — see the note in scripts/fetch-media.mjs.
  const dest = path.join(PUB, decodeURIComponent(new URL(asset).pathname));
  if (existsSync(dest)) { cached++; continue; }
  const res = await fetch(asset, { headers: { 'user-agent': UA, referer: ORIGIN + '/' } });
  if (!res.ok) { failed.push([res.status, asset]); continue; }
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  ok++;
}
console.log(`\nstylesheet assets: ${ok} downloaded, ${cached} cached, ${failed.length} failed`);
for (const [status, url] of failed) console.log('  FAIL', status, url);
