/* True Friends — page behaviour: language switching, mobile nav, the gallery
 * and its lightbox, the dialogs, and the contact forms. */
(function () {
  "use strict";

  /* Mirrors js/lang-boot.js, which runs before this file and cannot import
     from it — the page CSP forbids inline scripts, so the two copies of these
     two constants are the price of not flashing English at Swedish visitors. */
  const SUPPORTED = ["en", "sv"];
  const DEFAULT_LANG = "en";
  const STORAGE_KEY = "tf_lang";

  /* The pixel size of img/gallery/thumbs/*.webp, set by tools/build-gallery.sh.
     Declared on every gallery <img> so the browser reserves the right box
     before the file arrives. */
  const THUMB_SIZE = 320;

  const get = (object, path) =>
    path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), object);

  /* ---------- i18n ---------- */

  // {year} in the copyright, {n} in the gallery labels.
  const fill = (string, params) => {
    let out = string.replaceAll("{year}", String(new Date().getFullYear()));
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        out = out.replaceAll(`{${key}}`, String(value));
      }
    }
    return out;
  };

  let currentLang = DEFAULT_LANG;

  /* Strings that only exist once the gallery has been built from JS. Assigned
     by the gallery block; called after every language change so its labels do
     not stay in the language the page happened to load in. */
  let relabelGallery = () => {};

  // Look up a key in the active language, falling back to English and then to
  // the key itself, so a missing string shows its own name rather than a hole.
  function t(key, params) {
    const dicts = window.TF_TRANSLATIONS || {};
    const value = get(dicts[currentLang], key) ?? get(dicts[DEFAULT_LANG], key);
    return typeof value === "string" ? fill(value, params) : key;
  }

  const I18N_ATTRS = [
    "data-i18n",
    "data-i18n-html",
    "data-i18n-placeholder",
    "data-i18n-aria-label",
    "data-i18n-content",
    "data-i18n-alt",
  ];

  // One pass over the document rather than one per attribute: the nodes never
  // change, only their text.
  const TRANSLATED = [...document.querySelectorAll(I18N_ATTRS.map((a) => `[${a}]`).join(","))];

  function applyTranslations(lang) {
    const dict = (window.TF_TRANSLATIONS || {})[lang];
    if (!dict) {
      // No dictionary — reveal rather than sit behind the veil.
      document.documentElement.removeAttribute("data-tf-translating");
      return;
    }
    currentLang = lang;
    document.documentElement.lang = lang;

    for (const el of TRANSLATED) {
      for (const attr of I18N_ATTRS) {
        const key = el.getAttribute(attr);
        if (!key) continue;
        const value = get(dict, key);
        if (typeof value !== "string") continue;
        const text = fill(value);
        if (attr === "data-i18n") {
          // Skipping unchanged text keeps a language switch from dirtying
          // every node and re-running layout for the whole document.
          if (el.textContent !== text) el.textContent = text;
        } else if (attr === "data-i18n-html") {
          if (el.innerHTML !== text) el.innerHTML = text;
        } else {
          el.setAttribute(attr.replace("data-i18n-", ""), text);
        }
      }
    }

    document.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
    });

    // lang-boot.js held the first paint back; it has now happened.
    document.documentElement.removeAttribute("data-tf-translating");
  }

  /* English is the default for everyone. The only thing that changes it is
     the visitor picking Svenska, which is remembered in localStorage. There is
     deliberately no locale guessing: navigator.language got it wrong both ways
     — a Swedish speaker abroad, an English speaker in Sweden. */
  function storedLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(stored)) return stored;
    } catch (e) {
      // Storage blocked; English it is.
    }
    return DEFAULT_LANG;
  }

  function switchLanguage(lang) {
    applyTranslations(lang);
    relabelGallery();
  }

  // Applied immediately, so the first paint is already the right language.
  switchLanguage(storedLanguage());

  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (!SUPPORTED.includes(lang)) return;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (e) {
        // Storage blocked; the choice just will not persist.
      }
      switchLanguage(lang);
    });
  });

  // A page restored from the back/forward cache keeps its frozen DOM and state,
  // so nothing above re-runs. Re-read the stored choice in case it moved.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const lang = storedLanguage();
    if (lang !== currentLang) switchLanguage(lang);
  });

  /* ---------- Mobile nav ---------- */

  const nav = document.getElementById("site-nav");
  const toggle = nav && nav.querySelector(".nav__toggle");

  if (nav && toggle) {
    const setOpen = (open) => {
      nav.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => setOpen(nav.dataset.open !== "true"));

    // Following a link inside the drawer should not leave it hanging open over
    // the section it just scrolled to.
    nav.querySelectorAll(".nav__drawer a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });
  }

  /* ---------- Gallery and lightbox ----------
     To add a photo: drop the file into img/gallery/, run
     `bash tools/build-gallery.sh`, and add its filename to GALLERY_IMAGES. */

  const GALLERY_IMAGES = [
    "01.webp", "02.webp", "03.webp", "04.webp", "05.webp", "06.webp", "07.webp",
    "08.webp", "09.webp", "10.webp", "11.webp", "12.webp", "13.webp", "14.webp",
    "15.webp", "16.webp", "17.webp", "18.webp", "19.webp", "20.webp", "21.webp",
    "22.webp", "23.webp", "24.webp", "25.webp", "26.webp", "27.webp", "28.webp",
    "29.webp", "30.webp", "31.webp", "32.webp", "33.webp", "34.webp", "35.webp",
    "36.webp", "37.webp", "38.webp", "39.webp", "40.webp", "41.webp", "42.webp",
  ];

  const gallery = document.querySelector(".gallery-listing");
  const lightbox = document.getElementById("gallery-lightbox");

  if (gallery && lightbox) {
    // Two sources per photo: the square thumbnail for the grid and the
    // lightbox strip, and the full-size file, fetched only once the lightbox
    // opens.
    const photos = GALLERY_IMAGES.map((file, i) => ({
      n: i + 1,
      full: `img/gallery/${file}`,
      thumb: `img/gallery/thumbs/${file}`,
    }));

    const grid = gallery.querySelector(".gallery-listing__rows");
    const rows = document.createDocumentFragment();

    const tileImage = (photo) => {
      const image = document.createElement("img");
      image.src = photo.thumb;
      // Empty alt: the grid tile's own aria-label and the lightbox caption
      // already name the photo, so the image itself adds nothing. Filled in
      // for the grid below, once the language is known.
      image.alt = "";
      image.width = THUMB_SIZE;
      image.height = THUMB_SIZE;
      image.decoding = "async";
      return image;
    };

    photos.forEach((photo) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery__tile";
      button.dataset.index = String(photo.n - 1);
      button.appendChild(tileImage(photo));
      button.firstChild.loading = "lazy";

      const item = document.createElement("li");
      item.appendChild(button);
      rows.appendChild(item);
    });

    // One insertion, rather than 42 that each invalidate the list's layout.
    grid.replaceChildren(rows);

    relabelGallery = () => {
      grid.querySelectorAll(".gallery__tile").forEach((tile, i) => {
        tile.setAttribute("aria-label", t("gallery.openPhoto", { n: i + 1 }));
        tile.querySelector("img").alt = t("gallery.photoAlt", { n: i + 1 });
      });
      thumbs.forEach((thumb, i) => {
        thumb.setAttribute("aria-label", t("gallery.thumbLabel", { n: i + 1 }));
      });
      if (lightbox.open) image.alt = t("gallery.photoAlt", { n: active + 1 });
    };

    /* `error` does not bubble, so this listens in the capture phase and hides
       the broken image — the tile's own placeholder background then shows
       through, which is what it is there for. One listener, not 42. */
    grid.addEventListener(
      "error",
      (event) => {
        if (event.target.tagName === "IMG") event.target.style.display = "none";
      },
      true,
    );

    /* ---------- Lightbox ---------- */

    const image = lightbox.querySelector(".lightbox__image");
    const caption = lightbox.querySelector(".lightbox__caption");
    const strip = lightbox.querySelector("[data-lightbox-thumbs]");
    const prev = lightbox.querySelector("[data-lightbox-prev]");
    const next = lightbox.querySelector("[data-lightbox-next]");
    const close = lightbox.querySelector("[data-lightbox-close]");

    /* Built on first open, not at load: the strip is 42 thumbnails, and most
       visitors never open the lightbox. */
    let thumbs = [];

    const buildStrip = () => {
      const rows = document.createDocumentFragment();
      thumbs = photos.map((photo) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lightbox__thumb";
        button.dataset.index = String(photo.n - 1);
        button.appendChild(tileImage(photo));

        const item = document.createElement("li");
        item.appendChild(button);
        rows.appendChild(item);
        return button;
      });
      strip.replaceChildren(rows);
      relabelGallery();
    };

    image.addEventListener("error", () => {
      image.style.visibility = "hidden";
    });
    image.addEventListener("load", () => {
      image.style.visibility = "";
    });

    let active = 0;

    const show = (index) => {
      active = (index + photos.length) % photos.length;
      const photo = photos[active];

      /* A fresh src leaves the previous frame painted until the new one
         decodes, so blank the element before swapping — otherwise navigating
         shows a flash of the last photo. Anything already in cache is
         revealed in the same tick. */
      image.style.visibility = "hidden";
      image.src = photo.full;
      if (image.complete && image.naturalWidth) image.style.visibility = "";
      image.alt = t("gallery.photoAlt", { n: photo.n });
      caption.textContent = `${active + 1} / ${photos.length}`;

      // All the attribute writes first, then one scroll: interleaving them
      // forces a layout per photo.
      thumbs.forEach((thumb, i) => thumb.setAttribute("aria-current", String(i === active)));
      thumbs[active]?.scrollIntoView({ inline: "center", block: "nearest" });
    };

    const openAt = (index) => {
      if (!thumbs.length) buildStrip();
      show(index);
      openDialog(lightbox);
    };

    grid.addEventListener("click", (event) => {
      const tile = event.target.closest(".gallery__tile");
      if (tile) openAt(Number(tile.dataset.index) || 0);
    });

    prev.addEventListener("click", () => show(active - 1));
    next.addEventListener("click", () => show(active + 1));
    close.addEventListener("click", () => lightbox.close());

    strip.addEventListener("click", (event) => {
      const thumb = event.target.closest(".lightbox__thumb");
      if (thumb) show(Number(thumb.dataset.index) || 0);
    });

    // Esc closes natively.
    document.addEventListener("keydown", (event) => {
      if (!lightbox.open) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(active - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        show(active + 1);
      }
    });

    // The grid was built before relabelGallery existed; label it in the
    // language that actually applies.
    relabelGallery();
  }

  /* ---------- Back to top ---------- */

  const backToTop = document.getElementById("back-to-top");
  if (backToTop) {
    backToTop.hidden = false;
    let ticking = false;

    // Reveals past ~60% of the window. The scroll listener fires far more often
    // than the value changes, so writes are coalesced into one per frame.
    const update = () => {
      ticking = false;
      backToTop.dataset.visible = String(window.scrollY > window.innerHeight * 0.6);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Dialogs ---------- */

  const openDialog = (dialog) => {
    // showModal is what gives a <dialog> focus trapping and Esc; the attribute
    // is the fallback for browsers without it.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  document.querySelectorAll("[data-modal-open]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      const dialog = document.getElementById(trigger.dataset.modalOpen);
      if (dialog) openDialog(dialog);
    });
  });

  document.querySelectorAll("[data-modal-close]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const dialog = trigger.closest("dialog");
      if (!dialog) return;
      dialog.close();
      // Leave no stale "sending…" behind the next time it opens.
      const status = dialog.querySelector(".form__status");
      if (status) status.textContent = "";
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    // A click on the dialog element itself is a click on the backdrop, since
    // the inner box covers the rest.
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  /* ---------- Forms ---------- */

  const RATE_LIMIT_MS = 10_000;
  const TIMEOUT_MS = 15_000;
  // One window across both forms, so the limit cannot be side-stepped by
  // sending from the page and then from the dialog.
  let lastSubmitAt = 0;

  const singleLine = (value) =>
    String(value)
      .replace(/[\r\n\t\0\x00-\x1F\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const multiLine = (value) =>
    String(value)
      .replace(/\r\n/g, "\n")
      .replace(/[\0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim();

  /* Caps each value at the maxlength the markup already declares, so there is
     one source of truth for the limits rather than two that can drift. */
  const sanitise = (form, raw) => {
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      const field = form.elements.namedItem(key);
      const capped = String(value).slice(0, field?.maxLength || 5000);
      out[key] = key === "message" ? multiLine(capped) : singleLine(capped);
    }
    return out;
  };

  document.querySelectorAll("form[data-endpoint]").forEach((form) => {
    const status = form.querySelector(".form__status");
    const submit = form.querySelector('button[type="submit"]');

    const say = (text, state) => {
      if (!status) return;
      status.textContent = text;
      if (state) status.dataset.state = state;
      else status.removeAttribute("data-state");
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const now = Date.now();
      const since = now - lastSubmitAt;
      if (since < RATE_LIMIT_MS) {
        say(t("status.rateLimited", { wait: Math.ceil((RATE_LIMIT_MS - since) / 1000) }), "error");
        return;
      }

      if (!form.reportValidity()) return;

      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        say(t("status.notConfigured"), "error");
        return;
      }

      const raw = Object.fromEntries(new FormData(form).entries());

      // Honeypot: a bot filled the field no human can see. Report success so
      // it does not try again, and send nothing.
      if (String(raw._honey || "").trim() !== "") {
        form.reset();
        say(t("status.success"), "success");
        lastSubmitAt = now;
        return;
      }

      const payload = { ...raw, ...sanitise(form, raw) };
      delete payload._honey;

      if (submit) submit.disabled = true;
      say(t("status.sending"));
      lastSubmitAt = now;

      // Without a timeout a hung request leaves the button disabled for good.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: abort.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success !== "false") {
          form.reset();
          say(t("status.success"), "success");
        } else {
          say(data.message || t("status.error"), "error");
        }
      } catch (err) {
        say(t("status.network"), "error");
      } finally {
        clearTimeout(timer);
        if (submit) submit.disabled = false;
      }
    });
  });
})();