/**
 * Corrections to the original site's own bugs.
 *
 * The clone reproduces production exactly, bugs included (playbook §2), so these
 * are **off by default**: nobody has decided yet which of the defects the README
 * lists should be corrected. Set `PUBLIC_APPLY_FIXES=on` to build with them applied.
 *
 * They live here rather than in `src/fragments/` for two reasons:
 *
 *   * `npm run extract` rewrites the fragments from the crawl, so an edit made
 *     there disappears the next time anyone re-runs the pipeline;
 *   * `npm run compare` diffs the build against the live WordPress site, so it can
 *     only be meaningful against an unfixed build — which is the default here.
 *
 * Fixes that need information only the client has — whether the four orphaned
 * drafts should be deleted or finished, whether the empty WooCommerce shop is
 * meant to come back, what the dead "Thank You" popup was for — are deliberately
 * NOT here. See the README.
 */

/** Opt in with `PUBLIC_APPLY_FIXES=on`; the default build is a faithful clone. */
export const FIXES_ON = (import.meta.env.PUBLIC_APPLY_FIXES || '') === 'on';

/** One `String.replace` pair, with the reason it exists. */
interface Rewrite {
  /** Which fragments to apply to — matched against the fragment name. */
  match?: RegExp;
  from: string | RegExp;
  to: string;
  why: string;
}

const REWRITES: Rewrite[] = [
  // ---------------------------------------------------------------- bug 4
  {
    from: 'href="http://www.pbs.org/pov/foodinc/"',
    to: 'href="https://www.pbs.org/pov/foodinc/"',
    why:
      'A link in "GMOs: How they\'re destroying your health" is written without a ' +
      'scheme — `href="www.pbs.org/pov/foodinc/"` — so the browser resolves it ' +
      'against the current directory and it 404s as ' +
      '/physical-health/nutrition/www.pbs.org/pov/foodinc/. Broken on WordPress ' +
      'too; the clone reproduces it and this is the one-line fix.',
  },
  {
    from: 'href="www.pbs.org/pov/foodinc/"',
    to: 'href="https://www.pbs.org/pov/foodinc/"',
    why: 'The schemeless spelling itself — see above.',
  },
];

/**
 * Whole elements to drop, by Elementor `data-id`.
 *
 * Empty: every layout defect found on this site is a content decision for the
 * client rather than a markup one.
 */
const REMOVE: { match: RegExp; ids: string[]; why: string }[] = [];

/** Removes the element whose `data-id` is `id`, and everything inside it. */
function removeElement(html: string, id: string): string {
  const open = html.indexOf(`data-id="${id}"`);
  if (open === -1) return html;
  const start = html.lastIndexOf('<', open);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))?.[1];
  if (!tag) return html;
  // Walk the tag stack forward to the matching close.
  const scan = new RegExp(`<(/?)${tag}\\b`, 'gi');
  scan.lastIndex = start + 1;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      const end = html.indexOf('>', m.index) + 1;
      return html.slice(0, start) + html.slice(end);
    }
  }
  return html;
}

/** Applies every rewrite that targets this fragment. */
export function fixFragment(html: string, name: string): string {
  if (!FIXES_ON) return html;
  let out = html;
  for (const rule of REWRITES) {
    if (rule.match && !rule.match.test(name)) continue;
    out = typeof rule.from === 'string' ? out.split(rule.from).join(rule.to) : out.replace(rule.from, rule.to);
  }
  for (const rule of REMOVE) {
    if (!rule.match.test(name)) continue;
    for (const id of rule.ids) out = removeElement(out, id);
  }
  return out;
}

export interface MetaFix {
  description?: string;
  robots?: string;
}

/**
 * Metadata corrections. Yoast writes this site's head and writes it competently;
 * the entries here are the pages that invite indexing but should not.
 */
const META: Record<string, MetaFix> = {
  // Paginated archives duplicate the first page's title and description. There are
  // 33 of them across the blog index, the twelve category archives and the author
  // archive, so the rule is applied by pattern in fixPageMeta() rather than listed.

  // Four drafts and leftovers that nothing links to but Yoast still advertises.
  '/elementor-3137/': { robots: 'noindex, nofollow' },
  '/foundations-old/': { robots: 'noindex, nofollow' },
  '/schedule/': { robots: 'noindex, nofollow' },
  '/30-days-health-follow-up/': { robots: 'noindex, nofollow' },
};

const PAGINATED = /\/(?:page\/)?\d+\/$/;

export function fixPageMeta(path: string): MetaFix {
  if (!FIXES_ON) return {};
  if (META[path]) return META[path];
  // /blog/2/ … /blog/10/ and /category/…/page/2/ — same title and description as
  // page one, and no reason to be in an index.
  if (PAGINATED.test(path)) return { robots: 'noindex, follow, max-image-preview:large' };
  return {};
}

/**
 * Yoast's block is well-formed on every page, so there is nothing to correct.
 * Kept so the layout's call site stays the same as the sibling projects'.
 */
export function fixSeoHead(html: string): string {
  return html;
}

/**
 * CSS-level corrections, inlined after the compiled Elementor sheets.
 *
 * ---------------------------------------------------------------- bug 1
 * Elementor's compiled kit CSS declares the site's script face with an insecure
 * URL on a secure page:
 *
 *   @font-face { font-family: 'BrittanySignature';
 *                src: url('http://kristenpardue.com/…/BrittanySignature.ttf') }
 *
 * A font is mixed *active* content, so Chrome blocks the request outright and every
 * heading that asks for the family falls back to the next one in its stack. That is
 * what production renders, and the clone reproduces it (see scripts/fetch-css.mjs).
 * Re-declaring the face from this origin is the whole fix — the file is already
 * mirrored at the path below — and it changes what /foundations/ and post 17 look
 * like, which is why it is opt-in rather than applied.
 */
export const FIX_CSS = FIXES_ON
  ? `@font-face {
  font-family: 'BrittanySignature';
  src: url('/wp-content/uploads/2023/02/BrittanySignature.ttf') format('truetype');
  font-display: swap;
}`
  : '';
