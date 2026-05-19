# Claude Code in Replit — Practical Setup & Daily Use

Claude Code is now installed on your Replit machine. This guide gets you
from "installed" to "productively replacing Replit Agent for high-stakes
work" in about 20 minutes.

---

## What Claude Code is (and isn't)

Claude Code is Anthropic's terminal-based AI coding agent. It runs in
your Replit shell, reads and edits files in your project, runs commands,
and follows the Skills you install. It is **different from Replit
Agent** — they're two separate AIs in your project. Replit Agent has
its chat panel in the Replit UI; Claude Code lives in the terminal.

For the kind of high-stakes Auralyn work I've been writing session plans
for, Claude Code is the more reliable tool because:
- Skills in `.claude/skills/` load automatically and persist across
  sessions
- It follows structured plans more rigorously
- It has a 1M-token context window and supports parallel agents
- The CLAUDE.md project-context file gives it persistent knowledge of
  your codebase

Replit Agent is still useful for quick "tweak the UI" tasks. Claude Code
is for the work that has acceptance criteria and verification commands.

---

## First-time setup (one-time, ~5 minutes)

### Step 1: Confirm install

In your Replit shell, run:

```bash
claude --version
```

You should see a version number. If you get "command not found", the
install path isn't in your shell — close and reopen the terminal, or
ask Replit support.

### Step 2: Log in

```bash
claude
```

This starts an interactive session. The first time, it'll prompt you to
authenticate. You need a paid Claude account (Pro, Max, Team,
Enterprise, or Anthropic Console) — the free Claude.ai plan doesn't
include Claude Code access. Your existing Claude subscription works.

Follow the browser prompts to authenticate. Once authenticated, you're
in.

### Step 3: Install the Auralyn skills

From your project root in the Replit shell:

```bash
# Create the skills directory if it doesn't exist
mkdir -p .claude/skills

# Copy the 6 skills from the previous package into it
# (assuming you've downloaded the auralyn-skills folder to your Replit)
cp -r auralyn-skills/auralyn-* .claude/skills/

# Verify they're discoverable
ls -la .claude/skills/
# expect: 6 directories, each with a SKILL.md inside
```

### Step 4: Generate the project CLAUDE.md

This is the single most important file. It's the persistent context
Claude Code loads at every session start. Inside a `claude` session,
run:

```
/init
```

Claude Code will scan your project and propose a starter `CLAUDE.md`.
**Review it carefully before accepting** — it should reflect your real
architecture (TypeScript, multi-tenant, RLS, BullMQ, S3 audit chain,
the context engineering module). If it misses things, edit them in
manually.

A good Auralyn CLAUDE.md is 50–100 lines. Include:
- The 13-step pipeline overview
- The tiered context model (immutables/working/artifacts/trace)
- Where things live (`server/context/`, `server/clinical/`,
  `server/routes/`, `client/src/pages/`)
- Build & test commands (`npm run dev`, `npm test`,
  `npx tsc --noEmit`)
- The hard rule: never bypass RLS, never modify red flags, never use
  LLM-based compaction

---

## Daily use

### Starting a session

```bash
# In your project root
claude
```

This drops you into an interactive prompt. Claude Code has read your
CLAUDE.md and knows your skills are available.

### One-shot commands

For a single task without entering the interactive prompt:

```bash
claude "run V001 verification against real KB and paste exact output"
```

Useful for scripted or scheduled runs.

### The /plan mode

For any high-stakes change (pipeline edits, RLS modifications, anything
touching `clinical_memory`), use plan mode. Inside a session:

```
/plan I want to wire writeTenantProtocol to a new admin UI
```

Claude Code produces a plan first. You review and approve before any
file edits happen. This is the equivalent of the session-plan format
we've been using with Replit Agent, but with built-in approval gates.

### Sandbox to your project folder

**Important safety note:** Claude Code can read and edit any file in
the working directory it was started from. Always start it from your
project root, never from your home directory. It cannot see things
above the working directory.

### Useful built-in commands inside a session

| Command | What it does |
|---------|--------------|
| `/init` | Generate or update CLAUDE.md |
| `/plan <task>` | Produce a plan before executing |
| `/clear` | Reset the conversation context |
| `/cost` | Show token usage for this session |
| `/help` | List all available commands |
| `/bug` | Report a bug to Anthropic |

### Exiting

`Ctrl+C` twice, or type `exit`.

---

## How Skills work with Claude Code (matters for Auralyn)

At session start, Claude Code reads the YAML frontmatter
(`name` + `description`) of every skill in `.claude/skills/`. That's
~50 tokens per skill — negligible. The full body of each skill is only
loaded when your conversation triggers it.

For Auralyn, this means:

- The moment you say "session plan", the `auralyn-session-plan` skill
  body loads
- The moment you say "context manager" or "artifact bus", the
  `auralyn-context-engineering` skill body loads
- The moment you finish a task and write a status update, the
  `auralyn-no-fudging` skill body loads and reminds Claude Code about
  the failure modes to avoid

You don't invoke skills by name. The descriptions in the YAML are what
trigger them. If you find a skill loading too often or not enough, edit
its `description:` line.

---

## When to use Claude Code vs. Replit Agent

| Task | Better tool |
|------|-------------|
| Write a session plan for a new feature | **Claude Code** with `/plan` |
| Fix a typo or rename a variable | Replit Agent (faster) |
| Wire a new memory writer to its UI trigger | **Claude Code** |
| Tweak a button color or label | Replit Agent |
| Run V001 verification and produce honest report | **Claude Code** |
| Refactor `unifiedClinicalPipeline.ts` | **Claude Code** with `/plan` |
| Generate a quick utility script | Either |
| Audit completed work against acceptance criteria | **Claude Code** |
| Multi-file change with safety implications | **Claude Code** |

When in doubt for Auralyn: Claude Code.

---

## Daily workflow recommendation

1. Open Replit, navigate to the terminal tab.
2. `cd` to your project root if not already there.
3. `claude` to start a session.
4. State your goal in plain English. If it's high-stakes, prefix with
   `/plan`.
5. Review and approve the plan.
6. Watch the work happen, intervene if it veers.
7. When complete, ask for the verification commands to be run and
   output pasted (the `auralyn-no-fudging` skill enforces this).

---

## When things go sideways

| Symptom | Fix |
|---------|-----|
| "Command not found: claude" | PATH issue — close/reopen terminal |
| Authentication keeps failing | Confirm your Claude account has a paid plan |
| Skills not loading | `ls .claude/skills/<skill>/SKILL.md` to confirm structure |
| Claude Code making things worse | Use `/clear` and restart with `/plan` |
| Token budget exhausted | Quotas reset on a rolling 5-hour window; wait |
| Wrong skill triggering | Edit that skill's `description:` line to be more specific |

For more, run `claude doctor` from the shell — it diagnoses
installation and config issues.

---

## What you should do RIGHT NOW (in order)

1. Run `claude --version` to confirm install
2. Run `claude` and authenticate
3. From inside the session, run `/init` to generate CLAUDE.md
4. Edit CLAUDE.md to add Auralyn-specific facts (or ask Claude Code to
   read the `auralyn-context-engineering` skill and improve it)
5. Verify your skills loaded: ask Claude Code "what skills do you have
   available for Auralyn?"
6. Test with a low-stakes task: ask Claude Code to run V001
   verification and paste the output

Once those six steps work, you have a reliable second AI in your
Replit project that knows your architecture, your conventions, and the
failure modes to avoid.
