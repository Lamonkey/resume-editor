#!/usr/bin/env node
/**
 * Long-running headless resume render service.
 *
 * Keeps the markdown-resume dev server AND a Chrome instance warm, then renders
 * one resume per HTTP request. This is what a remote agent (e.g. a Cowork
 * session on the LAN) calls to drive the one-page fit loop synchronously
 * without paying Chrome/dev-server startup on every render.
 *
 * Bind: 0.0.0.0 so it is reachable by the Mac's LAN address (not just
 * loopback). Fixed port (default 8787) so the client can hardcode it.
 *
 * Start:
 *   pnpm render:service                 # port 8787, host 0.0.0.0
 *   RENDER_SERVICE_PORT=9000 pnpm render:service
 *
 * Routes:
 *   GET  /ping     → { ok, service, port, browser }     (availability probe)
 *   POST /render   → render a resume, return JSON
 *
 * Client and service run on the same machine (shared filesystem), so the PDF
 * is written to disk rather than returned over the wire. By default it lands
 * NEXT TO the source .md (same dir, same basename) — pass `savePdf:true` with
 * `path`, or an explicit `pdfPath` for a custom location.
 *
 * POST /render body (JSON), all fields optional except markdown|path:
 *   markdown    string   resume Markdown (written to a temp file on this Mac)
 *   path        string   …or an absolute .md path on this Mac's filesystem
 *   name        string   editor title (dedupe key — re-imports overwrite in place)
 *   fontSize, lineHeight, marginV, marginBottom, marginH, paragraphSpace, paper
 *   savePdf     bool     write the PDF alongside `path` (<basename>.pdf) and tag it
 *   pdfPath     string   …or write the PDF to this explicit path instead
 *   pngPath     string   write a screenshot here (on this Mac)
 *   label, labelName      Finder tag color/name (default orange / "Resume PDF")
 *
 * Response (JSON): { pages, fits, png, pdf, label, styles }
 */
import { createServer } from "node:http";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import puppeteer from "puppeteer-core";
import { CHROME, DEFAULT_STYLES, ensureServer, renderInPage } from "./render-core.mjs";

const PORT = Number(process.env.RENDER_SERVICE_PORT || 8787);
const HOST = process.env.RENDER_SERVICE_HOST || "0.0.0.0";
const BASE_URL = process.env.RENDER_BASE_URL || DEFAULT_STYLES.baseUrl;
const log = (...a) => console.error(`${new Date().toISOString()}`, ...a);

// ---- warm browser (relaunched if it ever disconnects) ----------------------
let browser = null;
const getBrowser = async () => {
  if (browser && browser.connected) return browser;
  log("[service] launching Chrome…");
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--font-render-hinting=none"]
  });
  return browser;
};

// ---- request body helper ---------------------------------------------------
const readJson = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 8 * 1024 * 1024) reject(new Error("request body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("invalid JSON body")); }
    });
    req.on("error", reject);
  });

const send = (res, status, obj) => {
  const json = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
};

// ---- /render ---------------------------------------------------------------
const handleRender = async (req, res) => {
  const body = await readJson(req);
  if (!body.markdown && !body.path) {
    return send(res, 400, { error: "provide `markdown` or `path`" });
  }

  // Where to write the PDF (client and service share the filesystem):
  //   explicit pdfPath  →  use it
  //   savePdf + path    →  alongside the source .md (<dir>/<basename>.pdf)
  //   otherwise         →  no PDF (a search render during the fit loop)
  let pdfOut = body.pdfPath;
  if (!pdfOut && body.savePdf) {
    if (!body.path) {
      return send(res, 400, { error: "`savePdf` needs `path` — nowhere to save alongside inline markdown" });
    }
    const { dir, name } = parse(body.path);
    pdfOut = join(dir, `${name}.pdf`);
  }

  // Inline markdown → temp file so the app's ?import= disk route can read it.
  let tmpDir, mdPath;
  if (body.markdown) {
    tmpDir = await mkdtemp(join(tmpdir(), "resume-render-"));
    mdPath = join(tmpDir, "resume.md");
    await writeFile(mdPath, body.markdown, "utf8");
  } else {
    mdPath = body.path;
  }

  const opts = {
    ...DEFAULT_STYLES,
    baseUrl: BASE_URL,
    mdPath,
    name: body.name,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    marginV: body.marginV,
    marginBottom: body.marginBottom,
    marginH: body.marginH,
    paragraphSpace: body.paragraphSpace,
    paper: body.paper,
    png: body.pngPath,
    pdf: pdfOut,
    label: body.label,
    labelName: body.labelName
  };
  // Fall back to defaults for any field the client left undefined.
  for (const k of Object.keys(DEFAULT_STYLES))
    if (opts[k] === undefined) opts[k] = DEFAULT_STYLES[k];

  try {
    const b = await getBrowser();
    const result = await renderInPage(b, opts, log);
    log(`[service] rendered "${body.name || mdPath}" → ${result.pages} page(s)${pdfOut ? ` → ${pdfOut}` : ""}`);
    send(res, 200, result);
  } finally {
    if (tmpDir) { try { await unlink(mdPath); } catch {} }
  }
};

// ---- server ----------------------------------------------------------------
const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.startsWith("/ping")) {
      return send(res, 200, { ok: true, service: "resume-render", port: PORT, browser: !!(browser && browser.connected) });
    }
    if (req.method === "POST" && req.url.startsWith("/render")) {
      return await handleRender(req, res);
    }
    send(res, 404, { error: "not found", routes: ["GET /ping", "POST /render"] });
  } catch (e) {
    log("[service] error:", e.stack || e.message);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

const main = async () => {
  await ensureServer(BASE_URL, log);
  await getBrowser(); // warm Chrome up front so the first render is fast too
  server.listen(PORT, HOST, () => {
    log(`[service] resume render service on http://${HOST}:${PORT}  (base ${BASE_URL})`);
    log(`[service] probe: curl -s http://<this-mac-ip>:${PORT}/ping`);
  });
};

const shutdown = async () => {
  log("[service] shutting down…");
  try { await browser?.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => { log("[service] fatal:", e.stack || e.message); process.exit(1); });
