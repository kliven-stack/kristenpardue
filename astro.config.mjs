// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.PUBLIC_SITE_URL || 'https://kristenpardue.com';

export default defineConfig({
  site: SITE,

  // Fully static. The contact and subscribe forms POST straight from the browser to
  // the Growthmap endpoint, so nothing needs a server runtime (playbook §4b) and
  // `npm run preview` works.
  output: 'static',

  trailingSlash: 'always',
  build: { format: 'directory' },

  integrations: [
    sitemap({
      // Advertise what Yoast advertises, minus what should not be advertised.
      //
      // Yoast's sitemap_index.xml has four child maps: 82 posts, 40 pages, 15
      // category terms and the one author archive. This one matches that set — the
      // 404 template is a route rather than a page, and the 33 paginated archives
      // are excluded exactly as Yoast excludes them.
      //
      // Note that Yoast's own index advertises all four children over `http://` on
      // an `https://` site (README bug 3); this one does not, which is a correction
      // rather than a reproduction — a sitemap is machine-facing infrastructure, and
      // an insecure URL in it is a defect with no design consequence.
      filter: (page) => {
        const path = new URL(page).pathname;
        if (path === '/404/') return false;
        // /blog/2/ … /blog/10/ and /category/…/page/2/ — the archives' own
        // pagination, which duplicates page one's title and description.
        if (/\/page\/\d+\/$/.test(path)) return false;
        if (/^\/blog\/\d+\/$/.test(path)) return false;
        return true;
      },
    }),
  ],

  vite: { plugins: [tailwindcss()] },
});
