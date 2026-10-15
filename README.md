# True Friends Studio

`studio.truefriends.se`

Web production, graphic design, market communication, photography, video and
editing. A hand-written static site: no build step, no package manager, no
framework. The whole site is `index.html`, three stylesheets and two scripts.

## Running it

```sh
python3 -m http.server 8802
```

## Structure

```
index.html            the site
css/tokens.css        colours, type, spacing, motion — every named value
css/base.css          reset, element defaults, utilities
css/site.css          layout and components
js/lang-boot.js       decides the language before first paint (blocking)
js/translations.js    every string, English and Swedish
js/main.js            language switching, nav, gallery, dialogs, forms
img/                  favicon, hero photo, navbar mark, page name
img/gallery/          42 photographs, plus thumbs/
tools/check.mjs       everything checkable without a browser
tools/build-gallery.sh  rebuilds thumbs/ and stamps copyright metadata
```

## Checking your work

```sh
node tools/check.mjs .
```

Five passes over the tree: every local `href`/`src` and `#anchor` resolves,
every translation key exists in both languages and every English fallback in
the markup matches its dictionary string, no key is defined that nothing
references, `GALLERY_IMAGES` matches what is in `img/gallery/`, and anything
in `img/` that nothing references is reported at the end. It exits non-zero on
any problem, so it is the thing to run before committing.

What it cannot see: how anything looks. That needs a browser.

## Adding a photograph

Drop the full-size file into `img/gallery/`, run `tools/build-gallery.sh`, then
add the filename to the `GALLERY_IMAGES` array in `js/main.js` and run the
checker, which will tell you if you forgot.

`build-gallery.sh` is idempotent, so re-running it after changing `SIZE` or
`QUALITY` rebuilds every thumbnail. It stamps both the full-size files and the
thumbnails with the copyright block, and needs `cwebp`, `webpmux` and `sips`
(so: macOS).

## Two things to know before you change the design

Everything else here is yours to change. These two are not preferences — they
are measurements, and they will cost you an afternoon if you learn them the
hard way.

### The brand colours cannot be text on a light ground

Measured contrast against each candidate ground:

| | on ink `#0a0a0a` | on cream `#faf9f5` | on white |
|---|---|---|---|
| yellow `#fee440` | **15.45** — body text | 1.22 — unusable | 1.28 — unusable |
| flame `#ff3b1f` | **5.56** — body text | 3.38 — large only | 3.56 — large only |

On dark, both work as ink and yellow is the natural text accent. **On light,
neither can set body text.** Yellow can only be a fill with ink knocked out of
it; flame is limited to 24px+ or 19px-bold, so headings and large UI only. A
light-ground redesign that wants yellow emphasis has to invent a fill-based
device — that is not a style choice, it is the only option left.

### Do not recolour the logo

The artwork carries three colours — a near-black body, a white screen and a
yellow smiley. Treating it as a silhouette destroys the screen and the face,
and a CSS `filter: brightness(0)` turns it into a black blob; this has been
tried.

That is why the navbar used to swap between two image files on hover rather
than recolouring one: CSS cannot recolour the fills inside an `<img>`, and
masking the SVG does not work either because its root is `width="100%"`
`height="100%"` and so carries no intrinsic size. As of October 2026 there is
one mark and the hover is an opacity fade — see the note below.

## The chrome change

`img/tf-smiley-chrome-transparent.webp` replaced the two SVG smileys, the same
change the consulting navbar made. It is the landing's hero mark, so it is
umbrella artwork: change it in all three repositories or in none.

It is also the one mark on the site that is a bitmap. It arrived as a rendered
cut with no vector source, which is why the two-drawing hover is gone: there is
no second cut to swap to, and nothing to derive one from that would register
against a rendered chrome ball. The hover is a fade on the one file.

`img/tf-archivo-studio-chrome-transparent.svg` is the page name, still vector,
with a chrome `linearGradient` painted into the glyphs in place of the flat
yellow. That is a fill on a drawing, not a recolour of an `<img>`: the gradient
is `defs` inside the file, so the three-colour warning above does not apply to
it. The flame drop-shadow that used to sit behind the wordmark went with the
yellow — a red offset behind metal that already has its own shading had nothing
left to misregister against.

## History

Split out of `true-friends-website` on 2026-09-29, which remains the archive for
everything before that date.