#!/usr/bin/env node
/* Everything that can be checked about a site this size without a browser.
 *
 *   node tools/check.mjs [dir]
 *
 * Five passes:
 *   links      every local href/src, plus #anchor targets, on every page
 *   i18n       every referenced key resolves in both languages, every
 *              fallback matches its English string, and no key is defined
 *              that nothing references
 *   gallery    GALLERY_IMAGES in js/main.js matches img/gallery/ on disk
 *   assets     reports files under img/ that nothing references
 *
 * The pages and their dictionaries are discovered by walking the tree rather
 * than listed here. A hardcoded table goes stale the moment a page is added or
 * renamed, and a stale table fails silently: it skips pages that no longer
 * exist and reports nothing about the ones that do.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
let problems = 0;

const fail = (msg) => {
  problems++;
  console.log(msg);
};

// HTML comments hold authoring notes, not references.
const strip = (src) => src.replace(/<!--[\s\S]*?-->/g, "");

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const p = path.join(dir, entry.name);
    entry.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const files = walk(root);
const rel = (f) => path.relative(root, f);
const read = (f) => strip(fs.readFileSync(f, "utf8"));

/* ---------- pages and their dictionaries ---------- */

// A page's own dictionary is whichever js/translations.js — or
// js/translations/<name>.js, if that layout ever comes back — it loads after
// nothing else. Reading that out of the markup keeps the tool from being a
// second place where the page list lives.
const DICT = /js\/(?:translations\/([^/"]+)|translations)\.js/g;

const pages = files
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const src = read(f);
    const dicts = [...src.matchAll(DICT)].map((m) => m[1] || "translations");
    return { file: f, dicts: [...new Set(dicts)] };
  });

/* ---------- links ---------- */

// The lookbehind matters: a bare \b also matches inside a hyphenated
// attribute name, which would make the checker read a translation KEY as a
// path. Keys are covered by the i18n pass instead.
const REFS = /(?<![-\w])(?:href|src)="([^"]+)"/g;
const EXTERNAL = /^(https?:|mailto:|tel:|data:|#|\/\/)/;

const idsOf = (f) =>
  new Set([...read(f).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

let refs = 0;
for (const { file } of pages) {
  for (const [, ref] of read(file).matchAll(REFS)) {
    refs++;
    if (EXTERNAL.test(ref)) {
      // A same-page anchor still needs its target to exist.
      if (ref.startsWith("#") && ref !== "#" && !idsOf(file).has(ref.slice(1))) {
        fail(`BROKEN  ${rel(file)}  ->  ${ref}  (no such id on this page)`);
      }
      continue;
    }
    const [target, hash] = ref.split("#");
    let abs = path.resolve(path.dirname(file), target.split("?")[0]);
    if (!fs.existsSync(abs)) {
      fail(`BROKEN  ${rel(file)}  ->  ${ref}  (file not found)`);
      continue;
    }
    // A link to a directory is served as its index.html.
    if (fs.statSync(abs).isDirectory()) {
      abs = path.join(abs, "index.html");
      if (!fs.existsSync(abs)) {
        fail(`BROKEN  ${rel(file)}  ->  ${ref}  (directory has no index.html)`);
        continue;
      }
    }
    if (hash && abs.endsWith(".html") && !idsOf(abs).has(hash)) {
      fail(`BROKEN  ${rel(file)}  ->  ${ref}  (file exists, anchor does not)`);
    }
  }
}

// Paths that live in data rather than markup.
for (const f of files.filter((f) => /translations/.test(f) && f.endsWith(".js"))) {
  for (const [, target] of fs
    .readFileSync(f, "utf8")
    .matchAll(/"((?:img|css|js)\/[^"]+)"/g)) {
    refs++;
    if (!fs.existsSync(path.resolve(root, target))) {
      fail(`BROKEN  ${rel(f)}  ->  ${target}  (referenced from data)`);
    }
  }
}

/* ---------- i18n ---------- */

const loadDictionaries = (names) => {
  globalThis.window = {};
  for (const name of names) {
    const candidates = [
      path.join(root, "js/translations", `${name}.js`),
      path.join(root, "js", `${name}.js`),
    ];
    const file = candidates.find(fs.existsSync);
    if (!file) {
      fail(`MISSING dictionary for "${name}" — looked in ${candidates.map((p) => rel(p)).join(", ")}`);
      continue;
    }
    new Function(fs.readFileSync(file, "utf8"))();
  }
  const dict = globalThis.window.TF_TRANSLATIONS;
  if (!dict) fail("MISSING window.TF_TRANSLATIONS");
  return dict || {};
};

const get = (o, p) =>
  p.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o);

// Renders the HTML fallback as text so it can be compared to the plain string
// it is supposed to mirror. Tags become spaces: `a.<br>b` and `a. <br>b` are
// the same sentence, and a <br> is a line break rather than a word boundary.
const asText = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&copy;/g, "©")
    .replace(/\s+/g, " ")
    .trim();

const ATTRS = [
  "data-i18n",
  "data-i18n-html",
  "data-i18n-placeholder",
  "data-i18n-aria-label",
  "data-i18n-content",
  "data-i18n-alt",
];

