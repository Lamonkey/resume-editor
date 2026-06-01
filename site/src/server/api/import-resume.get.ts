import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

/**
 * Local dev convenience endpoint: read a Markdown resume from disk and hand it
 * back to the client so it can be loaded into browser storage without manual
 * copy-paste. See `?import=<path>` handling in `~/plugins/import-resume.client.ts`.
 *
 * This only runs on the local Nitro dev/preview server (the production GitHub
 * Pages build is fully static and has no server routes), so reading an
 * arbitrary local path is acceptable. We still restrict to `.md` files.
 */
const titleCase = (s: string) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default defineEventHandler(async (event) => {
  const { path, name } = getQuery(event);

  if (typeof path !== "string" || !path)
    throw createError({ statusCode: 400, statusMessage: "Missing ?path query param" });

  if (!path.toLowerCase().endsWith(".md"))
    throw createError({ statusCode: 400, statusMessage: "Only .md files are allowed" });

  let markdown: string;
  try {
    markdown = await readFile(path, "utf-8");
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Cannot read file: ${path}` });
  }

  // Resume name: explicit ?name wins. Otherwise derive it:
  //   - the parent folder, when it's a meaningful company folder
  //     (resume-skill writes to `resumes/<company>/<file>.md`)
  //   - else the company from a `<name>_resume_<company>.md` filename
  //   - else the bare file name
  let derived: string;
  if (typeof name === "string" && name.trim()) {
    derived = name.trim();
  } else {
    const folder = basename(dirname(path));
    const stem = basename(path, ".md");
    if (folder && folder.toLowerCase() !== "resumes") {
      derived = titleCase(folder);
    } else {
      const company = stem.split(/_resume_/i)[1];
      derived = titleCase(company || stem);
    }
  }

  return { name: derived, markdown };
});
