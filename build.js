// Builds the static site from src/ into dist/. No dependencies: `node build.js`.
//
//  - src/pages/*.html            one output page each
//  - <!-- include: name -->      inserts src/partials/name.html (nested includes allowed)
//  - {{ path.to.value }}         inserts a value from src/data/site.json
//  - <!-- camps -->              renders the upcoming camps list from site.json
//  - <!-- credit -->             renders the "website by" line (hidden while credit.name is empty)
//  - src/assets/                 copied as-is
//  - src/photos/                 the site's photos (one folder per page); only photos that a page uses are published
//      <!-- photo: home/environment alt="..." loading="lazy" -->   one <img> with the photo's real width/height
//      <!-- carousel: home/carousel -->                            one slide per file in the folder (sorted by name)
//      <!-- photo-url: home/carousel -->                           URL of a photo (first one of a folder), e.g. og:image
//      <!-- ar: home/photo -->                                     "--ar:0.67;" (width/height) for inline styles
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "dist");
const data = JSON.parse(fs.readFileSync(path.join(SRC, "data", "site.json"), "utf8"));

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// footer heading matches the number of camps listed
data.campsHeading = (data.camps || []).filter((c) => c.show !== false).length === 1 ? "Next camp" : "Next camps";

// cache-busting: style.css/main.js/early.js get ?v=<content hash> so phones and in-app browsers
// (Instagram, Facebook) never keep showing an old design after an update
data.assetVersion = require("crypto").createHash("sha1")
  .update(fs.readFileSync(path.join(SRC, "assets", "css", "style.css")))
  .update(fs.readFileSync(path.join(SRC, "assets", "js", "main.js")))
  .update(fs.readFileSync(path.join(SRC, "assets", "js", "early.js")))
  .digest("hex").slice(0, 10);

// ---------- photos ----------
const PHOTO_DIR = path.join(SRC, "photos");
const PHOTO_EXT = [".jpg", ".jpeg", ".png", ".webp"];
const HEIC_EXT = [".heic", ".heif"];
const MAX_MB = 5;
const usedPhotos = new Map(); // relative path -> { abs, rel, hash, w, h }
const warnings = [];
const warn = (m) => { warnings.push(m); console.warn("WARNING: " + m); };
const fail = (m) => { throw new Error(m); };
const relShow = (rel) => "src/photos/" + rel;

