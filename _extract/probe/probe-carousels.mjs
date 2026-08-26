import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
for (const path of ['/about/', '/', '/faq/']) {
  const p = await ctx.newPage();
  await p.bringToFront();
  await p.goto('https://kristenpardue.com' + path, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('.elementor-main-swiper')) el.swiper?.autoplay?.stop();
  });
  await p.waitForTimeout(400);
  console.log('=====', path);
  const data = await p.evaluate(() => [...document.querySelectorAll('.elementor-main-swiper')].map((el) => ({
    cls: el.className,
    widget: el.closest('[data-widget_type]')?.getAttribute('data-widget_type'),
    containerW: el.clientWidth,
    params: el.swiper && {
      slidesPerView: el.swiper.params.slidesPerView,
      spaceBetween: el.swiper.params.spaceBetween,
      loop: el.swiper.params.loop,
      effect: el.swiper.params.effect,
      speed: el.swiper.params.speed,
      autoplay: JSON.stringify(el.swiper.params.autoplay),
      breakpoints: JSON.stringify(el.swiper.params.breakpoints),
      slidesPerGroup: el.swiper.params.slidesPerGroup,
      centeredSlides: el.swiper.params.centeredSlides,
      watchSlidesProgress: el.swiper.params.watchSlidesProgress,
    },
    wrapper: el.querySelector('.swiper-wrapper')?.getAttribute('style'),
    slideCount: el.querySelectorAll('.swiper-slide').length,
    slides: [...el.querySelectorAll('.swiper-slide')].slice(0, 4).map((s) => s.className + ' | ' + (s.getAttribute('style') ?? '') + ' | ' + (s.getAttribute('aria-label') ?? '')),
    pagination: el.parentElement?.querySelector('.swiper-pagination')?.outerHTML.slice(0, 400) ?? el.querySelector('.swiper-pagination')?.outerHTML.slice(0, 400) ?? null,
  })));
  console.log(JSON.stringify(data, null, 1));
  await p.close();
}
await b.close();
