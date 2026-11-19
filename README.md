# What's Written™ · Class Library

A free, no-login library of decoded lecture slides, plus a growing dictionary of the professor's handwriting.

- **Read:** anyone with the link, no account.
- **Add or fix:** a free GitHub account. Everything happens through GitHub issue forms.
- **Cost:** €0. GitHub Pages hosts the site and GitHub Actions is the backend.

## How it works

```
Photo ──► What's Written app (Claude) ──► clean text
                                            │
                     "Add a slide" issue form on GitHub
                                            │
                GitHub Action  ──►  data/notes.json  ──►  website (GitHub Pages)

Wrong word? ──► "Suggest a fix" ──► Action fixes the slide + adds it to data/dictionary.json
```

| Path | What it is |
|---|---|
| `index.html` | The website: library, search, slide pages, dictionary |
| `data/notes.json` | All slides |
| `data/dictionary.json` | Course terms + "misread as → actually" fixes |
| `.github/ISSUE_TEMPLATE/` | The "Add a slide" and "Fix a word" forms |
| `.github/workflows/ingest.yml` | Turns form submissions into data changes |
| `scripts/ingest.mjs` | The logic the workflow runs (no dependencies) |

## The decoder app

`src/whats-written-app.html` is the source of the **What's Written™** photo decoder (Capture → clean text → Download).
It runs as a Claude artifact, because the reading step uses the viewer's Claude account.

Share this address: **https://s1nc0de.github.io/whats-written-library/app/** (it opens the app on claude.ai).

## Offline reader (beta, no Claude, no login)

**https://s1nc0de.github.io/whats-written-library/offline/**

Reads handwriting entirely in the browser with Microsoft's open TrOCR handwriting model
(`Xenova/trocr-small-handwritten`, downloaded once and cached by the browser).
`offline/ink.js` finds the projection screen, separates pen strokes from background and solid shapes,
cuts the writing into lines and words, and the course dictionary (`data/dictionary.json`) fixes known misreads.
Add `#debug` to the address to see the pieces the model reads; `#demo` runs a sample slide.

Known limits of v0: tilted photos, very dark rooms and photos taken from far away.

## Spam protection

Submissions from the repo owner and collaborators are published automatically.
Anyone else's submission waits until a maintainer adds the **approved** label.
Add trusted classmates under *Settings → Collaborators*.

## Setup (one time)

```bash
./setup.sh <your-github-username>
```

This creates the labels and turns on GitHub Pages. The site is then at
`https://<your-github-username>.github.io/whats-written-library/`.

## Tests

```bash
node --test test/ingest.test.mjs
```

## Copyright

What's Written™ · © 2026 Jayant Singh Amethia. All rights reserved. See [LICENSE](LICENSE).
