/**
 * Shared rendering core for the headless resume renderer.
 *
 * Used by both the one-shot CLI (`render-resume.mjs`) and the long-running
 * HTTP service (`render-service.mjs`). The service keeps the dev server and a
 * Chrome instance warm and calls `renderInPage` once per request, so the fit
 * loop pays the startup cost only once instead of on every render.
 */
import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Preferred resume defaults. Fonts (华康宋体 / Verdana) come from the app's own
// DEFAULT_STYLES, so they aren't set here. The fit loop overrides fontSize /
// lineHeight to grow or shrink the resume to exactly one page.
export const DEFAULT_STYLES = {
  paper: "A4",
  fontSize: "13",
  lineHeight: "1.25",
  marginV: "0",
  marginBottom: "20",
  marginH: "16",
  paragraphSpace: "5",
  label: "orange",
  labelName: "Resume PDF",
  baseUrl: "http://localhost:3000/markdown-resume/"
};

// ---- build the import URL --------------------------------------------------
export const buildImportUrl = (opts) => {
  const u = new URL(opts.baseUrl);
  u.searchParams.set("import", opts.mdPath);
  for (const k of ["name", "fontSize", "lineHeight", "marginV", "marginBottom", "marginH", "paragraphSpace", "paper"])
    if (opts[k] !== undefined && opts[k] !== null) u.searchParams.set(k, String(opts[k]));
  return u.toString();
};

// ---- ensure the dev server is up -------------------------------------------
export const ping = async (url) => {
  try {
    const r = await fetch(url, { redirect: "manual" });
    return r.status > 0 && r.status < 500;
  } catch { return false; }
};

export const ensureServer = async (baseUrl, log = () => {}) => {
  if (await ping(baseUrl)) return;
  log("[render] dev server not running — starting `pnpm dev`…");
  const child = spawn("pnpm", ["dev"], { cwd: REPO_ROOT, detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 120; i++) {
    if (await ping(baseUrl)) { log("[render] dev server is up."); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not become reachable in 60s");
};

// ---- Finder color tag (macOS) ----------------------------------------------
// Tags the PDF with a colored Finder tag so it stands out and is filterable in
// Finder's sidebar. macOS controls tag colors centrally per tag NAME, so the
// color we write only sticks if that name isn't already registered with another
// color. Color slots: 1 gray, 2 green, 3 purple, 4 blue, 5 yellow, 6 red,
// 7 orange.
export const FINDER_COLOR_CODES = {
  none: 0, gray: 1, grey: 1, green: 2, purple: 3, blue: 4, yellow: 5, red: 6, orange: 7
};
export const setFinderTag = (file, name, color) => {
  const code = FINDER_COLOR_CODES[String(color || "").toLowerCase()];
  if (!code) return; // none / unknown → leave untagged
  try { execFileSync("xattr", ["-d", "com.apple.FinderInfo", file]); } catch {}
  const tag = `${name}\n${code}`; // e.g. "Resume PDF\n7"
  const py = "import plistlib,sys; sys.stdout.write(plistlib.dumps([sys.argv[1]], fmt=plistlib.FMT_BINARY).hex())";
  const hex = execFileSync("python3", ["-c", py, tag]).toString().trim();
  execFileSync("xattr", ["-wx", "com.apple.metadata:_kMDItemUserTags", hex, file]);
};

// ---- render one resume in a fresh page -------------------------------------
// Opens a new page on an already-launched browser, imports the resume, waits
// for pagination to settle, optionally writes a screenshot and PDF, and returns
// a result object. Always closes the page it opened (the browser is reused).
export const renderInPage = async (browser, opts, log = () => {}) => {
  const importUrl = buildImportUrl(opts);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
    await page.goto(importUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // App reads the file, stores it, then redirects to /edit/<id>. Allow a
    // generous timeout: the first render after a cold dev server compiles the
    // /edit route on demand, which can take well over 30s.
    await page.waitForSelector("#vue-smart-pages-preview", { timeout: 90000 });

    // Wait for smart-pages pagination to settle (debounced + font loading).
    const countBreaks = () => page.$$eval(".vue-smart-page-break", (els) => els.length);
    let prev = -1, stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const n = await countBreaks();
      if (n === prev) stable++; else { stable = 0; prev = n; }
    }
    const pages = prev + 1;

    // Print media hides the editor chrome and neutralizes the preview zoom,
    // leaving only the resume pages — used for both screenshot and PDF.
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
      if (opts.label && opts.label.toLowerCase() !== "none") {
        try {
          setFinderTag(opts.pdf, opts.labelName, opts.label);
          log(`[render] finder tag → "${opts.labelName}" (${opts.label})`);
        } catch (e) {
          log(`[render] could not set finder tag: ${e.message}`);
        }
      }
    }

    return {
      pages,
      fits: pages === 1,
      png: opts.png ?? null,
      pdf: opts.pdf ?? null,
      label: opts.pdf && opts.label?.toLowerCase() !== "none"
        ? { name: opts.labelName, color: opts.label }
        : null,
      styles: {
        fontSize: opts.fontSize, lineHeight: opts.lineHeight,
        marginV: opts.marginV, marginBottom: opts.marginBottom, marginH: opts.marginH,
        paragraphSpace: opts.paragraphSpace, paper: opts.paper
      }
    };
  } finally {
    await page.close();
  }
};
