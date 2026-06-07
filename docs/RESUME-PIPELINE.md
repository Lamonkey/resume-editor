## Goal

Make it effortless to turn a generated Markdown resume (from the job-search `resume-skill`) into a polished, **single-page, print-accurate PDF**, with as few manual steps as possible. Originally the user had to copy-paste markdown into the web editor, rename it, hand-tune font/spacing to fit one page, and export — for every application. This feature automates that end to end.

Tracking PR: #1 (`feat/import-from-file`).

## Architecture / two repos

- **This repo (`resume-editor`, a fork of junian/markdown-resume → Oh My CV!)** — the Nuxt/Vue editor + the import route + the headless renderer CLI.
- **A separate private "job search" workspace** — the resume **skills** that call this repo's renderer: `resume-skill` (compose) → `resume-render` skill (render/fit/export) + a batch automation prompt. Those live outside this repo; described here for context.

Resumes are stored in the editor's **IndexedDB** (localForage), not as files — that mismatch with the file-based job-search archive is the root of the original friction.

## What's done (in this repo, PR #1)

- **`?import=` flow** — Nitro route `GET /api/import-resume?path=…` reads a local `.md` from disk and returns `{name, markdown}`; `app.vue` handles `?import=<path>&name=…` plus style params (`fontSize`, `lineHeight`, `marginV`, `marginBottom`, `marginH`, `paragraphSpace`, `paper`), upserts into IndexedDB (dedupe-by-name → re-imports overwrite in place), and opens the editor. Local-only (static build has no server routes). Files: `site/src/server/api/import-resume.get.ts`, `site/src/app.vue`, `site/src/utils/database.ts` (`upsertResumeFromMarkdown`).
- **Headless renderer** — `scripts/render-resume.mjs` (`pnpm render`): loads a resume in the real editor via headless Chrome (`puppeteer-core` + installed Chrome, no browser download), reports page count, writes a screenshot and a print-accurate PDF (same `window.print()` path as the editor's Export PDF). Auto-starts the dev server.
- **Independent bottom margin** — new optional `marginBottom` style decoupled from `marginV` (so top 0 / bottom > 0 is possible). Wired through type, style store, `ResumeRender.vue`, `?import=` params, CLI.
- **Print fix** — clears the gray preview chrome in print media so short final pages print white below the content (fixes headless render *and* the in-editor Export PDF). `site/src/assets/css/edit.css`.
- **New defaults** — A4, font 13, line 1.25, margins top 0 / bottom 20 / sides 16, paragraph spacing 5 (fonts unchanged: 华康宋体 / Verdana). In both `DEFAULT_STYLES` and the CLI.
- **Finder color tag** — `--label <color>` (default orange) + `--label-name` (default "Resume PDF") tags the exported PDF so resumes are easy to group/find in Finder.

### Done in the job-search workspace (separate repo)
- **`resume-render` skill** — encodes the fit strategy: **line-first** (tune line spacing to fill one page, keep the font large; drop font only when line spacing hits its floor; trim content below font 10.5). Bounds: font 10.5–14, line 1.15–1.5. Mandatory visual check of the final PDF. Degrades gracefully if the renderer/repo/Chrome isn't reachable (keeps the `.md`).
- **`resume-skill` Step 8** auto-runs `resume-render` at the end of generation.
- **Batch automation** (`to-apply/` generator) inherits all of the above.

## Key decisions & rationale

- **Server-based import (kept the magic)** over File System Access API — preserves the hands-off "skill finishes → resume is on screen / PDF produced" flow; the local dev server is acceptable infra.
- **Line-first fit** — keeps font size as large/readable as possible; line spacing is the fine knob. Chosen by the user after comparing both orders.
- **Finder tag color** — confirmed via research (Eclectic Light Co., Brett Terpstra): tag *colors* are controlled centrally by Finder's tag database per tag *name*, not per file. The CLI reliably sets the tag **name**; the **color** must be set once in Finder (Settings → Tags), after which all files with that name inherit it. The embedded color number is only a hint for brand-new names and gets reconciled otherwise.

## Known limitations / open items

1. **Tag color can't be forced from the CLI** — by design of macOS. Requires a one-time Finder color-set per tag name. Documented in README + the render CLI header. Not fixable in code.
2. **Spotlight indexing** — on the user's machine, the home/Desktop folder is not being indexed (mdfind returns nothing under `~`), so tags/search don't surface files regardless of color. External to this repo; fix is a Spotlight reindex/restart on the user's Mac. Until then, tag-based *finding* won't work (the colored dot still shows when browsing the folder directly).
3. **Renderer needs the repo + Chrome** — sandboxed/automated runs that only mount the job-search workspace can't render; the `resume-render` skill skips gracefully and keeps the `.md`. Could be improved by packaging the renderer so it's reachable from the workspace, or running batch jobs locally.
4. **Lockfile not synced** — `puppeteer-core` is in `package.json` but `pnpm-lock.yaml` was left as-is to avoid a pnpm 8→9 format rewrite. Run `pnpm install` to sync (CI with `--frozen-lockfile` would fail until then).
5. **Fit shrink/trim path unproven** — every test resume so far fit at/near font 13, so the "drop font / trim content" branch of the render skill hasn't been exercised on a genuinely over-length resume.

## Suggested next steps

- Sync the lockfile (`pnpm install`) and confirm CI passes.
- Stress-test the render skill's shrink/trim branch on a dense resume.
- Consider an in-app affordance (button/drop-zone) to import a local `.md` for non-CLI users, and/or a "render to PDF" action that doesn't require the dev server separately.
- Make the renderer reachable from the job-search workspace (or document the local-run requirement) so batch automation can produce PDFs, not just `.md`.
- Optional: revisit whether tag color can be set programmatically via Finder scripting / the `tag` CLI (research suggests no; document the conclusion if revisited).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
