/** Site-wide switches that a project lead may want to flip without touching markup. */

/**
 * There is no form switch on this site, and that is the decision rather than an
 * omission: every form ships exactly as WordPress serves it.
 *
 * The lead forms are third-party embeds — a LeadConnector iframe in popup 2995,
 * five more booking iframes on the scheduling pages, and ActiveCampaign form 5 on
 * /contact-me/. Their hosts outlive the WordPress install, so the embed *is* the
 * working form and replacing it with our own would trade a form that works for one
 * that needs an endpoint configured before it does.
 *
 * The four WordPress-rendered forms (three Gravity Forms, one Elementor Pro form)
 * are cloned exactly and stop delivering on cutover. See the README.
 */

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