// width/height straight from the file header (JPEG incl. EXIF rotation, PNG, WebP), no dependency
function readSize(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2, orient = 1;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { o += 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if (m === 0xe1 && buf.toString("latin1", o + 4, o + 10) === "Exif\0\0") {
        try {
          const b = o + 10, le = buf.toString("latin1", b, b + 2) === "II";
          const r16 = (x) => (le ? buf.readUInt16LE(x) : buf.readUInt16BE(x));
          const r32 = (x) => (le ? buf.readUInt32LE(x) : buf.readUInt32BE(x));
          const ifd = b + r32(b + 4);
          for (let i = 0, n = r16(ifd); i < n; i++) if (r16(ifd + 2 + i * 12) === 0x0112) orient = r16(ifd + 2 + i * 12 + 8);
        } catch (e) { /* ignore a broken EXIF block */ }
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        let h = buf.readUInt16BE(o + 5), w = buf.readUInt16BE(o + 7);
        if (orient >= 5 && orient <= 8) [w, h] = [h, w]; // phone photos stored sideways
        return { w, h };
      }
      o += 2 + len;
    }
  } else if (buf.toString("latin1", 1, 4) === "PNG") {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } else if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    const k = buf.toString("latin1", 12, 16);
    if (k === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (k === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    if (k === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

const ciFind = (dir, name) => fs.readdirSync(dir).find((n) => n.toLowerCase() === name.toLowerCase());
function photoFolder(rel) {
  let dir = PHOTO_DIR;
  for (const seg of rel.split("/").filter(Boolean)) {
    const hit = fs.existsSync(dir) && ciFind(dir, seg);
    if (!hit) fail(`The photo folder "${relShow(rel)}" does not exist. Create it and put the photos in it.`);
    dir = path.join(dir, hit);
  }
  return dir;
}
function checkHeic(dir, rel) {
  for (const n of fs.readdirSync(dir)) {
    if (HEIC_EXT.includes(path.extname(n).toLowerCase()))
      fail(`"${relShow(rel)}/${n}" is an iPhone HEIC photo. Open it and save it as JPG, put the JPG in the folder and remove the HEIC.`);
  }
}
function register(rel, abs) {
  if (usedPhotos.has(rel)) return usedPhotos.get(rel);
  // never follow links out of the photos folder (could publish files that are meant to stay private)
  const real = fs.realpathSync(abs);
  if (fs.lstatSync(abs).isSymbolicLink() || !real.startsWith(fs.realpathSync(PHOTO_DIR) + path.sep))
    fail(`"${relShow(rel)}" is a shortcut/link to a file outside the photos folder. Put the real photo file in the folder instead.`);
  const buf = fs.readFileSync(abs);
  const size = readSize(buf);
  if (!size || !size.w || !size.h) fail(`Could not read the picture size of "${relShow(rel)}". Is it a real JPG, PNG or WebP?`);
  if (buf.length > MAX_MB * 1024 * 1024) warn(`"${relShow(rel)}" is ${(buf.length / 1048576).toFixed(1)} MB (keep photos under ~${MAX_MB} MB).`);
  const info = { abs, rel, hash: require("crypto").createHash("sha1").update(buf).digest("hex"), w: size.w, h: size.h };
  usedPhotos.set(rel, info);
  return info;
}
function singlePhoto(spot) {
  const i = spot.lastIndexOf("/");
  const folder = spot.slice(0, i);
  const dir = photoFolder(folder);
  checkHeic(dir, folder);
  const base = spot.slice(i + 1).toLowerCase();
  const hits = fs.readdirSync(dir).filter((n) => PHOTO_EXT.includes(path.extname(n).toLowerCase()) && path.basename(n, path.extname(n)).toLowerCase() === base);
  if (!hits.length) fail(`Missing photo for the spot "${spot}": put a file named "${spot.slice(i + 1)}.jpg" (or .jpeg / .png / .webp) in ${relShow(folder)}.`);
  if (hits.length > 1) fail(`Two files for the spot "${spot}" in ${relShow(folder)}: ${hits.join(", ")}. Keep only one.`);
  return register(`${path.relative(PHOTO_DIR, dir).split(path.sep).join("/")}/${hits[0]}`, path.join(dir, hits[0]));
}
function carouselPhotos(folder) {
  const dir = photoFolder(folder);
  checkHeic(dir, folder);
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && PHOTO_EXT.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
  if (!files.length) fail(`The carousel folder "${relShow(folder)}" has no photos. Put at least one JPG in it.`);
  const relDir = path.relative(PHOTO_DIR, dir).split(path.sep).join("/");
  return files.map((n) => ({ ...register(`${relDir}/${n}`, path.join(dir, n)), name: n }));
}
const photoUrl = (p) => `photos/${p.rel.split("/").map(encodeURIComponent).join("/")}?v=${p.hash.slice(0, 10)}`;
const parseAttrs = (s) => { const o = {}; String(s || "").replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { o[k] = v; }); return o; };
const SAFE_ATTRS = ["loading", "fetchpriority", "decoding", "sizes", "style", "data-reveal", "data-parallax"];
const attrString = (o) => Object.entries(o).map(([k, v]) => {
  if (!SAFE_ATTRS.includes(k)) fail(`Photo attribute "${k}" is not allowed (allowed: ${SAFE_ATTRS.join(", ")}).`);
  return ` ${k}="${escapeHtml(v)}"`;
}).join("");
const altFromName = (name) => path.basename(name, path.extname(name)).replace(/^\s*\d+\s*[-_.)]*\s*/, "").trim();

function renderPhoto(spot, attrsRaw) {
  const p = singlePhoto(spot);
  const { alt, class: klass, ...rest } = parseAttrs(attrsRaw);
  if (alt === undefined) fail(`<!-- photo: ${spot} --> needs alt="..."`);
  const cls = [klass, p.w < p.h ? "is-portrait" : ""].filter(Boolean).join(" ");
  return `<img${cls ? ` class="${cls}"` : ""} src="${photoUrl(p)}" alt="${escapeHtml(alt)}" width="${p.w}" height="${p.h}" style="--ar: ${p.w} / ${p.h}"${attrString(rest)}>`; // --ar keeps the real shape before the photo loads
}
function renderCarousel(folder, attrsRaw) {
  const a = parseAttrs(attrsRaw);
  return carouselPhotos(folder).map((p, i) => {
    const ratio = p.w / p.h;
    if (ratio < 1.25 || ratio > 1.8) warn(`Carousel photo "${relShow(p.rel)}" is ${p.w}x${p.h} (${ratio.toFixed(2)}:1). Carousels are 3:2 landscape, so it gets cropped; a landscape photo is better.`);
    const pos = ratio < 1.25 ? "50% 38%" : "50% 45%";
    const eager = i === 0 && a.eager === "true";
    return `<div class="hero__slide${i === 0 ? " is-active" : ""}"><img src="${photoUrl(p)}" alt="${escapeHtml(altFromName(p.name))}" width="${p.w}" height="${p.h}" style="object-position: ${pos}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></div>`;
  }).join("\n      ");
}

const lookup = (key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), data);

