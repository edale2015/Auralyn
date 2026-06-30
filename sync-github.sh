#!/bin/bash
echo ""
echo "================================"
echo "  Sync Auralyn to GitHub"
echo "================================"
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not found in Replit Secrets."
  echo ""
  echo "To fix this one time:"
  echo "  1. Go to github.com/settings/tokens/new"
  echo "  2. Check 'repo' and 'workflow' scopes, no expiration"
  echo "  3. Copy the ghp_... token"
  echo "  4. In Replit: click the lock icon (Secrets) in the sidebar"
  echo "  5. Add key=GITHUB_TOKEN, value=your token"
  echo "  6. Open a new Shell tab and run this script again"
  echo ""
  exit 1
fi

echo "Enter a short description of your changes:"
read -r MSG

if [ -z "$MSG" ]; then
  MSG="Update"
fi

git remote remove github 2>/dev/null || true
git remote add github "https://edale2015:${GITHUB_TOKEN}@github.com/edale2015/Auralyn.git"

git add -A
git commit -m "$MSG" 2>/dev/null || echo "(Nothing new to commit — pushing existing commits)"

echo "Pushing to GitHub..."
GIT_ASKPASS=/bin/true git push github main

git remote remove github
git remote add github "https://github.com/edale2015/Auralyn.git"

echo ""
echo "Done! Changes are live on GitHub."
echo ""
