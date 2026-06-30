#!/bin/bash
echo ""
echo "================================"
echo "  Sync Auralyn to GitHub"
echo "================================"
echo ""

echo "Enter a short description of your changes:"
read -r MSG

if [ -z "$MSG" ]; then
  MSG="Update"
fi

echo ""
echo "Paste your GitHub token (ghp_...) and press Enter:"
read -rs TOKEN
echo ""

if [ -z "$TOKEN" ]; then
  echo "No token entered. Exiting."
  exit 1
fi

git remote remove github 2>/dev/null || true
git remote add github "https://edale2015:${TOKEN}@github.com/edale2015/Auralyn.git"

git add -A
git commit -m "$MSG" 2>/dev/null || echo "(No new changes to commit — pushing anyway)"

echo "Pushing to GitHub..."
GIT_ASKPASS=/bin/true git push github main

git remote remove github
git remote add github "https://github.com/edale2015/Auralyn.git"

echo ""
echo "Done! Changes are live on GitHub."
echo ""