function renderCamps() {
  const camps = (data.camps || []).filter((c) => c.show !== false);
  if (!camps.length) return `<p class="camps__empty">New dates coming soon &mdash; follow us on Instagram.</p>`;
  return `<ul class="camps__list">${camps
    .map(
      (c) => `
      <li class="camps__item">
        <span class="camps__name">${escapeHtml(c.name)}</span>
        <span class="camps__dates">${escapeHtml(c.dates)}</span>
        ${c.status ? `<span class="camps__status">${escapeHtml(c.status)}</span>` : ""}
      </li>`
    )
    .join("")}</ul>`;
}

function renderCredit() {
  const c = data.credit || {};
  if (!c.name) return "";
  const link = c.email ? `mailto:${c.email}?subject=${encodeURIComponent("A website like Golden Pro")}` : c.url;
  const name = c.url
    ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a>`
    : escapeHtml(c.name);
  return `<p class="footer__credit">Website by ${name}${
    link ? ` &middot; <a href="${escapeHtml(link)}">Want a site like this? Get in touch</a>` : ""
  }</p>`;
}

function render(html, depth = 0) {
  if (depth > 10) throw new Error("include depth exceeded");
  html = html.replace(/<!--\s*include:\s*([\w-]+)\s*-->/g, (_, name) =>
    render(fs.readFileSync(path.join(SRC, "partials", `${name}.html`), "utf8"), depth + 1)
  );
  html = html.replace(/<!--\s*photo:\s*([\w\/.-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g, (_, spot, attrs) => renderPhoto(spot, attrs));
  html = html.replace(/<!--\s*carousel:\s*([\w\/.-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g, (_, folder, attrs) => renderCarousel(folder, attrs));
  html = html.replace(/<!--\s*photo-url:\s*([\w\/.-]+)\s*-->/g, (_, spot) => {
    let p;
    try { p = singlePhoto(spot); } catch (e) { p = carouselPhotos(spot)[0]; }
    return photoUrl(p);
  });
  html = html.replace(/<!--\s*ar:\s*([\w\/.-]+)\s*-->/g, (_, spot) => { const p = singlePhoto(spot); return `--ar:${(p.w / p.h).toFixed(4)};`; });
  html = html.replace(/<!--\s*camps\s*-->/g, renderCamps);
  html = html.replace(/<!--\s*credit\s*-->/g, renderCredit);
  html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = lookup(key);
    if (v === undefined) throw new Error(`Unknown data key {{ ${key} }}`);
    return typeof v === "object" ? escapeHtml(JSON.stringify(v)) : escapeHtml(v);
  });
  return html;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const file of fs.readdirSync(path.join(SRC, "pages"))) {
  if (!file.endsWith(".html")) continue;
  const html = render(fs.readFileSync(path.join(SRC, "pages", file), "utf8"));
  fs.writeFileSync(path.join(OUT, file), html);
  console.log("built", file);
}
copyDir(path.join(SRC, "assets"), path.join(OUT, "assets"));

// publish only the photos the pages actually use (the READ ME guide and spare files stay out of dist/)
const seenHash = new Map();
for (const p of usedPhotos.values()) {
  const to = path.join(OUT, "photos", p.rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(p.abs, to);
  if (seenHash.has(p.hash)) warn(`The same photo is used twice: "${relShow(seenHash.get(p.hash))}" and "${relShow(p.rel)}". Each photo may be used only once on the site.`);
  else seenHash.set(p.hash, p.rel);
}
console.log(`photos: ${usedPhotos.size} used${warnings.length ? `, ${warnings.length} warning(s)` : ""}`);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
