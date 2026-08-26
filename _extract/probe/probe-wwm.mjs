import { chromium } from 'playwright';
const b = await chromium.launch();
for (const origin of ['https://kristenpardue.com', 'https://kristenpardue.vercel.app']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto(origin + '/work-with-me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(4000);
  console.log(origin, JSON.stringify(await p.evaluate(() => {
    const w = document.querySelector('[data-id="e96cc91"]');
    const img = w?.querySelector('img');
    const col = document.querySelector('[data-id="664d2e8"]');
    const r = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    return {
      widget: w && r(w), col: col && r(col),
      img: img && r(img),
      natural: img && [img.naturalWidth, img.naturalHeight],
      complete: img?.complete, currentSrc: img?.currentSrc?.split('/').pop(),
      imgCss: img && (({ maxWidth, width, height, objectFit }) => ({ maxWidth, width, height, objectFit }))(getComputedStyle(img)),
      colClass: col?.className,
    };
  })));
  await ctx.close();
}
await b.close();
