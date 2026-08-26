import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.bringToFront();
await p.goto('https://kristenpardue.com/uncategorized/doterra-oils-lemon-lavender-and-peppermint/', { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')].filter((i) => i.width <= 20 && i.height <= 20);
  return {
    emojiScript: [...document.scripts].map((s) => s.src).filter((s) => /emoji/.test(s)),
    smallImgs: imgs.map((i) => ({ cls: i.className, src: i.src.slice(0, 80), alt: i.alt })),
    settings: window._wpemojiSettings && { source: window._wpemojiSettings.source },
  };
}), null, 1));
await b.close();
