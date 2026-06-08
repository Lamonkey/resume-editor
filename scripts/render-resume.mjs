#!/usr/bin/env node
/**
 * Headless resume renderer (one-shot CLI).
 *
 * Loads a Markdown resume into the markdown-resume editor in headless Chrome,
 * applies style params (font size, line height, margins, paragraph space,
 * paper), and reports how many pages it occupies — plus an optional PNG
 * screenshot (for visual judgment) and a print-faithful PDF.
 *
 * The agent drives one-page fitting by calling this repeatedly with different
 * styles (and/or trimming the Markdown) until `pages` is 1, then writes the PDF.
 * For a tight fit loop, prefer the long-running `render-service.mjs`, which
 * keeps the dev server and Chrome warm between renders.
 *
 * Usage:
 *   node scripts/render-resume.mjs <resume.md> [options]
 *
 * Options:
 *   --name <str>            Resume title in the editor (default: derived)
 *   --font-size <n>         e.g. 11
 *   --line-height <n>       e.g. 1.25
 *   --margin-v <n>          vertical page margin (px)
 *   --margin-bottom <n>     bottom page margin (px), independent of --margin-v
 *   --margin-h <n>          horizontal page margin (px)
 *   --para-space <n>        paragraph spacing
 *   --paper <A4|letter>     default A4
 *   --png <path>            write a screenshot here
 *   --pdf <path>            write a PDF here
 *   --label <color>         Finder tag color on the PDF (default orange; none to skip)
 *   --label-name <str>      Finder tag name (default "Resume PDF")
 *   --base-url <url>        default http://localhost:3000/markdown-resume/
 *   --json                  print machine-readable JSON only
 *
 * Output (stdout): a JSON object { pages, fits, png, pdf, label, styles }.
 *
 * Note on tag color: macOS controls tag colors centrally per tag NAME in the
 * Finder tag database, so the color we write only applies if that name isn't
 * already registered with another color. To force a color, set it once for the
 * tag in Finder → Settings → Tags; all files with that tag then inherit it.
 */
import { resolve, isAbsolute } from "node:path";
import puppeteer from "puppeteer-core";
import { CHROME, DEFAULT_STYLES, ensureServer, renderInPage } from "./render-core.mjs";

// ---- arg parsing -----------------------------------------------------------
const argv = process.argv.slice(2);
const opts = { ...DEFAULT_STYLES };
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
    case "--label": opts.label = next(); break;
    case "--label-name": opts.labelName = next(); break;
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
opts.mdPath = isAbsolute(mdPath) ? mdPath : resolve(process.cwd(), mdPath);
const abs = (p) => (p ? (isAbsolute(p) ? p : resolve(process.cwd(), p)) : undefined);
opts.png = abs(opts.png);
opts.pdf = abs(opts.pdf);

const log = (...a) => { if (!opts.json) console.error(...a); };

const main = async () => {
  await ensureServer(opts.baseUrl, log);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"]
  });
  try {
    const result = await renderInPage(browser, opts, log);
    console.log(JSON.stringify(result, null, opts.json ? 0 : 2));
  } finally {
    await browser.close();
  }
};

main().catch((e) => { console.error("[render] error:", e.message); process.exit(1); });
