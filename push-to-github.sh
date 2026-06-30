#!/bin/bash
set -e

REPO="https://github.com/edale2015/Auralyn.git"

if [ -z "$GITHUB_TOKEN" ]; then
  echo ""
  echo "Enter your GitHub token (ghp_...):"
  read -rs GITHUB_TOKEN
  echo ""
fi

REMOTE_URL="https://edale2015:${GITHUB_TOKEN}@github.com/edale2015/Auralyn.git"

git remote remove github 2>/dev/null || true
git remote add github "$REMOTE_URL"

echo "Pushing to GitHub..."
GIT_ASKPASS=/bin/true git push github main 2>&1

echo ""
echo "Done! Cleaning up credentials..."
git remote remove github
git remote add github "$REPO"
echo "Pushed successfully. Credentials removed from remote config."
