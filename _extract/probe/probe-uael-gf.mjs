import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.bringToFront();
await p.goto('https://kristenpardue.com/patient-wellness-intake/', { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => {
  const selects = [...document.querySelectorAll('#gform_wrapper_4 select')];
  return {
    selects: selects.length,
    wrapped: selects.filter((s) => s.parentElement.classList.contains('uael-gf-select-custom')).length,
    wrapperHtml: document.querySelector('.uael-gf-select-custom')?.outerHTML.slice(0, 260) ?? null,
    unwrapped: selects.filter((s) => !s.parentElement.classList.contains('uael-gf-select-custom'))
      .map((s) => s.id + ' | parent ' + s.parentElement.className.slice(0, 60)),
    checkboxes: [...document.querySelectorAll('#gform_wrapper_4 input[type=checkbox], #gform_wrapper_4 input[type=radio]')]
      .slice(0, 3).map((i) => i.parentElement.outerHTML.slice(0, 200)),
    stylerClasses: document.querySelector('[data-widget_type="uael-gf-styler.default"]')?.className,
  };
}), null, 1));
await b.close();
