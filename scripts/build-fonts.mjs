// Self-host the five Google families the pages request.
//
// Unlike the sibling clones, this install does *not* use Elementor's "local Google
// Fonts" option: every page links `fonts.googleapis.com` directly, once per family
// (Montserrat, Oswald, Poiret One, Raleway, Sacramento), each asking for all
// nine weights and their italics with `display=auto`.
//
// That is three problems the clone does not have to inherit:
//   * a render-blocking round trip to a third party on every page load;
//   * `display=auto`, which in Chrome means `block` — a ~3s invisible-text window
//     before the fallback is even allowed to paint;
//   * ~1.4 MB of faces, most of them weights nothing on the site sets.
//
// So the stylesheets are fetched once here, at build time, and rewritten to point
// at woff2 files served from this origin. Two differences from what Google serves,
// both no-ops for what renders:
//   * only the latin and latin-ext subsets are kept (playbook §2) — the browser's
//     unicode-range gating already meant this English site never fetched the
//     cyrillic or vietnamese blocks;
//   * `font-display: swap` is written onto every face, which is what the playbook
//     asks for and what removes the invisible-text window. Nothing about the
//     rendered geometry changes: the same file, at the same metrics, is what
//     eventually paints either way.
//
// BaseLayout decides whether to link the result, from PUBLIC_WEBFONTS.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const HTML = path.join(ROOT, '_extract/html');
const FONTS = path.join(ROOT, 'public/wp/fonts');
const CSSDIR = path.join(ROOT, 'public/wp/css');
// A modern UA is what makes Google answer with woff2 rather than ttf.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Google's latin block always carries U+0000-00FF; latin-ext always U+0100-02BA. */
const KEEP = [/U\+0000-00FF/i, /U\+0100-02BA/i];
const isLatin = (range) => KEEP.some((re) => re.test(range));

await mkdir(FONTS, { recursive: true });
await mkdir(CSSDIR, { recursive: true });

// Which family stylesheets does the site link, and under which handle? The href is
// HTML-escaped in the markup (`&#038;` for every `&`), so it is unescaped before use.
const sheets = new Map(); // handle -> url
for (const f of (await readdir(HTML)).filter((name) => name.endsWith('.html'))) {
  const html = await readFile(path.join(HTML, f), 'utf8');
  for (const m of html.matchAll(/<link[^>]*id='(elementor-gf-[^']*)-css'[^>]*href='([^']*)'/g)) {
    if (!sheets.has(m[1])) sheets.set(m[1], m[2].replace(/&#0?38;/g, '&').replace(/&amp;/g, '&'));
  }
}

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
};

let files = 0;
let dropped = 0;
for (const [handle, url] of sheets) {
  const css = await (await get(url)).text();
  const out = [];
  const wanted = new Map(); // local filename -> remote url

  for (const m of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const face = m[0];
    const range = /unicode-range:\s*([^;}]*)/i.exec(face)?.[1] ?? '';
    // A face with no unicode-range covers everything; keep it.
    if (range && !isLatin(range)) { dropped++; continue; }

    let body = face.replace(/url\(\s*['"]?(\S+?)['"]?\s*\)/g, (whole, remote) => {
      // gstatic filenames are unique per family+weight+subset, so they can share
      // one flat directory without collisions.
      const name = remote.split('/').pop().split('?')[0];
      wanted.set(name, remote);
      return `url(/wp/fonts/${name})`;
    });
    // `display=auto` resolves to `block` in Chrome: up to 3s of invisible text
    // before the fallback may paint. Swap shows the fallback immediately.
    body = /font-display\s*:/.test(body)
      ? body.replace(/font-display\s*:\s*[^;}]*/i, 'font-display: swap')
      : body.replace(/\{/, '{\n  font-display: swap;');
    out.push(body);
  }

  await writeFile(path.join(CSSDIR, `${handle}.css`), out.join('\n') + '\n');

  for (const [name, remote] of wanted) {
    const dest = path.join(FONTS, name);
    if (existsSync(dest)) continue;
    await writeFile(dest, Buffer.from(await (await get(remote)).arrayBuffer()));
    files++;
  }
  console.log(`${handle.padEnd(30)} ${out.length} faces, ${wanted.size} files`);
}
console.log(`\n${sheets.size} families, ${files} font files downloaded, ${dropped} non-latin faces dropped`);
