/** Site-wide switches that a project lead may want to flip without touching markup. */

/**
 * How the site's contact form renders.
 *
 * - `growthmap` — our own static form, POSTing to `PUBLIC_CONTACT_ENDPOINT`
 *                 (playbook §4b). This is the migration target.
 * - `embed`     — the original, byte-identical to the WordPress site: the
 *                 ActiveCampaign form-5 embed on /contact-me/. Useful only for A/B
 *                 comparison against production.
 *
 * With no endpoint configured the original is kept regardless, so a deploy that
 * happens before the endpoint exists never ships a form that silently goes nowhere.
 * ActiveCampaign hosts that embed, so it keeps working after cutover — it just
 * stops being ours to route.
 *
 * The site's other four forms are not affected by this switch. Gravity Forms 8, 2
 * and the 40-field intake form, plus the Elementor Pro form on the /elementor-3137/
 * draft, are rendered server-side with their own stylesheets, so their markup is
 * cloned verbatim and only their POST target is repointed — by `initHostedForms()`
 * in src/scripts/elementor.js, from the same endpoint.
 */
export const FORM_MODE: 'growthmap' | 'embed' =
  (import.meta.env.PUBLIC_FORM_MODE as 'growthmap' | 'embed') || 'growthmap';

/** Growthmap lead endpoint (public by design — it is read in the browser). */
export const CONTACT_ENDPOINT = import.meta.env.PUBLIC_CONTACT_ENDPOINT || '';

/**
 * Whether the pages link the five Google families, self-hosted by
 * scripts/build-fonts.mjs: Montserrat and Raleway (the kit's heading and body
 * faces), plus Oswald, Poiret One and Sacramento for individual widgets.
 *
 * `on` is the default because it is what the WordPress site renders — there it
 * fetches them from fonts.googleapis.com on every page load; here they come from
 * this origin, latin subsets only, with `font-display: swap`.
 *
 * This does NOT govern the site's sixth face, `BrittanySignature.ttf`. That one is
 * declared in Elementor's compiled CSS with an `http://` URL on an `https://` page,
 * so Chrome blocks it as mixed content and the headings that ask for it fall back —
 * on production and, faithfully, here. See the README's bug register and
 * `PUBLIC_APPLY_FIXES`.
 */
export const WEBFONTS: 'off' | 'on' =
  (import.meta.env.PUBLIC_WEBFONTS as 'off' | 'on') || 'on';

/**
 * Kept for parity with the sibling clones, and inert here: this install carries no
 * chat bubble of any kind. `npm run extract` writes an empty fragment, and if the
 * client adds one before cutover a re-extract picks it up with no code change.
 */
export const CHAT_WIDGET = (import.meta.env.PUBLIC_CHAT_WIDGET || 'on') !== 'off';

/**
 * Third-party analytics, likewise inert: there is no Google Tag Manager container,
 * no GA4 property, no Ads tag and no Meta pixel anywhere on this site — the only
 * tracking it carries is ActiveCampaign's own WordPress plugin, which dies with the
 * install. That is worth telling the client about rather than silently matching;
 * see the README.
 *
 * `npm run compare` and `npm run functional` both set `PUBLIC_ANALYTICS=off` so a
 * measurement run can never have third-party scripts moving numbers underneath it.
 */
export const ANALYTICS = (import.meta.env.PUBLIC_ANALYTICS || 'on') !== 'off';

export const SITE_NAME = 'Kristen Pardue';
