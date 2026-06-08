<h1 align="center">Markdown Resume</h1>

<p align="center">Write an ATS-friendly resume in Markdown. Available for everyone, optimized for developers.</p>

<p align="center"><a href="https://www.junian.dev/markdown-resume/"><strong>Start Writing Now</strong></a>!</p>

<img align="center" src="https://raw.githubusercontent.com/junian/markdown-resume/assets/img/markdown-resume-screenshot-00.jpg"/>

## About

This repo is a fork of [junian/markdown-resume](https://github.com/junian/markdown-resume), which is itself a fork of [Oh My CV!](https://ohmycv.app/) ([Renovamen/oh-my-cv](https://github.com/Renovamen/oh-my-cv)). All credit for the editor, the live preview, and the ATS-friendly templates belongs to them — go check out their work.

Inherited from junian's fork (on top of the original Oh My CV):

- The default template is now as close as possible to [CareerCup's][careercup] resume template.
- The default color is all black.
- Uses web-safe fonts for easier and safer ATS parsing.
- Export as HTML and DOCX.

### Why this fork: making it headless

Oh My CV and junian's fork are both interactive, browser-only apps — you write Markdown in the editor and visually nudge the style knobs until the resume fits on one page. That manual loop is exactly what I wanted to automate.

This fork adds a **headless rendering pipeline** so a script (or an AI agent) can drive the whole thing without a human in front of the browser:

- **`?import=` URL** — load a Markdown file straight from disk into the editor instead of copy-pasting (see below).
- **`pnpm render`** — render a resume in headless Chrome, measure how many pages it occupies, and emit a print-accurate PDF (see below).

Together these let a generator tweak font size, margins, and line height in a loop until the resume fits one page — turning the "fiddle with sliders until it fits" chore into something programmatic. Everything the original does in the browser still works; the headless bits are additive.

## Notice

Highly recommend using Chromium-based browsers, e.g., [Chrome][chrome] or [Microsoft Edge][edge].

## Features

- Write your resume in Markdown and preview it in real time — smooth experience!
- Works offline ([PWA][pwa])
- Export to A4 and US Letter PDFs
- Customize page margins, theme colors, line heights, fonts, etc.
- Pick any fonts from [Google Fonts](https://fonts.google.com/)
- Add icons easily via [Iconify](https://github.com/iconify/iconify) (search icons on [Icônes](https://icones.js.org/))
- TeX support ([KaTeX](https://github.com/KaTeX/KaTeX))
- Cross-referencing (useful for academic CVs)
- Case correction (e.g., `Github` → `GitHub`)
- Add line breaks (`\\[10px]`) or start a new page (`\newpage`) like in LaTeX
- Automatic page breaking
- Custom CSS support
- Manage multiple resumes
- Your data stays in your hands:
  - Data is saved locally in your browser (see [here](https://localforage.github.io/localForage/) for details)
  - Open-source static website hosted on [GitHub Pages](https://pages.github.com/), which does not (and cannot) collect your data
  - No user tracking, no ads
- Dark mode

## Import a resume from a local file (`?import=`)

When running locally (`pnpm dev` or `pnpm build && pnpm serve`), you can load a Markdown file straight from disk into the editor — no copy-paste — by opening:

```
http://localhost:3000/markdown-resume/?import=/absolute/path/to/resume.md
```

The app reads the file via a local server route, creates a resume in browser storage, and opens it in the editor. The resume is named after its parent folder (or the company in a `*_resume_<company>.md` filename); add `&name=Some%20Name` to override. Re-importing with the same name overwrites that resume in place instead of creating a duplicate, so a generator can keep refreshing the same entry.

This is a local-only convenience: the static production build (GitHub Pages) has no server routes, so `?import=` is a no-op there.

## Headless render / one-page fitting (`pnpm render`)

`scripts/render-resume.mjs` renders a Markdown resume in headless Chrome (using your installed Google Chrome via `puppeteer-core` — no browser download) and reports how many pages it occupies. It can also write a screenshot and a print-accurate PDF. This is what lets an agent fit a resume to one page by adjusting style knobs (and/or trimming content) in a loop.

```bash
pnpm render <resume.md> \
  --font-size 10 --line-height 1.15 \
  --margin-v 32 --margin-h 36 --para-space 3 --paper letter \
  --png /tmp/out.png --pdf /tmp/out.pdf
```

Prints JSON: `{ "pages": 1, "fits": true, "png": …, "pdf": …, "label": …, "styles": { … } }`. It auto-starts the dev server if it isn't already running. Set `CHROME_PATH` to override the Chrome binary.

The exported PDF is given a macOS Finder tag (default name `Resume PDF`, default color orange) so generated resumes are easy to find and group in Finder — `--label <color>` (or `none`) and `--label-name <str>` to change it. Note: macOS controls tag colors centrally per tag name, so the requested color only sticks if that tag name isn't already registered with a different color; to force a color, set it once for the tag in **Finder → Settings → Tags**.

## Development

Built with [Nuxt 3](https://nuxt.com), powered by [Vue 3](https://github.com/vuejs/vue-next), [Vite](https://github.com/vitejs/vite), [Zag](https://zagjs.com/), and [UnoCSS](https://github.com/antfu/unocss).

Clone the repo and install dependencies:

```bash
pnpm install
```

Build the [packages](packages):

```bash
pnpm build:pkg
```

To enable font selection from [Google Fonts](https://fonts.google.com/), generate a [Google Fonts Developer API Key](https://developers.google.com/fonts/docs/developer_api#APIKey). Then create a `.env` file inside the [`site`](site/) folder and add:

```
NUXT_PUBLIC_GOOGLE_FONTS_KEY="YOUR_API_KEY"
```

Start developing / building the site:

```bash
pnpm dev
pnpm build
```

## Credits

- Direct upstream: [junian/markdown-resume](https://github.com/junian/markdown-resume)
- Original project: [Renovamen/oh-my-cv](https://github.com/Renovamen/oh-my-cv)
- [billryan/resume](https://github.com/billryan/resume)

## License

This project is licensed under the [MIT](LICENSE) license.

---

Forked by [Lamonkey](https://github.com/Lamonkey) · originally made with ☕ by [Junian.dev](https://www.junian.dev).

[careercup]: <https://web.archive.org/web/20240501052328/https://www.careercup.com/resume> "CareerCup Good Resume"
[chrome]: <https://www.google.com/chrome/> "Download Google Chrome"
[edge]: <https://www.microsoft.com/en-us/edge/> "Download Microsoft Edge"
[pwa]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
