# What's Written · Class Library

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
