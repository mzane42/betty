#!/bin/bash
# Opens Terminal.app with Claude Code in the poker project, primed with a session brief.
# Usage:
#   ./scripts/open-coach-terminal.sh         # opens with brief
#   ./scripts/open-coach-terminal.sh --clean # opens fresh session without prior brief

set -e
PROJECT_DIR="/Users/bubblz/poker"
BRIEF_FILE="$(mktemp -t poker-coach-brief).md"

if [[ "$1" != "--clean" ]]; then
  cd "$PROJECT_DIR"
  npx tsx src/cli/coach-brief.ts > "$BRIEF_FILE"
else
  echo "# Session vierge — pas de brief auto." > "$BRIEF_FILE"
fi

# Build the shell command that the new Terminal window will run.
# 1. cd to project (so claude picks up CLAUDE.md)
# 2. cat the brief so user sees current state
# 3. launch claude interactively with the brief piped as first message
CMD="cd '$PROJECT_DIR' && clear && cat '$BRIEF_FILE' && echo '' && echo 'Lancement Claude Code…' && claude '$(cat $BRIEF_FILE | tr '\n' ' ')'"

osascript <<EOF
tell application "Terminal"
  activate
  do script "$CMD"
end tell
EOF
