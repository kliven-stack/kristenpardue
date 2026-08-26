// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.PUBLIC_SITE_URL || 'https://kristenpardue.com';

export default defineConfig({
  site: SITE,

  // Fully static. Both of the site's forms POST straight from the browser to the
  // Growthmap endpoint, so nothing needs a server runtime (playbook §4b) and
  // `npm run preview` works.
  output: 'static',

  trailingSlash: 'always',
  build: { format: 'directory' },

  integrations: [
    sitemap({
      // Advertise what Yoast advertises, minus what should not be advertised.
      //
      // Yoast's sitemap_index.xml has three child maps: the 23 posts (including
      // the /blog/ index), the 52 pages, and the one category term. The 404
      // template is a route, not a page, and the paginated archives are excluded
      // here as Yoast excludes them.
      //
      // The four staff pages that 301 to /about-us/ are in Yoast's sitemap and not
      // in this one — a sitemap entry that redirects is a defect, not something to
      // reproduce (README bug 1). No filter rule is needed for them: they resolve
      // as redirects rather than pages, so they were never built.
      filter: (page) => {
        const path = new URL(page).pathname;
        if (path === '/404/') return false;
        if (/\/page\/\d+\/$/.test(path)) return false;
        return true;
      },
    }),
  ],

  vite: { plugins: [tailwindcss()] },
});