const referenced = new Set();
let keys = 0;

for (const { file, dicts } of pages) {
  const dict = loadDictionaries(dicts);
  const src = read(file);

  for (const attr of ATTRS) {
    for (const [, key] of src.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, "g"))) {
      referenced.add(key);
      keys++;
      for (const lang of ["en", "sv"]) {
        if (typeof get(dict[lang], key) !== "string") {
          fail(`MISSING ${rel(file)}  ${attr}="${key}" unresolved in ${lang}`);
        }
      }
    }
  }

  // Fallbacks: what the browser paints before the translation pass runs, and
  // what it keeps with scripting off. Keys with a {placeholder} are filled at
  // runtime, so their markup cannot match the raw string and is skipped.
  const FALLBACK = /<(\w+)(?=[\s>])[^<>]*\s(?:data-i18n|data-i18n-html)="([^"]+)"[^<>]*>([\s\S]*?)<\/\1>/g;
  for (const [, , key, text] of src.matchAll(FALLBACK)) {
    const en = get(dict.en, key);
    if (typeof en !== "string" || en.includes("{")) continue;
    if (!text.trim()) {
      fail(`EMPTY   ${rel(file)}  ${key} has no fallback, so scripting off loses it`);
      continue;
    }
    if (asText(text) !== asText(en)) {
      fail(`DRIFT   ${rel(file)}  ${key}\n           markup: ${asText(text)}\n           en:     ${asText(en)}`);
    }
  }
}

// Keys asked for from script rather than from markup, through the lookup
// helper. These have no fallback to compare — the string only exists at runtime
// — so they are checked for resolution in both languages and nothing more.
const siteDict = pages.length ? loadDictionaries(pages[0].dicts) : {};
for (const f of files.filter((f) => f.endsWith(".js") && !f.includes("translations"))) {
  for (const [, key] of fs.readFileSync(f, "utf8").matchAll(/\bt\("([^"]+)"/g)) {
    referenced.add(key);
    keys++;
    for (const lang of ["en", "sv"]) {
      if (typeof get(siteDict[lang], key) !== "string") {
        fail(`MISSING ${rel(f)}  t("${key}") unresolved in ${lang}`);
      }
    }
  }
}

// The other direction: a key nothing asks for is dead weight, and the usual
// reason it is there is a page that has since been deleted.
const leaves = (o, prefix = "") =>
  Object.entries(o || {}).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? leaves(v, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k],
  );

for (const dicts of [...new Set(pages.map((p) => p.dicts.join(",")))]) {
  const dict = loadDictionaries(dicts.split(","));
  for (const key of new Set(leaves(dict.en))) {
    if (!referenced.has(key)) fail(`UNUSED  translation key ${key} is defined but never referenced`);
  }
}

/* ---------- gallery ---------- */

const galleryDir = path.join(root, "img/gallery");
const main = path.join(root, "js/main.js");
if (fs.existsSync(galleryDir) && fs.existsSync(main)) {
  const onDisk = fs
    .readdirSync(galleryDir)
    .filter((f) => /^\d+\.webp$/.test(f))
    .sort();
  const array = fs
    .readFileSync(main, "utf8")
    .match(/GALLERY_IMAGES\s*=\s*\[([\s\S]*?)\]/)?.[1];
  const listed = array ? [...array.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

  for (const file of onDisk) {
    if (!listed.includes(file)) fail(`GALLERY img/gallery/${file} is not in GALLERY_IMAGES`);
  }
  for (const file of listed) {
    if (!onDisk.includes(file)) fail(`GALLERY GALLERY_IMAGES lists ${file}, which is not on disk`);
    if (!fs.existsSync(path.join(galleryDir, "thumbs", file))) {
      fail(`GALLERY img/gallery/thumbs/${file} is missing — run tools/build-gallery.sh`);
    }
  }
}

/* ---------- assets ---------- */

// Anything in img/ that no page, stylesheet or script names is a leftover.
// Referenced paths, keyed relative to the repo root so `img/x.svg` in markup
// and `../img/x.svg` in a stylesheet resolve to the same entry.
const used = new Set();
for (const f of files.filter((f) => [".html", ".css", ".js"].includes(path.extname(f)))) {
  const src = fs.readFileSync(f, "utf8");
  const found = [
    ...src.matchAll(/["'(]((?:\.\.\/)*img\/[^"')]+)/g),
    ...src.matchAll(/url\(["']?((?:\.\.\/)*img\/[^"')]+)/g),
  ];
  for (const [, ref] of found) used.add(ref.replace(/^(\.\.\/)+/, ""));
}

const orphans = fs
  .readdirSync(path.join(root, "img"), { withFileTypes: true })
  .filter((e) => e.isFile() && !used.has(path.join("img", e.name)))
  .map((e) => e.name);

console.log(
  `\n${refs} references, ${keys} translation keys, ${pages.length} page(s) checked`,
);
if (orphans.length) {
  console.log(`\nnot referenced by anything:\n  ${orphans.join("\n  ")}`);
}

console.log(problems ? `\n${problems} problem(s)` : "clean");
process.exit(problems ? 1 : 0);