#!/bin/bash
set -e

echo ""
echo "Paste your GitHub token (ghp_...) and press Enter:"
read -rs TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "No token entered. Exiting."
  exit 1
fi

REMOTE_URL="https://edale2015:${TOKEN}@github.com/edale2015/Auralyn.git"

git remote remove github 2>/dev/null || true
git remote add github "$REMOTE_URL"

echo "Pushing to GitHub..."
GIT_ASKPASS=/bin/true git push github main

echo ""
echo "Cleaning up credentials..."
git remote remove github
git remote add github "https://github.com/edale2015/Auralyn.git"
echo "Success! Your code is on GitHub."
