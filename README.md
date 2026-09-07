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

## Design decisions (no photos or video)

There's no client photography or brand video behind this site, so the
design leans on color and typography instead of imagery:

- **Portfolio cards** use a bold gradient tile per brand (`grad-crepe`,
  `grad-barber`, `grad-mobile` in `style.css`) with a simple line-icon
  watermark (`.portfolio-icon` in `index.html`) representing the industry.
  This is a deliberate, finished design — not a stand-in.
- **Brand colors** come from the dark green/mint palette already established
  by Cedar Intelligence, defined once at the top of `assets/css/style.css`
  under `:root` (`--mint`, `--mint2`, `--amber`, etc.).
- **Testimonials** are sample quotes attributed to the three case-study
  clients — swap in real feedback whenever you have it (search
  `PLACEHOLDER TESTIMONIALS` in `index.html`).

If real photos or video ever do become available, drop an `<img>`/`<video>`
into a `.portfolio-media` div in place of its gradient + icon, and pull 2–3
accent colors from the footage into the `:root` variables above.

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
