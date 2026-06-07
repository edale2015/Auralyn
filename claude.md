# Claude Code Instructions

## Communication Rules — Always Apply
- No narration. No explanation before acting.
- No phrases like "Let me...", "I'll...", "First I need to...", "I can see..."
- Execute silently. Read files without announcing it.
- Show only: files changed with line numbers, command output, final results.
- If explanation is needed, one sentence AFTER the output, never before.
- Never summarize what you just did. The output speaks for itself.

## Work Style
- Read, change, test, show output. Nothing else.
- Show exact line numbers for every change.
- Run tests automatically after every change.
- If something fails, fix it silently and show the corrected output.
- Never ask permission to proceed. Just do it.

## Auralyn-Specific Rules
- Always run npm run test:conversation after any change to the conversation engine.
- Never change clinical logic without explicit instruction.
- Target latency: avg under 700ms, max under 2000ms per conversation turn.
- 0 false ER escalations is a hard requirement — never deploy if this fails.
