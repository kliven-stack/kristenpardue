import pagesData from '../data/pages.json';
import { fixFragment } from './fixes';

export interface CssRef { type: 'file'; name: string }
export interface Favicon { rel: string; href: string; sizes: string | null }

export interface PageRecord {
  slug: string;
  path: string;
  title: string;
  description: string | null;
  robots: string | null;
  bodyClass: string;
  /**
   * The page's own viewport meta. /book-an-appointment/ is the one page built on
   * Elementor's canvas template, whose head asks for `viewport-fit=cover`.
   */
  viewport: string;
  lang: string;
  hasSkipLink: boolean;
  header: string | null;
  footer: string | null;
  popups: string[];
  content: string;
  css: CssRef[];
  favicons: Favicon[];
  /** msapplication-TileImage, as WordPress printed it. */
  tile: string | null;
  /** Yoast's Open Graph / Twitter / schema.org block, origin templated out. */
  seoHead: string;
}

export const pages = pagesData as PageRecord[];

/** Raw Elementor markup, keyed by fragment name (`page-index`, `header-19-…`). */
const fragmentModules = import.meta.glob<string>('../fragments/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const fragments = new Map<string, string>(
  Object.entries(fragmentModules).map(([file, html]) => [
    file.replace(/^.*\/([^/]+)\.html$/, '$1'),
    html,
  ]),
);

/**
 * The GoHighLevel chat bubble the LeadConnector plugin prints into <head> on every
 * page, which every HTML parser then moves to the top of <body>.
 *
 * The site carries a *second*, hand-placed copy inside the footer template, so both
 * the element and its loader script exist twice on every page. That is production's
 * behaviour and it is reproduced, not tidied — see the README's bug register.
 */
export const chatWidgetHtml = fixFragment(fragments.get('chat-widget') ?? '', 'chat-widget');

/**
 * The client's Google measurement stack, exactly as WordPress prints it: GTM
 * container GTM-5Z3BSXQ, GA4 G-PJWG0QD109, Ads AW-751377890, and GA4 G-RWPQB7M7TD
 * twice over, plus one tag configured with an empty id. Rendered behind
 * `PUBLIC_ANALYTICS`; see the README for the two defects in it.
 */
export const analyticsHead = fragments.get('analytics-head') ?? '';
export const analyticsBody = fragments.get('analytics-body') ?? '';

export function fragment(name: string | null): string {
  if (!name) return '';
  const html = fragments.get(name);
  if (html === undefined) throw new Error(`Missing fragment: ${name}`);
  // Corrections to the WordPress site's own bugs, applied here rather than in
  // src/fragments/ so that `npm run extract` cannot undo them (see lib/fixes.ts).
  return fixFragment(html, name);
}

export const pageByPath = new Map(pages.map((p) => [p.path, p]));
