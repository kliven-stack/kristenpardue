// Why do some archive thumbnails render smaller on the clone than on production?
// Measures the same four cards on both sides, with the image settle the fidelity
// harness uses, and prints everything that could explain a size difference.
import { chromium } from 'playwright';

const b = await chromium.launch();
for (const origin of ['https://kristenpardue.com', 'https://kristenpardue.vercel.app']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/category/mindset/', { waitUntil: 'load', timeout: 90000 });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(4000);
  await p.evaluate(async () => {
    for (let i = 0; i < 40 && [...document.images].some((x) => !x.complete); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  const out = await p.evaluate(() => [...document.querySelectorAll('.elementor-post__thumbnail img')].slice(0, 4).map((img) => {
    const r = img.getBoundingClientRect();
    const t = img.closest('.elementor-post__thumbnail');
    const tr = t.getBoundingClientRect();
    return {
      imgBox: [Math.round(r.width), Math.round(r.height)],
      thumbBox: [Math.round(tr.width), Math.round(tr.height)],
      thumbCls: t.className,
      natural: [img.naturalWidth, img.naturalHeight],
      src: (img.currentSrc || '').split('/').pop(),
      sizes: img.getAttribute('sizes'),
      objectFit: getComputedStyle(img).objectFit,
      cssW: getComputedStyle(img).width,
      cssH: getComputedStyle(img).height,
      padBottom: getComputedStyle(t).paddingBottom,
    };
  }));
  console.log('=====', origin);
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
}
await b.close();
