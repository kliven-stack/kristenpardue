import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 900, height: 900 } });
const p = await ctx.newPage();
await p.bringToFront();
await p.goto('https://kristenpardue.com/patient-wellness-intake/', { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => {
  const w = document.getElementById('gform_wrapper_4');
  const f = document.getElementById('gform_4');
  return {
    wrapperStyle: w?.getAttribute('style'),
    wrapperClass: w?.className,
    computed: w && getComputedStyle(w).display,
    height: w && Math.round(w.getBoundingClientRect().height),
    formStyle: f?.getAttribute('style'),
    iframe: [...document.querySelectorAll('iframe[name^="gform_ajax_frame"]')].map((i) => i.outerHTML.slice(0, 200)),
    spinner: !!document.querySelector('.gform_ajax_spinner'),
    bodyExtra: [...document.querySelectorAll('#gform_wrapper_4 .gform_validation_errors')].length,
    field150: (() => {
      const li = document.getElementById('field_4_150');
      return li && { style: li.getAttribute('style'), cls: li.className, display: getComputedStyle(li).display,
        input: li.querySelector('input')?.getAttribute('disabled') };
    })(),
    field149: document.getElementById('input_4_149')?.value,
  };
}), null, 1));
await b.close();
