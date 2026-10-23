// Builds the static site from src/ into dist/. No dependencies: `node build.js`.
//
//  - src/pages/*.html            one output page each
//  - <!-- include: name -->      inserts src/partials/name.html (nested includes allowed)
//  - {{ path.to.value }}         inserts a value from src/data/site.json
//  - <!-- camps -->              renders the upcoming camps list from site.json
//  - <!-- credit -->             renders the "website by" line (hidden while credit.name is empty)
//  - src/assets/                 copied as-is
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "dist");
const data = JSON.parse(fs.readFileSync(path.join(SRC, "data", "site.json"), "utf8"));

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// footer heading matches the number of camps listed
data.campsHeading = (data.camps || []).filter((c) => c.show !== false).length === 1 ? "Next camp" : "Next camps";

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
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
