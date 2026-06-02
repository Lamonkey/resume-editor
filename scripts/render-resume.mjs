#!/usr/bin/env node
/**
 * Headless resume renderer.
 *
 * Loads a Markdown resume into the markdown-resume editor in headless Chrome,
 * applies style params (font size, line height, margins, paragraph space,
 * paper), and reports how many pages it occupies — plus an optional PNG
 * screenshot (for visual judgment) and a print-faithful PDF.
 *
 * The agent drives one-page fitting by calling this repeatedly with different
 * styles (and/or trimming the Markdown) until `pages` is 1, then writes the PDF.
 *
 * Usage:
 *   node scripts/render-resume.mjs <resume.md> [options]
 *
 * Options:
 *   --name <str>            Resume title in the editor (default: derived)
 *   --font-size <n>         e.g. 11
 *   --line-height <n>       e.g. 1.25
 *   --margin-v <n>          vertical page margin (px)
 *   --margin-h <n>          horizontal page margin (px)
 *   --para-space <n>        paragraph spacing
 *   --paper <A4|letter>     default A4
 *   --png <path>            write a screenshot here
 *   --pdf <path>            write a PDF here
 *   --base-url <url>        default http://localhost:3000/markdown-resume/
 *   --json                  print machine-readable JSON only
 *
 * Output (stdout): a JSON object { pages, fits, png, pdf, styles }.
 */
import { spawn } from "node:child_process";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---- arg parsing -----------------------------------------------------------
const argv = process.argv.slice(2);
// Preferred resume defaults (fonts 华康宋体 / Verdana come from the app's own
// DEFAULT_STYLES, so they don't need to be passed here). The fit loop overrides
// fontSize / lineHeight to grow or shrink the resume to exactly one page.
const opts = {
  paper: "A4",
  fontSize: "13",
  lineHeight: "1.25",
  marginV: "0",
  marginBottom: "20",
  marginH: "16",
  paragraphSpace: "5",
  baseUrl: "http://localhost:3000/markdown-resume/"
};
let mdPath;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  switch (a) {
    case "--name": opts.name = next(); break;
    case "--font-size": opts.fontSize = next(); break;
    case "--line-height": opts.lineHeight = next(); break;
    case "--margin-v": opts.marginV = next(); break;
    case "--margin-bottom": opts.marginBottom = next(); break;
    case "--margin-h": opts.marginH = next(); break;
    case "--para-space": opts.paragraphSpace = next(); break;
    case "--paper": opts.paper = next(); break;
    case "--png": opts.png = next(); break;
    case "--pdf": opts.pdf = next(); break;
    case "--base-url": opts.baseUrl = next(); break;
    case "--json": opts.json = true; break;
    default:
      if (!a.startsWith("--") && !mdPath) mdPath = a;
      else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
}
if (!mdPath) {
  console.error("Usage: render-resume.mjs <resume.md> [options]");
  process.exit(2);
}
mdPath = isAbsolute(mdPath) ? mdPath : resolve(process.cwd(), mdPath);
const abs = (p) => (p ? (isAbsolute(p) ? p : resolve(process.cwd(), p)) : undefined);
opts.png = abs(opts.png);
opts.pdf = abs(opts.pdf);

const log = (...a) => { if (!opts.json) console.error(...a); };

// ---- build the import URL --------------------------------------------------
const importUrl = (() => {
  const u = new URL(opts.baseUrl);
  u.searchParams.set("import", mdPath);
  for (const k of ["name", "fontSize", "lineHeight", "marginV", "marginBottom", "marginH", "paragraphSpace", "paper"])
    if (opts[k] !== undefined) u.searchParams.set(k, String(opts[k]));
  return u.toString();
})();

// ---- ensure the dev server is up -------------------------------------------
const ping = async (url) => {
  try {
    const r = await fetch(url, { redirect: "manual" });
    return r.status > 0 && r.status < 500;
  } catch { return false; }
};

const ensureServer = async () => {
  if (await ping(opts.baseUrl)) return;
  log("[render] dev server not running — starting `pnpm dev`…");
  const child = spawn("pnpm", ["dev"], { cwd: REPO_ROOT, detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 120; i++) {
    if (await ping(opts.baseUrl)) { log("[render] dev server is up."); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not become reachable in 60s");
};

// ---- render ----------------------------------------------------------------
const main = async () => {
  await ensureServer();

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
    await page.goto(importUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // App reads the file, stores it, then redirects to /edit/<id>.
    await page.waitForSelector("#vue-smart-pages-preview", { timeout: 30000 });

    // Wait for smart-pages pagination to settle (debounced + font loading).
    const countBreaks = () =>
      page.$$eval(".vue-smart-page-break", (els) => els.length);
    let prev = -1, stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const n = await countBreaks();
      if (n === prev) stable++; else { stable = 0; prev = n; }
    }
    const pages = prev + 1;

    // Print media hides the editor chrome and neutralizes the preview zoom,
    // leaving only the resume pages — used for both the screenshot and the PDF.
    await page.emulateMediaType("print");

    if (opts.png) {
      await page.screenshot({ path: opts.png, fullPage: true });
      log(`[render] screenshot → ${opts.png}`);
    }
    if (opts.pdf) {
      await page.pdf({
        path: opts.pdf,
        format: opts.paper === "letter" ? "Letter" : "A4",
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      log(`[render] pdf → ${opts.pdf}`);
    }

    const result = {
      pages,
      fits: pages === 1,
      png: opts.png ?? null,
      pdf: opts.pdf ?? null,
      styles: {
        fontSize: opts.fontSize, lineHeight: opts.lineHeight,
        marginV: opts.marginV, marginH: opts.marginH,
        paragraphSpace: opts.paragraphSpace, paper: opts.paper
      }
    };
    console.log(JSON.stringify(result, null, opts.json ? 0 : 2));
  } finally {
    await browser.close();
  }
};

main().catch((e) => { console.error("[render] error:", e.message); process.exit(1); });
