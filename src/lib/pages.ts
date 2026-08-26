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
   * The page's own viewport meta. /links/ is the one page built on Elementor's
   * canvas template, whose head prints a different one from the theme's.
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

/** Raw Elementor markup, keyed by fragment name (`page-index`, `header-2135-…`). */
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
 * Empty on this site — it carries no chat bubble of any kind. Kept for parity with
 * the sibling clones: `npm run extract` writes the fragment either way, so adding
 * one to WordPress before cutover is a re-extract rather than a code change.
 */
export const chatWidgetHtml = fixFragment(fragments.get('chat-widget') ?? '', 'chat-widget');

/**
 * Also empty. There is no Google Tag Manager container, no GA4 property, no Ads
 * tag and no Meta pixel anywhere on this site — the only tracking it carries is
 * ActiveCampaign's own WordPress plugin, which dies with the install. Worth
 * telling the client (README bug 14) rather than silently matching.
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
