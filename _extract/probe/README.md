# Live-DOM probes

Small Playwright scripts that read <https://kristenpardue.com> and print the
post-init DOM facts the clone has to match. They are the evidence behind every
contract in `src/scripts/elementor.js`, which cites them by name — nothing in that
file was guessed.

Run any of them from the project root:

```bash
node _extract/probe/probe-carousels.mjs
```

| Script | What it answers |
| --- | --- |
| `probe-carousels.mjs` | Swiper's real `params` on all four carousels: per-view, spacing, breakpoints (they are Swiper's own 0/767/1024, not Elementor's), loop-copy counts, and the inline styles on the wrapper and slides |
| `probe-countdown-sticky.mjs` | The expired countdown's `display:none` + `flash-animation`, its two cookies, the sticky header's `data-settings`, and the trailing `#elementor-device-mode` / `svg.e-font-icon-svg-symbols` nodes |
| `probe-dropdown.mjs` | The stretched burger panel's inline `top`/`left` at four widths, against the toggle and widget boxes — how we learned it is anchored to the toggle |
| `probe-dropdown-natural.mjs` | The panel's *natural* CSS position, which is the offset Elementor subtracts (and why production's panel sits 10px off the left edge) |
| `probe-button.mjs` | Which CSS rule sets the ThriveCart button's `display` and `font-family` on each side — how we found the dropped protocol-relative loader |
| `probe-gf.mjs` | Gravity Forms' init contract: the wrapper's `display:none` removed, and the conditional field left `display:none` with its input `disabled` |
| `probe-emoji.mjs` | That WordPress's emoji polyfill is swapping emoji for `s.w.org` images under headless Chromium |

`npm run inspect -- /path/ …` does the same job for whole pages, dumping the live
post-init HTML to `_extract/live-dom/` alongside a summary of the same contracts.
