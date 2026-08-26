// Static server for dist/, so the fidelity harness measures the production build
// (no dev toolbar, no Vite client) instead of the dev server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
// Honour vercel.json's redirects so local runs behave like production.
const { redirects = [] } = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const PORT = Number(process.env.PORT || 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.xml': 'application/xml',
};

/**
 * One vercel.json redirect rule, compiled.
 *
 * Vercel's `source` accepts `:name` and `:name*` segments and substitutes them into
 * `destination`. `/blog/page/:n` -> `/blog/:n/` is the rule that matters here, and a
 * literal string comparison misses it — which is how the functional suite caught
 * `/blog/page/2/` 404ing locally while it would have worked in production. The
 * whole point of serving `dist/` for verification is that it behaves like Vercel.
 */
const compileRedirect = (rule) => {
  const names = [];
  const pattern = rule.source.replace(/:([A-Za-z0-9_]+)(\*?)/g, (whole, name, star) => {
    names.push(name);
    return star ? '(.*)' : '([^/]+)';
  });
  return {
    ...rule,
    names,
    regex: new RegExp(`^${pattern}$`),
    fill: (match) => names.reduce(
      (out, name, i) => out.split(`:${name}*`).join(match[i + 1]).split(`:${name}`).join(match[i + 1]),
      rule.destination,
    ),
  };
};
const rules = redirects.map(compileRedirect);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Matched literally, exactly as Vercel matches it — no trailing-slash
  // normalisation on either side. Being more forgiving here than production is
  // how a whole class of broken redirects stayed invisible: every source written
  // without a trailing slash 404s on Vercel for the slash form, which is the
  // canonical form WordPress served and the one in Google's index. vercel.json
  // now carries both spellings; this must stay strict so it cannot drift again.
  const hit = rules
    .map((rule) => ({ rule, match: rule.regex.exec(url.pathname) }))
    .find(({ rule, match }) => match && (rule.has ?? []).every((h) => h.type === 'query' && url.searchParams.has(h.key)));
  if (hit) {
    res.writeHead(hit.rule.permanent ? 308 : 307, { location: hit.rule.fill(hit.match) + url.search });
    res.end();
    return;
  }

  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    if (!path.extname(file)) file = path.join(file, 'index.html');
  }
  try {
    const body = await readFile(file);
    const type = TYPES[path.extname(file)] || 'application/octet-stream';

    // Media elements request byte ranges; without 206 support Chrome will not play.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : body.length - 1;
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${body.length}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
      });
      res.end(body.subarray(start, end + 1));
      return;
    }

    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes' });
    res.end(body);
  } catch {
    // Same as Vercel: unmatched paths get the site's own 404 page.
    let body = '<!doctype html><title>404</title>Not found';
    try { body = await readFile(path.join(ROOT, '404.html')); } catch { /* not built yet */ }
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  }
}).listen(PORT, () => console.log(`dist/ on http://localhost:${PORT}`));
