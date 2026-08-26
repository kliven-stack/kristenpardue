/** Site-wide switches that a project lead may want to flip without touching markup. */

/**
 * How the site's two lead forms render.
 *
 * - `growthmap` — our own static forms, POSTing to `PUBLIC_CONTACT_ENDPOINT`
 *                 (playbook §4b). This is the migration target.
 * - `embed`     — the originals, byte-identical to the WordPress site: the
 *                 LeadConnector iframe on /contact-us/ and the WPForms markup on
 *                 /pay-my-bill/. Useful only for A/B comparison against production;
 *                 neither actually works once WordPress is gone (see below).
 *
 * With no endpoint configured the originals are kept regardless, so a deploy that
 * happens before the endpoint exists never ships a form that silently goes nowhere.
 *
 * Note the asymmetry between the two originals. The LeadConnector iframe is hosted
 * by GoHighLevel and keeps *working* after cutover — it just stops being ours to
 * route. The WPForms one posts to `/wp-admin/admin-ajax.php` and is dead the moment
 * WordPress is switched off, so `embed` mode is a faithful reproduction there
 * rather than a fallback.
 */
export const FORM_MODE: 'growthmap' | 'embed' =
  (import.meta.env.PUBLIC_FORM_MODE as 'growthmap' | 'embed') || 'growthmap';

/** Growthmap lead endpoint (public by design — it is read in the browser). */
export const CONTACT_ENDPOINT = import.meta.env.PUBLIC_CONTACT_ENDPOINT || '';

/**
 * Whether the pages link Elementor's Google-font stylesheets — Poppins and Lexend
 * Deca, self-hosted by scripts/build-fonts.mjs.
 *
 * `on` is the default because it is what the WordPress site renders: both sheets
 * spell their `src: url(...)` values `https://`, so nothing is blocked as mixed
 * content and the site's real typography arrives. (Worth re-checking per site — the
 * sibling roofinggrowthsystems install spells the same values `http://` on an
 * `https://` page and silently falls back to the system stack.)
 */
export const WEBFONTS: 'off' | 'on' =
  (import.meta.env.PUBLIC_WEBFONTS as 'off' | 'on') || 'on';

/**
 * The GoHighLevel chat bubble WordPress prints on every page.
 *
 * Only governs the copy the plugin puts in <head>. The client also hand-placed a
 * second `<chat-widget>` inside the footer template, which is part of the footer
 * fragment and therefore part of the clone's markup; turning this off leaves that
 * one in place, exactly as removing the plugin from WordPress would.
 */
export const CHAT_WIDGET = (import.meta.env.PUBLIC_CHAT_WIDGET || 'on') !== 'off';

/**
 * The client's Google tags — GTM, two GA4 properties and one Ads conversion tag.
 *
 * On by default: they are the client's own properties, they outlive the WordPress
 * install, and dropping them silently would break their reporting on cutover day.
 * `PUBLIC_ANALYTICS=off` builds a clean page for measurement work — `npm run
 * compare` and `npm run functional` both set it, so the harness never has Google's
 * scripts moving numbers underneath it.
 */
export const ANALYTICS = (import.meta.env.PUBLIC_ANALYTICS || 'on') !== 'off';

export const SITE_NAME = 'Cutting Edge Foot & Ankle';
