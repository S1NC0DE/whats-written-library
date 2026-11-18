#!/usr/bin/env bash
# One-time setup after the repo is on GitHub. Needs the GitHub CLI (gh), logged in.
set -euo pipefail
OWNER="${1:?usage: ./setup.sh <github-username>}"
REPO="$OWNER/whats-written-library"

gh label create add-slide --repo "$REPO" --color c4532d --description "New slide for the library" --force
gh label create fix-word  --repo "$REPO" --color e2764f --description "Correction to a slide"     --force
gh label create approved  --repo "$REPO" --color 2f7d4f --description "Maintainer approved, publish it" --force

gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" 2>/dev/null \
  || gh api -X PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/"

echo "Done. Site: https://$OWNER.github.io/whats-written-library/ (first build takes about a minute)"
