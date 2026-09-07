# Cedar Point Media — Website

A static, no-build marketing site for Cedar Point Media (social media agency),
built on the dark green/mint brand identity already used by Cedar Intelligence.

## Structure

```
index.html            # single-page site (hero, services, work, process, contact, etc.)
assets/css/style.css  # all styling
assets/js/main.js     # mobile nav, scroll reveal, contact form handling
assets/img/           # favicon + og-cover (brand mark as SVG)
```

No build step, framework or dependencies — open `index.html` directly or serve
the folder with any static host.

## Run locally

```
python3 -m http.server 8080
```
then open http://localhost:8080

## Deploy

Any static host works. Two easy options:

- **Netlify**: drag-and-drop the folder, or connect the repo. The contact form
  already has `data-netlify="true"` wired up, so submissions land in your
  Netlify dashboard automatically — no backend needed.
- **GitHub Pages**: enable Pages on this repo pointing at the branch root.

On non-Netlify hosts, the contact form falls back to opening a pre-filled
email to `consultingcedarpoint@gmail.com`.

## Swapping in your real photos and video

This was built before your photos/brand video arrived, so a few things are
placeholders on purpose:

1. **Portfolio images** — in `index.html`, search for `PLACEHOLDER CASE STUDY`.
   Each `.portfolio-media` div currently uses a CSS gradient (`grad-crepe`,
   `grad-barber`, `grad-mobile` in `style.css`). Replace the div's content
   with an `<img>` tag pointing at a real photo once you send them, e.g.:
   ```html
   <div class="portfolio-media">
     <img src="assets/img/work/candy-crepe.jpg" alt="Candy Crêpe campaign" />
   </div>
   ```
2. **Testimonials** — search for `PLACEHOLDER TESTIMONIALS` in `index.html`.
   Replace the sample quotes with real client feedback before launch.
3. **Colors from your video** — the palette is defined once, at the top of
   `assets/css/style.css` under `:root`. Once you send the brand video, pull
   2–3 dominant colors from it and update `--mint`, `--mint2` and `--amber`
   there; everything else on the site references those variables.
4. **Logo mark** — the brand mark is inline SVG in `index.html` (header/footer)
   and in `assets/img/favicon.svg`. If you have a real logo file, swap the
   `<svg>` for an `<img>` tag.

## Sections included

Hero, trust badges, industries strip, services, pricing packages, the
"Why Us / Cedar Intelligence" differentiator, portfolio, process loop,
results & testimonials, an "our approach" section, a CTA banner, FAQ
(native `<details>` accordions, no JS), and a contact form.

## Before going fully live

- **Domain**: `robots.txt`, `sitemap.xml` and the `<link rel="canonical">` /
  Open Graph tags in `index.html` use a placeholder `cedarpointmedia.com`.
  Update those once you've picked and registered a real domain.
- **Pricing**: the three package tiers list scope, not dollar amounts, since
  exact pricing wasn't specified — add numbers if you want them shown.
- See "Swapping in your real photos and video" below for the portfolio,
  testimonials and color placeholders.

## Notes

- Fully responsive (mobile nav, stacking grids) and accessible (skip link,
  labelled form fields, semantic headings, native accordions for FAQ).
- Includes basic SEO: meta description, Open Graph + Twitter card tags,
  JSON-LD structured data, `robots.txt` and `sitemap.xml`.
- No tracking scripts or third-party JS beyond Google Fonts.
