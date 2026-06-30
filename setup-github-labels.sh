#!/bin/bash
# Run this once to create all GitHub labels for Auralyn issue management.
# Usage: bash setup-github-labels.sh

REPO="edale2015/Auralyn"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not set in Replit Secrets."
  exit 1
fi

create_label() {
  local NAME="$1"
  local COLOR="$2"
  local DESC="$3"

  RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/$REPO/labels \
    -d "{\"name\":\"$NAME\",\"color\":\"$COLOR\",\"description\":\"$DESC\"}")

  if [ "$RESULT" = "201" ]; then
    echo "  ✅ Created: $NAME"
  elif [ "$RESULT" = "422" ]; then
    echo "  ℹ️  Already exists: $NAME"
  else
    echo "  ❌ Failed ($RESULT): $NAME"
  fi
}

echo ""
echo "Creating Auralyn GitHub labels..."
echo ""

# Agent routing labels
create_label "agent:frontend"         "0075ca" "Frontend UI changes"
create_label "agent:backend"          "e4e669" "Backend / API changes"
create_label "agent:tests"            "cfd3d7" "Test additions or fixes"
create_label "agent:clinical-review"  "d93f0b" "Requires clinical review"
create_label "agent:docs"             "0e8a16" "Documentation only"

# Safety zone labels
create_label "zone:green"   "0e8a16" "Safe to change: UI, layout, docs, logs"
create_label "zone:yellow"  "e4e669" "Caution: scoring display, non-emergency logic"
create_label "zone:red"     "d93f0b" "Danger: red flags, medication, disposition — needs Dale approval"

# Priority labels
create_label "priority:now"   "b60205" "Do this next"
create_label "priority:later" "bfd4f2" "Backlog"

echo ""
echo "Done! Labels are ready on GitHub."
echo "View them at: https://github.com/$REPO/labels"
echo ""
