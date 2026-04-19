import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const STATIC_DIRS = ["assets", "styles", "src"];
const API_ROOT = normalizeApiRoot(process.env.SUMGRID_API_ROOT || "");

if (!API_ROOT) {
  throw new Error(
    "SUMGRID_API_ROOT is required for GitHub Pages build. Example: https://sum-grid-api.onrender.com"
  );
}

await fs.rm(DIST_DIR, { recursive: true, force: true });
await fs.mkdir(DIST_DIR, { recursive: true });

for (const directory of STATIC_DIRS) {
  await fs.cp(path.join(ROOT_DIR, directory), path.join(DIST_DIR, directory), {
    recursive: true,
  });
}

const indexTemplate = await fs.readFile(path.join(ROOT_DIR, "index.html"), "utf8");
const indexHtml = injectApiRoot(indexTemplate, API_ROOT);

await fs.writeFile(path.join(DIST_DIR, "index.html"), indexHtml, "utf8");
await fs.writeFile(path.join(DIST_DIR, "404.html"), indexHtml, "utf8");
await fs.writeFile(path.join(DIST_DIR, ".nojekyll"), "\n", "utf8");

console.log(`Built GitHub Pages bundle in ${DIST_DIR}`);
console.log(`Configured API root: ${API_ROOT}`);

function normalizeApiRoot(value) {
  const normalized = String(value).trim().replace(/\/+$/, "");

  if (!normalized) {
    return "";
  }

  return normalized;
}

function injectApiRoot(html, apiRoot) {
  const escapedApiRoot = escapeHtmlAttribute(apiRoot);

  if (!html.includes('name="sumgrid-api-root"')) {
    throw new Error('Meta tag "sumgrid-api-root" is missing in index.html');
  }

  return html.replace(
    /<meta name="sumgrid-api-root" content="[^"]*"\s*\/>/,
    `<meta name="sumgrid-api-root" content="${escapedApiRoot}" />`
  );
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
