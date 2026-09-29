# True Friends Studio

`studio.truefriends.se`

Web production, graphic design, market communication, photography, video and
editing. A hand-written static site: no build step, no package manager, no
framework.

## Running it

```sh
python3 -m http.server 8802
```

## Structure

```
index.html            the site
img/gallery/          42 photographs, plus thumbs/
js/translations/      EN + SV strings
tools/build-gallery.sh  rebuilds thumbs/ and stamps copyright metadata
tools/check-links.js    resolves every local href, src and anchor
brand/README.md       what is shared with the other two sites
```

## Checking your work

```sh
node tools/check-links.js .
```

It cannot see paths built in JavaScript, and this site builds its gallery
paths that way — so `GALLERY_IMAGES` in `js/main.js` still needs checking by
eye against what is actually in `img/gallery/`.

## Adding a photograph

Drop the full-size file into `img/gallery/`, run `tools/build-gallery.sh`, then
add the filename to the `GALLERY_IMAGES` array in `js/main.js`.

## Known behaviour change

The EN/SV choice is stored in `localStorage`, which browsers scope per origin.
Before the split, choosing Svenska on `/consulting.html` carried over to
`/studio.html`, because both were one origin. They are now separate origins, so
the choice no longer follows a visitor between the two sites — each remembers
its own, and each defaults to English on a first visit.

This is a consequence of the split, not a defect in the code. If it should
follow the visitor, that needs a deliberate mechanism (a `?lang=` parameter on
the cross-site links, or a cookie on `.truefriends.se`), and neither is in
scope for the split.

## History

Split out of `true-friends-website` on 2026-09-29, which remains the archive for
everything before that date.
