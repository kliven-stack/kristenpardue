// Read the two third-party forms this site embeds, through the pages that embed
// them, so what our replacements offer is measured rather than guessed
// (playbook §7.5).
//
//   /contact-me/  ActiveCampaign form 5. Not an iframe: a loader from
//                 kristenpardue16396.activehosted.com builds the markup straight
//                 into the page, so the fields are readable from the document once
//                 the script has run.
//   popup 2995    a LeadConnector ("Trustymail") "Subscribe - BSC" form, in an
//                 iframe, opened one second after load on every page. Its document
//                 is same-site to Playwright even though it is cross-origin to the
//                 page, so `page.frames()` can read it.
//
// The clone ships both embeds verbatim, so this is a diagnostic rather than a
// build step: it tells you what the widgets actually render, which is how you
// check an embed still works after cutover without clicking through the site.
//
// Both hosts reset the connection from some networks — including the one this was
// written on, where curl and headless Chrome both get ECONNRESET — so the script
// says so rather than reporting an empty field set.
import { chromium } from 'playwright';

const ORIGIN = 'https://kristenpardue.com';
const TARGETS = [
  ['/contact-me/', 1440], ['/contact-me/', 900], ['/contact-me/', 390],
];

const describeFields = (root) => ({
  height: (root || document.body).scrollHeight,
  fields: [...(root || document).querySelectorAll('input, select, textarea')]
    .filter((el) => el.type !== 'hidden')
    .map((el) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(), type: el.type || null, name: el.name || el.id || null,
        placeholder: el.placeholder || null, required: el.required,
        label: el.labels?.[0]?.textContent.replace(/\s+/g, ' ').trim() || null,
        box: [Math.round(r.width), Math.round(r.height)],
        options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.textContent.trim()) : undefined,
        bg: c.backgroundColor, radius: c.borderRadius, pad: c.padding,
        border: c.border, font: `${c.fontFamily} ${c.fontSize}`,
      };
    }),
  buttons: [...(root || document).querySelectorAll('button, input[type=submit]')].map((el) => {
    const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    return {
      text: (el.textContent || el.value || '').replace(/\s+/g, ' ').trim(),
      box: [Math.round(r.width), Math.round(r.height)],
      bg: c.backgroundColor, color: c.color, radius: c.borderRadius,
      font: `${c.fontFamily} ${c.fontSize} ${c.fontWeight}`,
    };
  }).filter((x) => x.text),
});

const browser = await chromium.launch();
const blocked = new Set();

for (const [path, width] of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width, height: 1200 } });
  const page = await ctx.newPage();
  page.on('requestfailed', (r) => {
    const host = new URL(r.url()).host;
    if (host !== new URL(ORIGIN).host) blocked.add(`${host} — ${r.failure()?.errorText}`);
  });
  await page.bringToFront();
  await page.goto(ORIGIN + path, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  console.log(`\n===== ${path} @${width}`);

  // ActiveCampaign, in the page's own document.
  const ac = await page.evaluate(() => {
    const host = document.querySelector('[class^="_form_"], ._form_5');
    if (!host) return { present: false };
    const form = host.querySelector('form');
    return {
      present: true, built: !!form,
      html: host.innerHTML.slice(0, 400),
      box: (() => { const r = host.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    };
  });
  console.log('activecampaign:', JSON.stringify(ac, null, 1));
  if (ac.built) {
    const fields = await page.evaluate(
      (fn) => new Function(`return (${fn})`)()(document.querySelector('[class^="_form_"], ._form_5')),
      describeFields.toString(),
    );
    console.log('  fields:', JSON.stringify(fields, null, 1));
  }

  // LeadConnector, in the popup's iframe.
  for (const frame of page.frames()) {
    if (!/trustymail|leadconnector/.test(frame.url())) continue;
    try {
      console.log('  frame:', frame.url());
      console.log('  ', JSON.stringify(await frame.evaluate(describeFields), null, 1).replace(/\n/g, '\n  '));
    } catch (error) { console.log('  frame read failed:', String(error).split('\n')[0]); }
  }
  await ctx.close();
}

if (blocked.size) {
  console.log('\nthird-party requests that never completed from this network:');
  for (const line of blocked) console.log('  ' + line);
  console.log('a field set could not be read from here; try again from another network.');
}
await browser.close();
