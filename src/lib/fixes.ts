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
 * Fixes that need information only the client has — which of the four staff pages
 * should come back as real pages rather than redirects, what the duplicated GA4
 * property is for, whether the two orphaned "copy" pages should be deleted — are
 * deliberately NOT here. See the README.
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
  // ---------------------------------------------------------------- bug 15
  {
    match: /^page-blog__ingrown-toenail-treatment$/,
    from: /\/wp-content\/uploads\/2020\/03\/Depositphotos_440978016_XL\.jpg 7952w, /,
    to: '',
    why:
      'The hero image on this post is a 7952x5304 stock photo weighing 11.8 MB, ' +
      'offered as the largest srcset candidate with sizes="(max-width: 7952px) ' +
      '100vw, 7952px" and fetchpriority="high". It renders 345 CSS px wide. On a ' +
      'retina desktop (1440 @2x) the browser needs ~690px, finds nothing between ' +
      'the 1536w variant and the original, and downloads all 11.8 MB — measured, ' +
      'not assumed. Dropping the 7952w candidate leaves 1536w as the largest, ' +
      'which is still more than twice the pixels the layout can use, so nothing ' +
      'renders any differently.',
  },
  {
    match: /^page-blog__ingrown-toenail-treatment$/,
    from: 'src="/wp-content/uploads/2020/03/Depositphotos_440978016_XL.jpg"',
    to: 'src="/wp-content/uploads/2020/03/Depositphotos_440978016_XL-1536x1025.jpg"',
    why:
      'The `src` fallback for the same image. Without this the 11.8 MB original is ' +
      'still what any client ignoring srcset fetches.',
  },

  // ---------------------------------------------------------------- bug 2
  {
    from: 'href="/Testimonials"',
    to: 'href="/testimonials/"',
    why:
      'Two hand-built Elementor breadcrumbs link "/Testimonials" — wrong case, no ' +
      'trailing slash. WordPress answers 200 on it and canonicalises to ' +
      '/testimonials/, but a static host is case-sensitive, so the clone carries a ' +
      'redirect in vercel.json to keep the link alive. This rewrites the link ' +
      'itself, which is the actual fix.',
  },
];

/**
 * Whole elements to drop, by Elementor `data-id`.
 *
 * Empty: every layout defect found on this site is either a content decision for
 * the client or a markup issue fixed by a rewrite above.
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
  // Paginated archives duplicate the first page's title and description.
  '/blog/page/2/': { robots: 'noindex, follow, max-image-preview:large' },
  '/blog/page/3/': { robots: 'noindex, follow, max-image-preview:large' },
  '/blog/category/uncategorized/page/2/': { robots: 'noindex, follow, max-image-preview:large' },
  '/blog/category/uncategorized/page/3/': { robots: 'noindex, follow, max-image-preview:large' },
  // An unlinked duplicate of /patient-forms/, left over from an edit.
  '/patient-forms-copy/': { robots: 'noindex, nofollow' },
};

export function fixPageMeta(path: string): MetaFix {
  if (!FIXES_ON) return {};
  return META[path] ?? {};
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
 * Empty on purpose so far — filled in only if the client asks for one of the
 * layout defects in the README to be corrected.
 */
export const FIX_CSS = '';
